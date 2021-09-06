import * as cacheGradleUserHome from './cache-gradle-user-home'
import * as cacheProjectDotGradle from './cache-project-dot-gradle'
import * as core from '@actions/core'
import {isCacheReadEnabled, isCacheSaveEnabled} from './cache-utils'

const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'

export async function restore(buildRootDirectory: string): Promise<void> {
    if (!isCacheReadEnabled('gradle')) {
        core.debug('Cache read disabled')
        return
    }

    core.startGroup('Restore Gradle state from cache')
    await cacheGradleUserHome.restore()
    core.saveState(BUILD_ROOT_DIR, buildRootDirectory)
    await cacheProjectDotGradle.restore(buildRootDirectory)
    core.endGroup()
}

export async function save(): Promise<void> {
    if (!isCacheSaveEnabled('gradle')) {
        core.debug('Cache save disabled')
        return
    }

    core.startGroup('Caching Gradle state')
    await cacheGradleUserHome.save()
    const buildRootDirectory = core.getState(BUILD_ROOT_DIR)
    await cacheProjectDotGradle.save(buildRootDirectory)
    core.endGroup()
}
