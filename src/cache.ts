import * as core from '@actions/core'
import * as path from 'path'
import * as fs from 'fs'

const WRAPPER_CACHE_KEY = 'WRAPPER_CACHE_KEY'
const WRAPPER_CACHE_PATH = 'WRAPPER_CACHE_PATH'

export async function restoreCachedWrapperDist(
    executableDirectory: string
): Promise<void> {
    const wrapperSlug = extractGradleWrapperSlugFrom(
        path.join(
            path.resolve(executableDirectory),
            'gradle/wrapper/gradle-wrapper.properties'
        )
    )
    const wrapperCacheKey = `wrapper-${wrapperSlug}`
    const wrapperCachePath = path.join(
        process.env.HOME!,
        `.gradle/wrapper/dists/gradle-${wrapperSlug}`
    )
    core.info(`${WRAPPER_CACHE_KEY} = ${wrapperCacheKey}`)
    core.info(`${WRAPPER_CACHE_PATH} = ${wrapperCachePath}`)
    core.saveState(WRAPPER_CACHE_KEY, wrapperCacheKey)
    core.saveState(WRAPPER_CACHE_PATH, wrapperCachePath)
    return
}

export async function cacheWrapperDist(): Promise<void> {
    core.info(`${WRAPPER_CACHE_KEY} = ${core.getState(WRAPPER_CACHE_KEY)}`)
    core.info(`${WRAPPER_CACHE_PATH} = ${core.getState(WRAPPER_CACHE_PATH)}`)
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
