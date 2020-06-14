import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const WRAPPER_CACHE_KEY = 'WRAPPER_CACHE_KEY'
const WRAPPER_CACHE_PATH = 'WRAPPER_CACHE_PATH'
const WRAPPER_CACHE_RESULT = 'WRAPPER_CACHE_RESULT'

export async function restoreCachedWrapperDist(
    executableDirectory: string
): Promise<void> {
    const wrapperSlug = extractGradleWrapperSlugFrom(
        path.join(
            path.resolve(executableDirectory),
            'gradle/wrapper/gradle-wrapper.properties'
        )
    )
    if (!wrapperSlug) return

    const wrapperCacheKey = `wrapper-${wrapperSlug}`
    const wrapperCachePath = path.join(
        os.homedir(),
        `.gradle/wrapper/dists/gradle-${wrapperSlug}`
    )

    core.saveState(WRAPPER_CACHE_KEY, wrapperCacheKey)
    core.saveState(WRAPPER_CACHE_PATH, wrapperCachePath)

    const restoredKey = await cache.restoreCache(
        [wrapperCachePath],
        wrapperCacheKey
    )

    if (!restoredKey) {
        core.info(
            'Wrapper installation cache not found, expect a Gradle distribution download.'
        )
        return
    }

    core.saveState(WRAPPER_CACHE_RESULT, restoredKey)
    core.info(`Wrapper installation restored from cache key: ${restoredKey}`)
    return
}

export async function cacheWrapperDist(): Promise<void> {
    const cacheKey = core.getState(WRAPPER_CACHE_KEY)
    const cachePath = core.getState(WRAPPER_CACHE_PATH)
    const cacheResult = core.getState(WRAPPER_CACHE_RESULT)

    if (!cachePath) {
        core.debug('No wrapper installation to cache.')
        return
    }

    if (cacheResult && cacheKey === cacheResult) {
        core.info(
            `Wrapper installation cache hit occurred on the cache key ${cacheKey}, not saving cache.`
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

export function extractGradleWrapperSlugFrom(
    wrapperProperties: string
): string | null {
    const props = fs.readFileSync(wrapperProperties, {encoding: 'utf8'})
    const distUrlLine = props
        .split('\n')
        .find(line => line.startsWith('distributionUrl'))
    if (!distUrlLine) return null
    return extractGradleWrapperSlugFromDistUri(distUrlLine.substr(16).trim())
}

export function extractGradleWrapperSlugFromDistUri(
    distUri: string
): string | null {
    const regex = /.*gradle-(.*-(bin|all))\.zip/
    const match = distUri.match(regex)
    return match ? match[1] : null
}
