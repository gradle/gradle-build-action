import * as cacheGradleUserHome from './cache-gradle-user-home'
import * as cacheProjectDotGradle from './cache-project-dot-gradle'
import * as core from '@actions/core'

const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'

export async function restore(buildRootDirectory: string): Promise<void> {
    core.saveState(BUILD_ROOT_DIR, buildRootDirectory)

    await cacheGradleUserHome.restore()
    await cacheProjectDotGradle.restore(buildRootDirectory)
}

export async function save(): Promise<void> {
    const buildRootDirectory = core.getState(BUILD_ROOT_DIR)

    await cacheGradleUserHome.save()
    await cacheProjectDotGradle.save(buildRootDirectory)
}
