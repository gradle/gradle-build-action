import * as core from '@actions/core'

export function truncateArgs(args: string): string {
    return args.trim().replace(/\s+/g, ' ').substr(0, 400)
}

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
