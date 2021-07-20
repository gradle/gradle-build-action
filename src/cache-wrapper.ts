import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

import * as core from '@actions/core'
import * as cache from '@actions/cache'

const WRAPPER_SLUG = 'WRAPPER_SLUG'

export async function restoreCachedWrapperDist(
    gradlewDirectory: string | null
): Promise<void> {
    if (isWrapperCacheDisabled()) return
    if (gradlewDirectory == null) return

    const wrapperProperties = path.join(
        path.resolve(gradlewDirectory),
        'gradle/wrapper/gradle-wrapper.properties'
    )
    const wrapperSlug = extractGradleWrapperSlugFrom(wrapperProperties)
    if (!wrapperSlug) {
        core.warning(
            `Could not calculate wrapper version from ${wrapperProperties}`
        )
        return
    }

    const wrapperDir = getWrapperDir(wrapperSlug)
    const cacheKey = getCacheKey(wrapperSlug)
    const cachePath = getCachePath(wrapperSlug)

    // Check if the wrapper has already been downloaded to Gradle User Home
    if (fs.existsSync(wrapperDir)) return

    try {
        const restoredKey = await cache.restoreCache([cachePath], cacheKey)

        if (restoredKey) {
            core.info(
                `Wrapper installation restored from cache key: ${restoredKey}`
            )
        } else {
            core.info(
                `Wrapper installation cache not found. Will download and cache with key: ${cacheKey}.`
            )
            // Save the slug to trigger caching of the downloaded wrapper
            core.saveState(WRAPPER_SLUG, wrapperSlug)
        }
    } catch (error) {
        core.info(
            `Wrapper installation cache restore failed for key: ${cacheKey}.\n  ${error}`
        )
    }
}

export async function cacheWrapperDist(): Promise<void> {
    if (isWrapperCacheDisabled()) return

    const wrapperSlug = core.getState(WRAPPER_SLUG)
    if (!wrapperSlug) return

    const wrapperDir = getWrapperDir(wrapperSlug)
    const cacheKey = getCacheKey(wrapperSlug)
    const cachePath = getCachePath(wrapperSlug)

    if (!fs.existsSync(wrapperDir)) {
        core.warning(`No wrapper installation to cache at ${wrapperDir}`)
        return
    }

    core.info(`Will cache wrapper zip ${cachePath} with key ${cacheKey}`)

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

function isWrapperCacheDisabled(): boolean {
    // Check if either 'distributions' or 'wrapper' cache has been disabled
    const wrapperCacheEnabled = core.getBooleanInput('wrapper-cache-enabled')
    const distributionsCacheEnabled = core.getBooleanInput(
        'distributions-cache-enabled'
    )
    return !wrapperCacheEnabled || !distributionsCacheEnabled
}

function getCacheKey(wrapperSlug: string): string {
    return `wrapper-v1-${wrapperSlug}`
}

function getWrapperDir(wrapperSlug: string): string {
    return path.resolve(
        os.homedir(),
        `.gradle/wrapper/dists/gradle-${wrapperSlug}`
    )
}

function getCachePath(wrapperSlug: string): string {
    return path.resolve(
        os.homedir(),
        `.gradle/wrapper/dists/gradle-${wrapperSlug}/*/gradle-${wrapperSlug}.zip`
    )
}
