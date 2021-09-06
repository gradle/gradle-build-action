import path from 'path'
import fs from 'fs'

import * as core from '@actions/core'
import * as cache from '@actions/cache'
import {generateCacheKey} from './cache-utils'

const PATHS_TO_CACHE = [
    'configuration-cache' // Only configuration-cache is stored at present
]
const CACHE_KEY = 'PROJECT_CACHE_KEY'
const CACHE_RESULT = 'PROJECT_CACHE_RESULT'

export async function restore(rootDir: string): Promise<void> {
    if (projectDotGradleDirExists(rootDir)) {
        core.info(
            'Project .gradle directory already exists. Not restoring from cache.'
        )
        return
    }

    const cacheKey = generateCacheKey('project')

    core.saveState(CACHE_KEY, cacheKey.key)

    const cacheResult = await cache.restoreCache(
        getCachePath(rootDir),
        cacheKey.key,
        cacheKey.restoreKeys
    )

    if (!cacheResult) {
        core.info('Project .gradle cache not found. Will start with empty.')
        return
    }

    core.info(`Project .gradle dir restored from cache key: ${cacheResult}`)
    return
}

export async function save(rootDir: string): Promise<void> {
    if (!projectDotGradleDirExists(rootDir)) {
        core.debug('No project .gradle dir to cache.')
        return
    }

    const cacheKey = core.getState(CACHE_KEY)
    const cacheResult = core.getState(CACHE_RESULT)

    if (!cacheKey) {
        core.info(
            'Project .gradle dir existed prior to cache restore. Not saving.'
        )
        return
    }

    if (cacheResult && cacheKey === cacheResult) {
        core.info(
            `Cache hit occurred on the cache key ${cacheKey}, not saving cache.`
        )
        return
    }

    core.info(`Caching project .gradle dir with cache key: ${cacheKey}`)
    try {
        await cache.saveCache(getCachePath(rootDir), cacheKey)
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

function getCachePath(rootDir: string): string[] {
    const dir = getProjectDotGradleDir(rootDir)
    return PATHS_TO_CACHE.map(x => path.resolve(dir, x))
}

function getProjectDotGradleDir(rootDir: string): string {
    core.debug(`Resolving .gradle dir in ${rootDir}`)
    return path.resolve(rootDir, '.gradle')
}

function projectDotGradleDirExists(rootDir: string): boolean {
    const dir = getProjectDotGradleDir(rootDir)
    core.debug(`Checking for existence of project .gradle dir: ${dir}`)
    return fs.existsSync(dir)
}
