import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs'

const CACHE_PROTOCOL_VERSION = 'v4-'

const CACHE_DISABLED_PARAMETER = 'cache-disabled'
const CACHE_READONLY_PARAMETER = 'cache-read-only'
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

export function handleCacheFailure(error: unknown, message: string): void {
    if (error instanceof cache.ValidationError) {
        // Fail on cache validation errors
        throw error
    }
    if (error instanceof cache.ReserveCacheError) {
        // Reserve cache errors are expected if the artifact has been previously cached
        if (isCacheDebuggingEnabled()) {
            core.info(message)
        } else {
            core.debug(message)
        }
    } else {
        // Warn on all other errors
        core.warning(`${message}: ${error}`)
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
