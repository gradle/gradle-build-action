import * as cacheGradleUserHome from './cache-gradle-user-home'
import * as cacheProjectDotGradle from './cache-project-dot-gradle'
import * as core from '@actions/core'

const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'

export async function restore(buildRootDirectory: string): Promise<void> {
    core.startGroup('Restore Gradle User Home from cache')
    await cacheGradleUserHome.restore()
    core.endGroup()

    core.startGroup('Restore project .gradle directory from cache')
    core.saveState(BUILD_ROOT_DIR, buildRootDirectory)
    await cacheProjectDotGradle.restore(buildRootDirectory)
    core.endGroup()
}

export async function save(): Promise<void> {
    core.startGroup('Cache Gradle User Home')
    await cacheGradleUserHome.save()
    core.endGroup()

    core.startGroup('Cache project .gradle directory')
    const buildRootDirectory = core.getState(BUILD_ROOT_DIR)
    await cacheProjectDotGradle.save(buildRootDirectory)
    core.endGroup()
}
