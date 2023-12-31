import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as path from 'path'
import * as os from 'os'
import * as caches from './caches'
import * as layout from './repository-layout'
import * as params from './input-params'
import * as dependencyGraph from './dependency-graph'
import * as jobSummary from './job-summary'

import {loadBuildResults} from './build-results'
import {CacheListener} from './cache-reporting'
import {DaemonController} from './daemon-controller'

const GRADLE_SETUP_VAR = 'GRADLE_BUILD_ACTION_SETUP_COMPLETED'
const GRADLE_USER_HOME = 'GRADLE_USER_HOME'
const CACHE_LISTENER = 'CACHE_LISTENER'

export async function setup(): Promise<void> {
    const gradleUserHome = await determineGradleUserHome()

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

    await dependencyGraph.setup(params.getDependencyGraphOption())
}

export async function complete(): Promise<void> {
    if (!core.getState(GRADLE_SETUP_VAR)) {
        core.info('Gradle setup post-action only performed for first gradle-build-action step in workflow.')
        return
    }
    core.info('In post-action step')

    const buildResults = loadBuildResults()

    const gradleUserHome = core.getState(GRADLE_USER_HOME)
    const cacheListener: CacheListener = CacheListener.rehydrate(core.getState(CACHE_LISTENER))
    const daemonController = new DaemonController(buildResults)

    await caches.save(gradleUserHome, cacheListener, daemonController)

    await jobSummary.generateJobSummary(buildResults, cacheListener)

    await dependencyGraph.complete(params.getDependencyGraphOption())

    core.info('Completed post-action step')
}

async function determineGradleUserHome(): Promise<string> {
    const customGradleUserHome = process.env['GRADLE_USER_HOME']
    if (customGradleUserHome) {
        const rootDir = layout.workspaceDirectory()
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
