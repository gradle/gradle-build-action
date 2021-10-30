import {GradleUserHomeCache} from './cache-gradle-user-home'
import {ProjectDotGradleCache} from './cache-project-dot-gradle'
import * as core from '@actions/core'
import {CachingReport, isCacheDisabled, isCacheReadOnly} from './cache-utils'

const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'

export async function restore(buildRootDirectory: string): Promise<void> {
    if (isCacheDisabled()) {
        core.info('Cache is disabled: will not restore state from previous builds.')
        return
    }

    await core.group('Restore Gradle state from cache', async () => {
        core.saveState(BUILD_ROOT_DIR, buildRootDirectory)

        const cachingReport = new CachingReport()

        await new GradleUserHomeCache(buildRootDirectory).restore(cachingReport)

        const projectDotGradleCache = new ProjectDotGradleCache(buildRootDirectory)
        if (cachingReport.fullyRestored) {
            // Only restore the configuration-cache if the Gradle Home is fully restored
            await projectDotGradleCache.restore(cachingReport)
        } else {
            // Otherwise, prepare the cache key for later save()
            projectDotGradleCache.prepareCacheKey()
        }
    })
}

export async function save(): Promise<void> {
    if (isCacheReadOnly()) {
        core.info('Cache is read-only: will not save state for use in subsequent builds.')
        return
    }

    await core.group('Caching Gradle state', async () => {
        const buildRootDirectory = core.getState(BUILD_ROOT_DIR)
        return Promise.all([
            new GradleUserHomeCache(buildRootDirectory).save(),
            new ProjectDotGradleCache(buildRootDirectory).save()
        ])
    })
}
