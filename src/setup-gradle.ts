import * as core from '@actions/core'
import * as path from 'path'
import * as os from 'os'
import * as caches from './caches'
import {CacheListener} from './cache-reporting'
import {writeJobSummary} from './job-summary'

const GRADLE_SETUP_VAR = 'GRADLE_BUILD_ACTION_SETUP_COMPLETED'
const GRADLE_USER_HOME = 'GRADLE_USER_HOME'
const CACHE_LISTENER = 'CACHE_LISTENER'

export async function setup(buildRootDirectory: string): Promise<void> {
    const gradleUserHome = determineGradleUserHome(buildRootDirectory)

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
    core.info('Inside setupGradle.complete()')
    if (!core.getState(GRADLE_SETUP_VAR)) {
        core.info('Gradle setup post-action only performed for first gradle-build-action step in workflow.')
        return
    }

    core.info('In final post-action step, saving state and writing summary')
    const cacheListener: CacheListener = CacheListener.rehydrate(core.getState(CACHE_LISTENER))

    const gradleUserHome = core.getState(GRADLE_USER_HOME)
    await caches.save(gradleUserHome, cacheListener)

    writeJobSummary(cacheListener)
}

function determineGradleUserHome(rootDir: string): string {
    const customGradleUserHome = process.env['GRADLE_USER_HOME']
    if (customGradleUserHome) {
        return path.resolve(rootDir, customGradleUserHome)
    }

    return path.resolve(os.homedir(), '.gradle')
}
