import * as core from '@actions/core'
import {GradleUserHomeCache} from './cache-gradle-user-home'
import {ProjectDotGradleCache} from './cache-project-dot-gradle'
import {isCacheDisabled, isCacheReadOnly} from './cache-utils'
import {logCachingReport, CacheListener} from './cache-reporting'

const CACHE_RESTORED_VAR = 'GRADLE_BUILD_ACTION_CACHE_RESTORED'
const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'
const CACHE_LISTENER = 'CACHE_LISTENER'

export async function restore(buildRootDirectory: string): Promise<void> {
    if (!shouldRestoreCaches()) {
        return
    }

    const gradleUserHomeCache = new GradleUserHomeCache(buildRootDirectory)
    const projectDotGradleCache = new ProjectDotGradleCache(buildRootDirectory)

    gradleUserHomeCache.init()

    await core.group('Restore Gradle state from cache', async () => {
        core.saveState(BUILD_ROOT_DIR, buildRootDirectory)

        const cacheListener = new CacheListener()
        await gradleUserHomeCache.restore(cacheListener)

        if (cacheListener.fullyRestored) {
            // Only restore the configuration-cache if the Gradle Home is fully restored
            await projectDotGradleCache.restore(cacheListener)
        } else {
            // Otherwise, prepare the cache key for later save()
            core.info('Gradle Home cache not fully restored: not restoring configuration-cache state')
            projectDotGradleCache.prepareCacheKey()
        }

        core.saveState(CACHE_LISTENER, cacheListener.stringify())
    })
}

export async function save(): Promise<void> {
    if (!shouldSaveCaches()) {
        return
    }

    const cacheListener: CacheListener = CacheListener.rehydrate(core.getState(CACHE_LISTENER))

    if (isCacheReadOnly()) {
        core.info('Cache is read-only: will not save state for use in subsequent builds.')
        logCachingReport(cacheListener)
        return
    }

    await core.group('Caching Gradle state', async () => {
        const buildRootDirectory = core.getState(BUILD_ROOT_DIR)
        return Promise.all([
            new GradleUserHomeCache(buildRootDirectory).save(cacheListener),
            new ProjectDotGradleCache(buildRootDirectory).save(cacheListener)
        ])
    })

    logCachingReport(cacheListener)
}

function shouldRestoreCaches(): boolean {
    if (isCacheDisabled()) {
        core.info('Cache is disabled: will not restore state from previous builds.')
        return false
    }

    if (process.env[CACHE_RESTORED_VAR]) {
        core.info('Cache only restored on first action step.')
        return false
    }

    // Export var that is detected in all later restore steps
    core.exportVariable(CACHE_RESTORED_VAR, true)
    // Export state that is detected in corresponding post-action step
    core.saveState(CACHE_RESTORED_VAR, true)
    return true
}

function shouldSaveCaches(): boolean {
    if (isCacheDisabled()) {
        core.info('Cache is disabled: will not save state for later builds.')
        return false
    }

    if (!core.getState(CACHE_RESTORED_VAR)) {
        core.info('Cache will only be saved in final post-action step.')
        return false
    }

    return true
}
