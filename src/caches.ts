import * as core from '@actions/core'
import {isCacheDisabled, isCacheReadOnly, isCacheWriteOnly} from './cache-utils'
import {CacheListener} from './cache-reporting'
import {GradleStateCache} from './cache-base'

const CACHE_RESTORED_VAR = 'GRADLE_BUILD_ACTION_CACHE_RESTORED'

export async function restore(gradleUserHome: string, cacheListener: CacheListener): Promise<void> {
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
        cacheListener.isCacheDisabled = true
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
        cacheListener.isCacheWriteOnly = true
        return
    }

    await core.group('Restore Gradle state from cache', async () => {
        await gradleStateCache.restore(cacheListener)
    })
}

export async function save(gradleUserHome: string, cacheListener: CacheListener): Promise<void> {
    if (!shouldSaveCaches()) {
        return
    }

    if (isCacheReadOnly()) {
        core.info('Cache is read-only: will not save state for use in subsequent builds.')
        cacheListener.isCacheReadOnly = true
        return
    }

    await core.group('Caching Gradle state', async () => {
        return new GradleStateCache(gradleUserHome).save(cacheListener)
    })
}

export function shouldSaveCaches(): boolean {
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
