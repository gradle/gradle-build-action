import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as github from '@actions/github'
import {isCacheDebuggingEnabled, getCacheKeyPrefix, hashStrings} from './cache-utils'

const JOB_CONTEXT_PARAMETER = 'workflow-job-context'

function generateCacheKey(cacheName: string): CacheKey {
    const cacheKeyPrefix = getCacheKeyPrefix()

    // At the most general level, share caches for all executions on the same OS
    const runnerOs = process.env['RUNNER_OS'] || ''
    const cacheKeyForOs = `${cacheKeyPrefix}${cacheName}|${runnerOs}`

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

export class CachingReport {
    cacheEntryReports: CacheEntryReport[] = []

    get fullyRestored(): boolean {
        return this.cacheEntryReports.every(x => !x.wasRequestedButNotRestored())
    }

    entryReport(name: string): CacheEntryReport {
        for (const report of this.cacheEntryReports) {
            if (report.entryName === name) {
                return report
            }
        }

        const newReport = new CacheEntryReport(name)
        this.cacheEntryReports.push(newReport)
        return newReport
    }

    stringify(): string {
        return JSON.stringify(this)
    }

    static rehydrate(stringRep: string): CachingReport {
        const rehydrated: CachingReport = Object.assign(new CachingReport(), JSON.parse(stringRep))
        const entryReports = rehydrated.cacheEntryReports
        for (let index = 0; index < entryReports.length; index++) {
            const rawEntryReport = entryReports[index]
            entryReports[index] = Object.assign(new CacheEntryReport(rawEntryReport.entryName), rawEntryReport)
        }
        return rehydrated
    }
}

export class CacheEntryReport {
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

    markRequested(key: string, restoreKeys: string[] = []): CacheEntryReport {
        this.requestedKey = key
        this.requestedRestoreKeys = restoreKeys
        return this
    }

    markRestored(key: string): CacheEntryReport {
        this.restoredKey = key
        return this
    }

    markSaved(key: string): CacheEntryReport {
        this.savedKey = key
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

    async restore(report: CachingReport): Promise<void> {
        if (this.cacheOutputExists()) {
            core.info(`${this.cacheDescription} already exists. Not restoring from cache.`)
            return
        }

        const cacheKey = this.prepareCacheKey()
        const entryReport = report.entryReport(this.cacheName)
        entryReport.markRequested(cacheKey.key, cacheKey.restoreKeys)

        this.debug(
            `Requesting ${this.cacheDescription} with
                key:${cacheKey.key}
                restoreKeys:[${cacheKey.restoreKeys}]`
        )

        const cacheResult = await this.restoreCache(this.getCachePath(), cacheKey.key, cacheKey.restoreKeys)

        if (!cacheResult) {
            core.info(`${this.cacheDescription} cache not found. Will start with empty.`)
            return
        }

        core.saveState(this.cacheResultStateKey, cacheResult)
        entryReport.markRestored(cacheResult)
        core.info(`Restored ${this.cacheDescription} from cache key: ${cacheResult}`)

        try {
            await this.afterRestore(report)
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
    ): Promise<string | undefined> {
        try {
            return await cache.restoreCache(cachePath, cacheKey, cacheRestoreKeys)
        } catch (error) {
            if (error instanceof cache.ValidationError) {
                // Validation errors should fail the build action
                throw error
            }
            // Warn about any other error and continue
            core.warning(`Failed to restore ${cacheKey}: ${error}`)
            return undefined
        }
    }

    protected async afterRestore(_report: CachingReport): Promise<void> {}

    async save(report: CachingReport): Promise<void> {
        if (!this.cacheOutputExists()) {
            this.debug(`No ${this.cacheDescription} to cache.`)
            return
        }

        const cacheKey = core.getState(this.cacheKeyStateKey)
        const cacheResult = core.getState(this.cacheResultStateKey)

        if (!cacheKey) {
            this.debug(`${this.cacheDescription} existed prior to cache restore. Not saving.`)
            return
        }

        if (cacheResult && cacheKey === cacheResult) {
            core.info(`Cache hit occurred on the cache key ${cacheKey}, not saving cache.`)
            return
        }

        try {
            await this.beforeSave(report)
        } catch (error) {
            core.warning(`Save ${this.cacheDescription} failed in 'beforeSave': ${error}`)
            return
        }

        core.info(`Caching ${this.cacheDescription} with cache key: ${cacheKey}`)
        const cachePath = this.getCachePath()
        await this.saveCache(cachePath, cacheKey)

        report.entryReport(this.cacheName).markSaved(cacheKey)

        return
    }

    protected async beforeSave(_report: CachingReport): Promise<void> {}

    protected async saveCache(cachePath: string[], cacheKey: string): Promise<void> {
        try {
            await cache.saveCache(cachePath, cacheKey)
        } catch (error) {
            if (error instanceof cache.ValidationError) {
                // Validation errors should fail the build action
                throw error
            } else if (error instanceof cache.ReserveCacheError) {
                // Reserve cache errors are expected if the artifact has been previously cached
                this.debug(error.message)
            } else {
                // Warn about any other error and continue
                core.warning(String(error))
            }
        }
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
