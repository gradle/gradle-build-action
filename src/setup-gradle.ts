import * as core from '@actions/core'
import * as path from 'path'
import * as os from 'os'
import * as caches from './caches'

const GRADLE_SETUP_VAR = 'GRADLE_BUILD_ACTION_SETUP_COMPLETED'
const GRADLE_USER_HOME = 'GRADLE_USER_HOME'

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

    await caches.restore(gradleUserHome)
}

export async function complete(): Promise<void> {
    if (!core.getState(GRADLE_SETUP_VAR)) {
        core.info('Gradle setup post-action only performed for first gradle-build-action step in workflow.')
        return
    }

    const gradleUserHome = core.getState(GRADLE_USER_HOME)
    await caches.save(gradleUserHome)
}

function determineGradleUserHome(rootDir: string): string {
    const customGradleUserHome = process.env['GRADLE_USER_HOME']
    if (customGradleUserHome) {
        return path.resolve(rootDir, customGradleUserHome)
    }

    return path.resolve(os.homedir(), '.gradle')
}
