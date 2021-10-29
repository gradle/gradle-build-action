import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as github from '@actions/github'
import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs'

const CACHE_PROTOCOL_VERSION = 'v4-'

const CACHE_DISABLED_PARAMETER = 'cache-disabled'
const CACHE_READONLY_PARAMETER = 'cache-read-only'
const JOB_CONTEXT_PARAMETER = 'workflow-job-context'
const CACHE_DEBUG_VAR = 'GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED'
const CACHE_PREFIX_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_PREFIX'

export function isCacheDisabled(): boolean {
    return core.getBooleanInput(CACHE_DISABLED_PARAMETER)
}

export function isCacheReadOnly(): boolean {
    return core.getBooleanInput(CACHE_READONLY_PARAMETER)
}

export function isCacheDebuggingEnabled(): boolean {
    return process.env[CACHE_DEBUG_VAR] ? true : false
}

export function getCacheKeyPrefix(): string {
    // Prefix can be used to force change all cache keys (defaults to cache protocol version)
    return process.env[CACHE_PREFIX_VAR] || CACHE_PROTOCOL_VERSION
}

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

export function hashStrings(values: string[]): string {
    const hash = crypto.createHash('md5')
    for (const value of values) {
        hash.update(value)
    }
    return hash.digest('hex')
}

export function hashFileNames(fileNames: string[]): string {
    return hashStrings(fileNames.map(x => x.replace(new RegExp(`\\${path.sep}`, 'g'), '/')))
}

/**
 * Attempt to delete a file or directory, waiting to allow locks to be released
 */
export async function tryDelete(file: string): Promise<void> {
    const stat = fs.lstatSync(file)
    for (let count = 0; count < 3; count++) {
        try {
            if (stat.isDirectory()) {
                fs.rmdirSync(file, {recursive: true})
            } else {
                fs.unlinkSync(file)
            }
            return
        } catch (error) {
            if (count === 2) {
                throw error
            } else {
                core.warning(String(error))
                await delay(1000)
            }
        }
    }
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
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

    async restore(): Promise<void> {
        if (this.cacheOutputExists()) {
            core.info(`${this.cacheDescription} already exists. Not restoring from cache.`)
            return
        }

        const cacheKey = generateCacheKey(this.cacheName)

        core.saveState(this.cacheKeyStateKey, cacheKey.key)

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

        core.info(`Restored ${this.cacheDescription} from cache key: ${cacheResult}`)

        try {
            await this.afterRestore()
        } catch (error) {
            core.warning(`Restore ${this.cacheDescription} failed in 'afterRestore': ${error}`)
        }

        return
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

    protected async afterRestore(): Promise<void> {}

    async save(): Promise<void> {
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
            await this.beforeSave()
        } catch (error) {
            core.warning(`Save ${this.cacheDescription} failed in 'beforeSave': ${error}`)
            return
        }

        core.info(`Caching ${this.cacheDescription} with cache key: ${cacheKey}`)
        const cachePath = this.getCachePath()
        await this.saveCache(cachePath, cacheKey)

        return
    }

    protected async beforeSave(): Promise<void> {}

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
