import * as core from '@actions/core'
import {isCacheDisabled, isCacheReadOnly, isCacheWriteOnly} from './cache-utils'
import {logCachingReport, CacheListener} from './cache-reporting'
import {GradleStateCache} from './cache-base'

const CACHE_RESTORED_VAR = 'GRADLE_BUILD_ACTION_CACHE_RESTORED'
const CACHE_LISTENER = 'CACHE_LISTENER'

export async function restore(gradleUserHome: string): Promise<void> {
    // Bypass restore cache on all but first action step in workflow.
    if (process.env[CACHE_RESTORED_VAR]) {
        core.info('Cache only restored on first action step.')
        return
    }
    core.exportVariable(CACHE_RESTORED_VAR, true)

    const gradleStateCache = new GradleStateCache(gradleUserHome)

    if (isCacheDisabled()) {
        core.info('Cache is disabled: will not restore state from previous builds.')
        // Initialize the Gradle User Home even when caching is disabled.
        gradleStateCache.init()
        return
    }

    if (gradleStateCache.cacheOutputExists()) {
        core.info('Gradle User Home already exists: will not restore from cache.')
        // Initialize pre-existing Gradle User Home.
        gradleStateCache.init()
        return
    }

    gradleStateCache.init()
    // Mark the state as restored so that post-action will perform save.
    core.saveState(CACHE_RESTORED_VAR, true)

    if (isCacheWriteOnly()) {
        core.info('Cache is write-only: will not restore from cache.')
        return
    }

    await core.group('Restore Gradle state from cache', async () => {
        const cacheListener = new CacheListener()
        await gradleStateCache.restore(cacheListener)

        core.saveState(CACHE_LISTENER, cacheListener.stringify())
    })
}

export async function save(gradleUserHome: string): Promise<void> {
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
        return new GradleStateCache(gradleUserHome).save(cacheListener)
    })

    logCachingReport(cacheListener)
}

function shouldSaveCaches(): boolean {
    if (isCacheDisabled()) {
        core.info('Cache is disabled: will not save state for later builds.')
        return false
    }

    if (!core.getState(CACHE_RESTORED_VAR)) {
        core.info('Cache will not be saved: not restored in main action step.')
        return false
    }

    return true
}
