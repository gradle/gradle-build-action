import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as github from '@actions/github'
import {CacheListener} from './cache-reporting'
import {isCacheDebuggingEnabled, getCacheKeyPrefix, hashStrings, handleCacheFailure} from './cache-utils'

const CACHE_PROTOCOL_VERSION = 'v5-'
const JOB_CONTEXT_PARAMETER = 'workflow-job-context'

/**
 * Represents a key used to restore a cache entry.
 * The Github Actions cache will first try for an exact match on the key.
 * If that fails, it will try for a prefix match on any of the restoreKeys.
 */
class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
    }
}

/**
 * Generates a cache key specific to the current job execution.
 * The key is constructed from the following inputs:
 * - A user-defined prefix (optional)
 * - The cache protocol version
 * - The name of the cache
 * - The runner operating system
 * - The name of the Job being executed
 * - The matrix values for the Job being executed (job context)
 * - The SHA of the commit being executed
 *
 * Caches are restored by trying to match the these key prefixes in order:
 * - The full key with SHA
 * - A previous key for this Job + matrix
 * - Any previous key for this Job (any matrix)
 * - Any previous key for this cache on the current OS
 */
function generateCacheKey(cacheName: string): CacheKey {
    const cacheKeyBase = `${getCacheKeyPrefix()}${CACHE_PROTOCOL_VERSION}${cacheName}`

    // At the most general level, share caches for all executions on the same OS
    const runnerOs = process.env['RUNNER_OS'] || ''
    const cacheKeyForOs = `${cacheKeyBase}|${runnerOs}`

    // Prefer caches that run this job
    const cacheKeyForJob = `${cacheKeyForOs}|${github.context.job}`

    // Prefer (even more) jobs that run this job with the same context (matrix)
    const cacheKeyForJobContext = `${cacheKeyForJob}[${determineJobContext()}]`

    // Exact match on Git SHA
    const cacheKey = `${cacheKeyForJobContext}-${github.context.sha}`

    return new CacheKey(cacheKey, [cacheKeyForJobContext, cacheKeyForJob, cacheKeyForOs])
}

function determineJobContext(): string {
    // By default, we hash the full `matrix` data for the run, to uniquely identify this job invocation
    // The only way we can obtain the `matrix` data is via the `workflow-job-context` parameter in action.yml.
    const workflowJobContext = core.getInput(JOB_CONTEXT_PARAMETER)
    return hashStrings([workflowJobContext])
}

export abstract class AbstractCache {
    private cacheName: string
    private cacheDescription: string
    private cacheKeyStateKey: string
    private cacheResultStateKey: string

    protected readonly cacheDebuggingEnabled: boolean

    constructor(cacheName: string, cacheDescription: string) {
        this.cacheName = cacheName
        this.cacheDescription = cacheDescription
        this.cacheKeyStateKey = `CACHE_KEY_${cacheName}`
        this.cacheResultStateKey = `CACHE_RESULT_${cacheName}`
        this.cacheDebuggingEnabled = isCacheDebuggingEnabled()
    }

    /**
     * Restores the cache entry, finding the closest match to the currently running job.
     */
    async restore(listener: CacheListener): Promise<void> {
        const entryListener = listener.entry(this.cacheDescription)

        const cacheKey = this.prepareCacheKey()

        this.debug(
            `Requesting ${this.cacheDescription} with
    key:${cacheKey.key}
    restoreKeys:[${cacheKey.restoreKeys}]`
        )

        const cacheResult = await this.restoreCache(this.getCachePath(), cacheKey.key, cacheKey.restoreKeys)
        entryListener.markRequested(cacheKey.key, cacheKey.restoreKeys)

        if (!cacheResult) {
            core.info(`${this.cacheDescription} cache not found. Will initialize empty.`)
            return
        }

        core.saveState(this.cacheResultStateKey, cacheResult.key)
        entryListener.markRestored(cacheResult.key, cacheResult.size)

        core.info(`Restored ${this.cacheDescription} from cache key: ${cacheResult.key}`)

        try {
            await this.afterRestore(listener)
        } catch (error) {
            core.warning(`Restore ${this.cacheDescription} failed in 'afterRestore': ${error}`)
        }
    }

    prepareCacheKey(): CacheKey {
        const cacheKey = generateCacheKey(this.cacheName)
        core.saveState(this.cacheKeyStateKey, cacheKey.key)
        return cacheKey
    }

    protected async restoreCache(
        cachePath: string[],
        cacheKey: string,
        cacheRestoreKeys: string[] = []
    ): Promise<cache.CacheEntry | undefined> {
        try {
            return await cache.restoreCache(cachePath, cacheKey, cacheRestoreKeys)
        } catch (error) {
            handleCacheFailure(error, `Failed to restore ${cacheKey}`)
            return undefined
        }
    }

    protected async afterRestore(_listener: CacheListener): Promise<void> {}

    /**
     * Saves the cache entry based on the current cache key unless the cache was restored with the exact key,
     * in which case we cannot overwrite it.
     *
     * If the cache entry was restored with a partial match on a restore key, then
     * it is saved with the exact key.
     */
    async save(listener: CacheListener): Promise<void> {
        // Retrieve the state set in the previous 'restore' step.
        const cacheKeyFromRestore = core.getState(this.cacheKeyStateKey)
        const cacheResultFromRestore = core.getState(this.cacheResultStateKey)

        if (cacheResultFromRestore && cacheKeyFromRestore === cacheResultFromRestore) {
            core.info(`Cache hit occurred on the cache key ${cacheKeyFromRestore}, not saving cache.`)
            return
        }

        try {
            await this.beforeSave(listener)
        } catch (error) {
            core.warning(`Save ${this.cacheDescription} failed in 'beforeSave': ${error}`)
            return
        }

        core.info(`Caching ${this.cacheDescription} with cache key: ${cacheKeyFromRestore}`)
        const cachePath = this.getCachePath()
        const savedEntry = await this.saveCache(cachePath, cacheKeyFromRestore)

        if (savedEntry) {
            listener.entry(this.cacheDescription).markSaved(savedEntry.key, savedEntry.size)
        }

        return
    }

    protected async beforeSave(_listener: CacheListener): Promise<void> {}

    protected async saveCache(cachePath: string[], cacheKey: string): Promise<cache.CacheEntry | undefined> {
        try {
            return await cache.saveCache(cachePath, cacheKey)
        } catch (error) {
            handleCacheFailure(error, `Failed to save cache entry ${cacheKey}`)
        }
        return undefined
    }

    protected debug(message: string): void {
        if (this.cacheDebuggingEnabled) {
            core.info(message)
        } else {
            core.debug(message)
        }
    }

    protected abstract getCachePath(): string[]
}
