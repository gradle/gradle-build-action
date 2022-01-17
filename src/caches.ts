import * as core from '@actions/core'
import {isCacheDisabled, isCacheReadOnly} from './cache-utils'
import {logCachingReport, CacheListener} from './cache-reporting'
import {GradleStateCache} from './cache-base'

const CACHE_RESTORED_VAR = 'GRADLE_BUILD_ACTION_CACHE_RESTORED'
const GRADLE_USER_HOME = 'GRADLE_USER_HOME'
const CACHE_LISTENER = 'CACHE_LISTENER'

export async function restore(gradleUserHome: string): Promise<void> {
    // Only restore cache on first action step in workflow.
    if (process.env[CACHE_RESTORED_VAR]) {
        core.info('Cache only restored on first action step.')
        return
    }
    core.exportVariable(CACHE_RESTORED_VAR, true)

    // Initialize the Gradle User Home even when caching is disabled.
    const gradleStateCache = new GradleStateCache(gradleUserHome)
    gradleStateCache.init()

    if (isCacheDisabled()) {
        core.info('Cache is disabled: will not restore state from previous builds.')
        return
    }

    await core.group('Restore Gradle state from cache', async () => {
        core.saveState(GRADLE_USER_HOME, gradleUserHome)

        const cacheListener = new CacheListener()
        await gradleStateCache.restore(cacheListener)

        core.saveState(CACHE_LISTENER, cacheListener.stringify())
    })

    // Export state that is detected in corresponding post-action step
    core.saveState(CACHE_RESTORED_VAR, true)
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
        const gradleUserHome = core.getState(GRADLE_USER_HOME)
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
        core.info('Cache will only be saved in final post-action step.')
        return false
    }

    return true
}
