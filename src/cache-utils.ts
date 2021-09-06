import * as core from '@actions/core'
import * as github from '@actions/github'
import * as crypto from 'crypto'

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
    // Prefix can be used to force change all cache keys
    const cacheKeyPrefix = process.env['CACHE_KEY_PREFIX'] || ''

    // At the most general level, share caches for all executions on the same OS
    const runnerOs = process.env['RUNNER_OS'] || ''
    const cacheKeyForOs = `${cacheKeyPrefix}${cacheName}|${runnerOs}`

    // Prefer caches that run this job
    const cacheKeyForJob = `${cacheKeyForOs}|${github.context.job}`

    // Prefer (even more) jobs that run this job with the same context (matrix)
    const cacheKeyForJobContext = `${cacheKeyForJob}[${determineJobContext()}]`

    // Exact match on Git SHA
    const cacheKey = `${cacheKeyForJobContext}-${github.context.sha}`

    return new CacheKey(cacheKey, [
        cacheKeyForJobContext,
        cacheKeyForJob,
        cacheKeyForOs
    ])
}

function determineJobContext(): string {
    // Ideally we'd serialize the entire matrix values here, but matrix is not available within the action invocation.
    // Use the JAVA_HOME value as a proxy for the java version
    const javaHome = process.env['JAVA_HOME'] || ''

    // Approximate overall context based on the first gradle invocation in the Job
    const args = core.getInput('arguments')
    const buildRootDirectory = core.getInput('build-root-directory')
    const gradleVersion = core.getInput('gradle-version')

    return hashStrings([javaHome, args, buildRootDirectory, gradleVersion])
}

export function hashStrings(values: string[]): string {
    const hash = crypto.createHash('md5')
    for (const value of values) {
        hash.update(value)
    }
    return hash.digest('hex')
}

export class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
    }
}
