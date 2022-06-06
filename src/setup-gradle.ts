import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as caches from './caches'

import {CacheListener} from './cache-reporting'
import {BuildResult, loadBuildResults, writeJobSummary} from './job-summary'

const GRADLE_SETUP_VAR = 'GRADLE_BUILD_ACTION_SETUP_COMPLETED'
const GRADLE_USER_HOME = 'GRADLE_USER_HOME'
const CACHE_LISTENER = 'CACHE_LISTENER'
const JOB_SUMMARY_ENABLED_PARAMETER = 'generate-job-summary'

function shouldGenerateJobSummary(): boolean {
    return core.getBooleanInput(JOB_SUMMARY_ENABLED_PARAMETER)
}

export async function setup(buildRootDirectory: string): Promise<void> {
    const gradleUserHome = await determineGradleUserHome(buildRootDirectory)

    // Bypass setup on all but first action step in workflow.
    if (process.env[GRADLE_SETUP_VAR]) {
        core.info('Gradle setup only performed on first gradle-build-action step in workflow.')
        return
    }
    // Record setup complete: visible to all subsequent actions and prevents duplicate setup
    core.exportVariable(GRADLE_SETUP_VAR, true)
    // Record setup complete: visible in post-action, to control action completion
    core.saveState(GRADLE_SETUP_VAR, true)

    // Save the Gradle User Home for use in the post-action step.
    core.saveState(GRADLE_USER_HOME, gradleUserHome)

    const cacheListener = new CacheListener()
    await caches.restore(gradleUserHome, cacheListener)

    core.saveState(CACHE_LISTENER, cacheListener.stringify())
}

export async function complete(): Promise<void> {
    if (!core.getState(GRADLE_SETUP_VAR)) {
        core.info('Gradle setup post-action only performed for first gradle-build-action step in workflow.')
        return
    }

    const buildResults = loadBuildResults()

    core.info('Stopping all Gradle daemons')
    await stopAllDaemons(getUniqueGradleHomes(buildResults))

    core.info('In final post-action step, saving state and writing summary')
    const cacheListener: CacheListener = CacheListener.rehydrate(core.getState(CACHE_LISTENER))

    const gradleUserHome = core.getState(GRADLE_USER_HOME)
    await caches.save(gradleUserHome, cacheListener)

    if (shouldGenerateJobSummary()) {
        writeJobSummary(buildResults, cacheListener)
    }
}

async function determineGradleUserHome(rootDir: string): Promise<string> {
    const customGradleUserHome = process.env['GRADLE_USER_HOME']
    if (customGradleUserHome) {
        return path.resolve(rootDir, customGradleUserHome)
    }

    return path.resolve(await determineUserHome(), '.gradle')
}

/**
 * Different values can be returned by os.homedir() in Javascript and System.getProperty('user.home') in Java.
 * In order to determine the correct Gradle User Home, we ask Java for the user home instead of using os.homedir().
 */
async function determineUserHome(): Promise<string> {
    const output = await exec.getExecOutput('java', ['-XshowSettings:properties', '-version'], {silent: true})
    const regex = /user\.home = (\S*)/i
    const found = output.stderr.match(regex)
    if (found == null || found.length <= 1) {
        core.info('Could not determine user.home from java -version output. Using os.homedir().')
        return os.homedir()
    }
    const userHome = found[1]
    core.debug(`Determined user.home from java -version output: '${userHome}'`)
    return userHome
}

function getUniqueGradleHomes(buildResults: BuildResult[]): string[] {
    const gradleHomes = buildResults.map(buildResult => buildResult.gradleHomeDir)
    return Array.from(new Set(gradleHomes))
}

async function stopAllDaemons(gradleHomes: string[]): Promise<void> {
    const executions: Promise<number>[] = []
    const args = ['--stop']

    for (const gradleHome of gradleHomes) {
        const executable = path.resolve(gradleHome, 'bin', 'gradle')
        if (!fs.existsSync(executable)) {
            core.warning(`Gradle executable not found at ${executable}. Could not stop Gradle daemons.`)
            continue
        }
        core.info(`Stopping Gradle daemons in ${gradleHome}`)
        executions.push(
            exec.exec(executable, args, {
                ignoreReturnCode: true
            })
        )
    }
    await Promise.all(executions)
}
