import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

import * as core from '@actions/core'
import * as cache from '@actions/cache'

import * as github from './github-utils'
import * as crypto from './crypto-utils'

const DEPENDENCIES_CACHE_PATH = 'DEPENDENCIES_CACHE_PATH'
const DEPENDENCIES_CACHE_KEY = 'DEPENDENCIES_CACHE_KEY'
const DEPENDENCIES_CACHE_RESULT = 'DEPENDENCIES_CACHE_RESULT'

export async function restoreCachedDependencies(
    rootDir: string
): Promise<void> {
    const cachePath = path.resolve(os.homedir(), '.gradle/caches/modules-2')
    core.saveState(DEPENDENCIES_CACHE_PATH, cachePath)

    const inputCacheExact = github.inputBoolean('dependencies-cache-exact')

    const inputCacheKeyGlobs = github.inputArrayOrNull('dependencies-cache-key')
    const cacheKeyGlobs = inputCacheKeyGlobs
        ? inputCacheKeyGlobs
        : [
              '**/*.gradle',
              '**/*.gradle.kts',
              '**/gradle.properties',
              'gradle/**'
          ]

    const hash = await crypto.hashFiles(rootDir, cacheKeyGlobs)
    const cacheKeyPrefix = 'dependencies-'
    const cacheKey = `${cacheKeyPrefix}${hash}`
    core.saveState(DEPENDENCIES_CACHE_KEY, cacheKey)

    const cacheResult = await cache.restoreCache(
        [cachePath],
        cacheKey,
        inputCacheExact ? [] : [cacheKeyPrefix]
    )
    core.saveState(DEPENDENCIES_CACHE_RESULT, cacheResult)
}

export async function cacheDependencies(): Promise<void> {
    const cachePath = core.getState(DEPENDENCIES_CACHE_PATH)
    const cacheKey = core.getState(DEPENDENCIES_CACHE_KEY)
    const cacheResult = core.getState(DEPENDENCIES_CACHE_RESULT)

    if (!cachePath || !fs.existsSync(cachePath)) {
        core.debug('No dependencies to cache.')
        return
    }

    if (cacheResult && cacheKey === cacheResult) {
        core.info(
            `Dependencies cache hit occurred on the cache key ${cacheKey}, not saving cache.`
        )
        return
    }

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
