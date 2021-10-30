import {GradleUserHomeCache} from './cache-gradle-user-home'
import {ProjectDotGradleCache} from './cache-project-dot-gradle'
import * as core from '@actions/core'
import {isCacheDisabled, isCacheReadOnly} from './cache-utils'
import {CachingReport} from './cache-base'

const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'
const CACHING_REPORT = 'CACHING_REPORT'

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
            core.info('Gradle Home cache not fully restored: not restoring configuration-cache state')
            projectDotGradleCache.prepareCacheKey()
        }

        core.saveState(CACHING_REPORT, cachingReport.stringify())
    })
}

export async function save(): Promise<void> {
    if (isCacheReadOnly()) {
        core.info('Cache is read-only: will not save state for use in subsequent builds.')
        return
    }

    const cachingReport: CachingReport = CachingReport.rehydrate(core.getState(CACHING_REPORT))

    await core.group('Caching Gradle state', async () => {
        const buildRootDirectory = core.getState(BUILD_ROOT_DIR)
        return Promise.all([
            new GradleUserHomeCache(buildRootDirectory).save(cachingReport),
            new ProjectDotGradleCache(buildRootDirectory).save(cachingReport)
        ])
    })

    logCachingReport(cachingReport)
}

function logCachingReport(report: CachingReport): void {
    core.info(JSON.stringify(report, null, 2))
}
