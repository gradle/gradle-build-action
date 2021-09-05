import * as core from '@actions/core'
import * as github from '@actions/github'

export function isCacheReadEnabled(cacheName: string): boolean {
    const configValue = getCacheEnabledValue(cacheName)
    return configValue === 'true' || configValue === 'read-only'
}

export function isCacheSaveEnabled(cacheName: string): boolean {
    const configValue = getCacheEnabledValue(cacheName)
    return configValue === 'true'
}

function getCacheEnabledValue(cacheName: string): string {
    const configValue = core
        .getInput(`${cacheName}-cache-enabled`)
        .toLowerCase()

    if (['true', 'false', 'read-only'].includes(configValue)) {
        return configValue
    }
    throw new Error(
        `Invalid cache-enabled parameter '${configValue}'. Valid values are ['true', 'false', 'read-only']`
    )
}

export function generateCacheKey(cacheName: string): CacheKey {
    const cacheKeySeed = process.env[`CACHE_KEY_SEED`] || ''
    const runnerOs = process.env[`RUNNER_OS`] || ''
    const cacheKeyPrefix = `${cacheKeySeed}${runnerOs}|${cacheName}|`

    const args = truncateArgs(core.getInput('arguments'))
    const cacheKeyWithArgs = `${cacheKeyPrefix}${args}|`

    const cacheKey = `${cacheKeyWithArgs}${github.context.sha}`
    return new CacheKey(cacheKey, [cacheKeyWithArgs, cacheKeyPrefix])
}

function truncateArgs(args: string): string {
    return args.trim().replace(/\s+/g, ' ').substr(0, 400)
}

export class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
    }
}
