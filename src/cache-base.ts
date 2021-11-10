import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as github from '@actions/github'
import {isCacheDebuggingEnabled, getCacheKeyPrefix, hashStrings, handleCacheFailure} from './cache-utils'

const CACHE_PROTOCOL_VERSION = 'v4-'
const JOB_CONTEXT_PARAMETER = 'workflow-job-context'

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
    const workflowJobContext = core.getInput(JOB_CONTEXT_PARAMETER)
    return hashStrings([workflowJobContext])
}

class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
    }
}

export class CacheListener {
    cacheEntries: CacheEntryListener[] = []

    get fullyRestored(): boolean {
        return this.cacheEntries.every(x => !x.wasRequestedButNotRestored())
    }

    entry(name: string): CacheEntryListener {
        for (const entry of this.cacheEntries) {
            if (entry.entryName === name) {
                return entry
            }
        }

        const newEntry = new CacheEntryListener(name)
        this.cacheEntries.push(newEntry)
        return newEntry
    }

    stringify(): string {
        return JSON.stringify(this)
    }

    static rehydrate(stringRep: string): CacheListener {
        const rehydrated: CacheListener = Object.assign(new CacheListener(), JSON.parse(stringRep))
        const entries = rehydrated.cacheEntries
        for (let index = 0; index < entries.length; index++) {
            const rawEntry = entries[index]
            entries[index] = Object.assign(new CacheEntryListener(rawEntry.entryName), rawEntry)
        }
        return rehydrated
    }
}

export class CacheEntryListener {
    entryName: string
    requestedKey: string | undefined
    requestedRestoreKeys: string[] | undefined
    restoredKey: string | undefined
    restoredSize: number | undefined

    savedKey: string | undefined
    savedSize: number | undefined

    constructor(entryName: string) {
        this.entryName = entryName
    }

    wasRequestedButNotRestored(): boolean {
        return this.requestedKey !== undefined && this.restoredKey === undefined
    }

    markRequested(key: string, restoreKeys: string[] = []): CacheEntryListener {
        this.requestedKey = key
        this.requestedRestoreKeys = restoreKeys
        return this
    }

    markRestored(key: string, size: number | undefined): CacheEntryListener {
        this.restoredKey = key
        this.restoredSize = size
        return this
    }

    markSaved(key: string, size: number | undefined): CacheEntryListener {
        this.savedKey = key
        this.savedSize = size
        return this
    }
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

    async restore(listener: CacheListener): Promise<void> {
        if (this.cacheOutputExists()) {
            core.info(`${this.cacheDescription} already exists. Not restoring from cache.`)
            return
        }

        const cacheKey = this.prepareCacheKey()
        const entryReport = listener.entry(this.cacheDescription)
        entryReport.markRequested(cacheKey.key, cacheKey.restoreKeys)

        this.debug(
            `Requesting ${this.cacheDescription} with
                key:${cacheKey.key}
                restoreKeys:[${cacheKey.restoreKeys}]`
        )

        const cacheResult = await this.restoreCache(this.getCachePath(), cacheKey.key, cacheKey.restoreKeys)

        if (!cacheResult) {
            core.info(`${this.cacheDescription} cache not found. Will initialize empty.`)
            return
        }

        core.saveState(this.cacheResultStateKey, cacheResult.key)
        entryReport.markRestored(cacheResult.key, cacheResult.size)
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

    async save(listener: CacheListener): Promise<void> {
        if (!this.cacheOutputExists()) {
            core.info(`No ${this.cacheDescription} to cache.`)
            return
        }

        const cacheKey = core.getState(this.cacheKeyStateKey)
        const cacheResult = core.getState(this.cacheResultStateKey)

        if (!cacheKey) {
            core.info(`${this.cacheDescription} existed prior to cache restore. Not saving.`)
            return
        }

        if (cacheResult && cacheKey === cacheResult) {
            core.info(`Cache hit occurred on the cache key ${cacheKey}, not saving cache.`)
            return
        }

        try {
            await this.beforeSave(listener)
        } catch (error) {
            core.warning(`Save ${this.cacheDescription} failed in 'beforeSave': ${error}`)
            return
        }

        core.info(`Caching ${this.cacheDescription} with cache key: ${cacheKey}`)
        const cachePath = this.getCachePath()
        const savedEntry = await this.saveCache(cachePath, cacheKey)

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

    protected abstract cacheOutputExists(): boolean
    protected abstract getCachePath(): string[]
}
