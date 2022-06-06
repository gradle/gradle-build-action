import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as github from '@actions/github'
import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs'

import {CacheEntryListener} from './cache-reporting'

const CACHE_PROTOCOL_VERSION = 'v6-'

const JOB_CONTEXT_PARAMETER = 'workflow-job-context'
const CACHE_DISABLED_PARAMETER = 'cache-disabled'
const CACHE_READONLY_PARAMETER = 'cache-read-only'
const CACHE_WRITEONLY_PARAMETER = 'cache-write-only'
const STRICT_CACHE_MATCH_PARAMETER = 'gradle-home-cache-strict-match'
const CACHE_DEBUG_VAR = 'GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED'

const CACHE_KEY_PREFIX_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_PREFIX'
const CACHE_KEY_OS_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_ENVIRONMENT'
const CACHE_KEY_JOB_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_JOB'
const CACHE_KEY_JOB_INSTANCE_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_JOB_INSTANCE'
const CACHE_KEY_JOB_EXECUTION_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_JOB_EXECUTION'

export function isCacheDisabled(): boolean {
    return core.getBooleanInput(CACHE_DISABLED_PARAMETER)
}

export function isCacheReadOnly(): boolean {
    return !isCacheWriteOnly() && core.getBooleanInput(CACHE_READONLY_PARAMETER)
}

export function isCacheWriteOnly(): boolean {
    return core.getBooleanInput(CACHE_WRITEONLY_PARAMETER)
}

export function isCacheDebuggingEnabled(): boolean {
    return process.env[CACHE_DEBUG_VAR] ? true : false
}

/**
 * Represents a key used to restore a cache entry.
 * The Github Actions cache will first try for an exact match on the key.
 * If that fails, it will try for a prefix match on any of the restoreKeys.
 */
export class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
    }
}

/**
 * Generates a cache key specific to the current job execution.
 * The key is constructed from the following inputs (with some user overrides):
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
export function generateCacheKey(cacheName: string): CacheKey {
    const cacheKeyBase = `${getCacheKeyPrefix()}${CACHE_PROTOCOL_VERSION}${cacheName}`

    // At the most general level, share caches for all executions on the same OS
    const cacheKeyForEnvironment = `${cacheKeyBase}|${getCacheKeyEnvironment()}`

    // Prefer caches that run this job
    const cacheKeyForJob = `${cacheKeyForEnvironment}|${getCacheKeyJob()}`

    // Prefer (even more) jobs that run this job with the same context (matrix)
    const cacheKeyForJobContext = `${cacheKeyForJob}[${getCacheKeyJobInstance()}]`

    // Exact match on Git SHA
    const cacheKey = `${cacheKeyForJobContext}-${getCacheKeyJobExecution()}`

    if (core.getBooleanInput(STRICT_CACHE_MATCH_PARAMETER)) {
        return new CacheKey(cacheKey, [cacheKeyForJobContext])
    }

    return new CacheKey(cacheKey, [cacheKeyForJobContext, cacheKeyForJob, cacheKeyForEnvironment])
}

export function getCacheKeyPrefix(): string {
    // Prefix can be used to force change all cache keys (defaults to cache protocol version)
    return process.env[CACHE_KEY_PREFIX_VAR] || ''
}

function getCacheKeyEnvironment(): string {
    const runnerOs = process.env['RUNNER_OS'] || ''
    return process.env[CACHE_KEY_OS_VAR] || runnerOs
}

function getCacheKeyJob(): string {
    // Prefix can be used to force change all cache keys (defaults to cache protocol version)
    return process.env[CACHE_KEY_JOB_VAR] || github.context.job
}

function getCacheKeyJobInstance(): string {
    const override = process.env[CACHE_KEY_JOB_INSTANCE_VAR]
    if (override) {
        return override
    }

    // By default, we hash the full `matrix` data for the run, to uniquely identify this job invocation
    // The only way we can obtain the `matrix` data is via the `workflow-job-context` parameter in action.yml.
    const workflowJobContext = core.getInput(JOB_CONTEXT_PARAMETER)
    return hashStrings([workflowJobContext])
}

function getCacheKeyJobExecution(): string {
    // Used to associate a cache key with a particular execution (default is bound to the git commit sha)
    return process.env[CACHE_KEY_JOB_EXECUTION_VAR] || github.context.sha
}

export function hashFileNames(fileNames: string[]): string {
    return hashStrings(fileNames.map(x => x.replace(new RegExp(`\\${path.sep}`, 'g'), '/')))
}

export function hashStrings(values: string[]): string {
    const hash = crypto.createHash('md5')
    for (const value of values) {
        hash.update(value)
    }
    return hash.digest('hex')
}

export async function restoreCache(
    cachePath: string[],
    cacheKey: string,
    cacheRestoreKeys: string[],
    listener: CacheEntryListener
): Promise<cache.CacheEntry | undefined> {
    listener.markRequested(cacheKey, cacheRestoreKeys)
    try {
        const restoredEntry = await cache.restoreCache(cachePath, cacheKey, cacheRestoreKeys)
        if (restoredEntry !== undefined) {
            listener.markRestored(restoredEntry.key, restoredEntry.size)
        }
        return restoredEntry
    } catch (error) {
        handleCacheFailure(error, `Failed to restore ${cacheKey}`)
        return undefined
    }
}

export async function saveCache(cachePath: string[], cacheKey: string, listener: CacheEntryListener): Promise<void> {
    try {
        const savedEntry = await cache.saveCache(cachePath, cacheKey)
        listener.markSaved(savedEntry.key, savedEntry.size)
    } catch (error) {
        if (error instanceof cache.ReserveCacheError) {
            listener.markAlreadyExists(cacheKey)
        }
        handleCacheFailure(error, `Failed to save cache entry with path '${cachePath}' and key: ${cacheKey}`)
    }
}

export function cacheDebug(message: string): void {
    if (isCacheDebuggingEnabled()) {
        core.info(message)
    } else {
        core.debug(message)
    }
}

export function handleCacheFailure(error: unknown, message: string): void {
    if (error instanceof cache.ValidationError) {
        // Fail on cache validation errors
        throw error
    }
    if (error instanceof cache.ReserveCacheError) {
        // Reserve cache errors are expected if the artifact has been previously cached
        core.info(`${message}: ${error}`)
    } else {
        // Warn on all other errors
        core.warning(`${message}: ${error}`)
        if (error instanceof Error && error.stack) {
            cacheDebug(error.stack)
        }
    }
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
