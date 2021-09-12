import {GradleUserHomeCache} from './cache-gradle-user-home'
import {ProjectDotGradleCache} from './cache-project-dot-gradle'
import * as core from '@actions/core'
import {isCacheDisabled, isCacheReadOnly} from './cache-utils'

const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'

export async function restore(buildRootDirectory: string): Promise<void> {
    if (isCacheDisabled()) {
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
    if (isCacheReadOnly()) {
        core.debug('Cache is read-only: not saving cache entry')
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
