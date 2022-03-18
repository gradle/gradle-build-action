import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs'

import {CacheEntryListener} from './cache-reporting'

const JOB_CONTEXT_PARAMETER = 'workflow-job-context'
const CACHE_DISABLED_PARAMETER = 'cache-disabled'
const CACHE_READONLY_PARAMETER = 'cache-read-only'
const CACHE_WRITEONLY_PARAMETER = 'cache-write-only'
const CACHE_DEBUG_VAR = 'GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED'
const CACHE_PREFIX_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_PREFIX'

export function isCacheDisabled(): boolean {
    return core.getBooleanInput(CACHE_DISABLED_PARAMETER)
}

export function isCacheReadOnly(): boolean {
    return core.getBooleanInput(CACHE_READONLY_PARAMETER)
}

export function isCacheWriteOnly(): boolean {
    return core.getBooleanInput(CACHE_WRITEONLY_PARAMETER)
}

export function isCacheDebuggingEnabled(): boolean {
    return process.env[CACHE_DEBUG_VAR] ? true : false
}

export function getCacheKeyPrefix(): string {
    // Prefix can be used to force change all cache keys (defaults to cache protocol version)
    return process.env[CACHE_PREFIX_VAR] || ''
}

export function determineJobContext(): string {
    // By default, we hash the full `matrix` data for the run, to uniquely identify this job invocation
    // The only way we can obtain the `matrix` data is via the `workflow-job-context` parameter in action.yml.
    const workflowJobContext = core.getInput(JOB_CONTEXT_PARAMETER)
    return hashStrings([workflowJobContext])
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
        handleCacheFailure(error, `Failed to save cache entry ${cacheKey}`)
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
