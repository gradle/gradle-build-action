import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

import * as core from '@actions/core'
import * as cache from '@actions/cache'

import * as crypto from './crypto-utils'

const DEPENDENCIES_CACHE_PATH = 'DEPENDENCIES_CACHE_PATH'
const DEPENDENCIES_CACHE_KEY = 'DEPENDENCIES_CACHE_KEY'
const DEPENDENCIES_CACHE_RESULT = 'DEPENDENCIES_CACHE_RESULT'

export async function restoreCachedDependencies(
    rootDir: string
): Promise<void> {
    if (isDependenciesCacheDisabled()) return

    const cachePath = path.resolve(os.homedir(), '.gradle/caches/modules-2')
    if (fs.existsSync(cachePath)) return
    core.saveState(DEPENDENCIES_CACHE_PATH, cachePath)

    const inputCacheExact = core.getBooleanInput('dependencies-cache-exact')
    const cacheKeyGlobs = inputCacheKeyGlobs('dependencies-cache-key')

    const hash = await crypto.hashFiles(rootDir, cacheKeyGlobs)
    const cacheKeyPrefix = 'dependencies-'
    const cacheKey = `${cacheKeyPrefix}${hash}`
    core.saveState(DEPENDENCIES_CACHE_KEY, cacheKey)

    const cacheResult = await cache.restoreCache(
        [cachePath],
        cacheKey,
        inputCacheExact ? [] : [cacheKeyPrefix]
    )

    if (!cacheResult) {
        core.info('Dependencies cache not found, expect dependencies download.')
        return
    }

    core.saveState(DEPENDENCIES_CACHE_RESULT, cacheResult)
    core.info(`Dependencies restored from cache key: ${cacheResult}`)
    return
}

export async function cacheDependencies(): Promise<void> {
    if (isDependenciesCacheDisabled()) return

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

    const locksDeleted = tryDeleteFiles([
        path.resolve(cachePath, 'modules-2.lock')
    ])
    if (!locksDeleted) {
        core.warning(
            'Unable to delete dependencies lock files, try using --no-daemon or stopping the daemon last if you have several Gradle steps, not saving cache.'
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

export function tryDeleteFiles(filePaths: string[]): boolean {
    let failure = false
    for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath)
            } catch (error) {
                failure = true
            }
        }
    }
    return !failure
}

function isDependenciesCacheDisabled(): boolean {
    return !core.getBooleanInput('dependencies-cache-enabled')
}

export function inputCacheKeyGlobs(input: string): string[] {
    const inputValue = core.getMultilineInput(input)
    return inputValue.length > 0
        ? inputValue
        : [
              '**/*.gradle',
              '**/*.gradle.kts',
              '**/gradle.properties',
              'gradle/**'
          ]
}
