import {GradleUserHomeCache} from './cache-gradle-user-home'
import {ProjectDotGradleCache} from './cache-project-dot-gradle'
import * as core from '@actions/core'
import {isCacheReadEnabled, isCacheSaveEnabled} from './cache-utils'

const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'

export async function restore(buildRootDirectory: string): Promise<void> {
    if (!isCacheReadEnabled('gradle')) {
        core.debug('Cache read disabled')
        return
    }

    await core.group('Restore Gradle state from cache', async () => {
        core.saveState(BUILD_ROOT_DIR, buildRootDirectory)
        return Promise.all([
            new GradleUserHomeCache().restore(),
            new ProjectDotGradleCache(buildRootDirectory).restore()
        ])
    })
}

export async function save(): Promise<void> {
    if (!isCacheSaveEnabled('gradle')) {
        core.debug('Cache save disabled')
        return
    }

    await core.group('Caching Gradle state', async () => {
        const buildRootDirectory = core.getState(BUILD_ROOT_DIR)
        return Promise.all([
            new GradleUserHomeCache().save(),
            new ProjectDotGradleCache(buildRootDirectory).save()
        ])
    })
}
