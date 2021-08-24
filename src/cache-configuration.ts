import * as path from 'path'
import * as fs from 'fs'

import * as core from '@actions/core'
import * as cache from '@actions/cache'

import * as cacheUtils from './cache-utils'

import {
    inputCacheKeyGlobs,
    tryDeleteFiles,
    isDependenciesCacheDisabled
} from './cache-dependencies'

const CONFIGURATION_CACHE_PATH = 'CONFIGURATION_CACHE_PATH'
const CONFIGURATION_CACHE_KEY = 'CONFIGURATION_CACHE_KEY'
const CONFIGURATION_CACHE_RESULT = 'CONFIGURATION_CACHE_RESULT'

export async function restoreCachedConfiguration(
    rootDir: string
): Promise<void> {
    if (isConfigurationCacheDisabled()) return

    if (isDependenciesCacheDisabled()) {
        throw new Error(
            `Must enable dependencies-cache when configuration-cache is enabled`
        )
    }

    const cachePath = path.resolve(rootDir, '.gradle/configuration-cache')
    if (fs.existsSync(cachePath)) return
    core.saveState(CONFIGURATION_CACHE_PATH, cachePath)

    const inputCacheExact = core.getBooleanInput('configuration-cache-exact')
    const cacheKeyPrefix = 'configuration|'

    const args = core.getInput('arguments')
    const argsKey = cacheUtils.truncateArgs(args)
    const cacheKeyWithArgs = `${cacheKeyPrefix}${argsKey}|`

    const cacheKeyGlobs = inputCacheKeyGlobs('configuration-cache-key')
    const hash = await cacheUtils.hashFiles(rootDir, cacheKeyGlobs)
    const cacheKey = `${cacheKeyWithArgs}${hash}`

    core.saveState(CONFIGURATION_CACHE_KEY, cacheKey)

    const cacheResult = await cache.restoreCache(
        [cachePath],
        cacheKey,
        inputCacheExact ? [] : [cacheKeyWithArgs, cacheKeyPrefix]
    )

    if (!cacheResult) {
        core.info(
            'Configuration cache not found, expect task graph calculation.'
        )
        return
    }

    core.saveState(CONFIGURATION_CACHE_RESULT, cacheResult)
    core.info(`Configuration restored from cache key: ${cacheResult}`)
    return
}

export async function cacheConfiguration(): Promise<void> {
    if (isConfigurationCacheDisabled()) return

    const cachePath = core.getState(CONFIGURATION_CACHE_PATH)
    const cacheKey = core.getState(CONFIGURATION_CACHE_KEY)
    const cacheResult = core.getState(CONFIGURATION_CACHE_RESULT)

    if (!cachePath || !fs.existsSync(cachePath)) {
        core.debug('No configuration to cache.')
        return
    }

    if (cacheResult && cacheKey === cacheResult) {
        core.info(
            `Configuration cache hit occurred on the cache key ${cacheKey}, not saving cache.`
        )
        return
    }

    const locksDeleted = tryDeleteFiles([
        path.resolve(cachePath, 'configuration-cache.lock')
    ])
    if (!locksDeleted) {
        core.warning(
            'Unable to delete configuration lock files, try using --no-daemon or stopping the daemon last if you have several Gradle steps, not saving cache.'
        )
        return
    }

    core.info(`Will cache configuration with key ${cacheKey}`)

    try {
        await cache.saveCache([cachePath], cacheKey)
    } catch (error) {
        if (error.name === cache.ValidationError.name) {
            throw error
        } else if (error.name === cache.ReserveCacheError.name) {
            core.info(error.message)
        } else {
            core.info(`[warning] ${error.message}`)
        }
    }

    return
}

function isConfigurationCacheDisabled(): boolean {
    return !core.getBooleanInput('configuration-cache-enabled')
}
