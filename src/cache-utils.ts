import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as github from '@actions/github'
import * as exec from '@actions/exec'

import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs'

import * as params from './input-params'

import {CacheEntryListener} from './cache-reporting'

const CACHE_PROTOCOL_VERSION = 'v9-'

const CACHE_KEY_PREFIX_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_PREFIX'
const CACHE_KEY_OS_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_ENVIRONMENT'
const CACHE_KEY_JOB_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_JOB'
const CACHE_KEY_JOB_INSTANCE_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_JOB_INSTANCE'
const CACHE_KEY_JOB_EXECUTION_VAR = 'GRADLE_BUILD_ACTION_CACHE_KEY_JOB_EXECUTION'

const SEGMENT_DOWNLOAD_TIMEOUT_VAR = 'SEGMENT_DOWNLOAD_TIMEOUT_MINS'
const SEGMENT_DOWNLOAD_TIMEOUT_DEFAULT = 10 * 60 * 1000 // 10 minutes

export function isCacheDisabled(): boolean {
    if (!cache.isFeatureAvailable()) {
        return true
    }
    return params.isCacheDisabled()
}

export function isCacheReadOnly(): boolean {
    return !isCacheWriteOnly() && params.isCacheReadOnly()
}

export function isCacheWriteOnly(): boolean {
    return params.isCacheWriteOnly()
}

export function isCacheOverwriteExisting(): boolean {
    return params.isCacheOverwriteExisting()
}

export function isCacheDebuggingEnabled(): boolean {
    return params.isCacheDebuggingEnabled()
}

export function isCacheCleanupEnabled(): boolean {
    return params.isCacheCleanupEnabled()
}

/**
 * Represents a key used to restore a cache entry.
 * The Github Actions cache will first try for an exact match on the key.
 * If that fails, it will try for a prefix match on any of the restoreKeys.
 */
export class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
    }
}

/**
 * Generates a cache key specific to the current job execution.
 * The key is constructed from the following inputs (with some user overrides):
 * - The cache protocol version
 * - The name of the cache
 * - The runner operating system
 * - The name of the workflow and Job being executed
 * - The matrix values for the Job being executed (job context)
 * - The SHA of the commit being executed
 *
 * Caches are restored by trying to match the these key prefixes in order:
 * - The full key with SHA
 * - A previous key for this Job + matrix
 * - Any previous key for this Job (any matrix)
 * - Any previous key for this cache on the current OS
 */
export function generateCacheKey(cacheName: string): CacheKey {
    const cacheKeyBase = `${getCacheKeyPrefix()}${CACHE_PROTOCOL_VERSION}${cacheName}`

    // At the most general level, share caches for all executions on the same OS
    const cacheKeyForEnvironment = `${cacheKeyBase}|${getCacheKeyEnvironment()}`

    // Prefer caches that run this job
    const cacheKeyForJob = `${cacheKeyForEnvironment}|${getCacheKeyJob()}`

    // Prefer (even more) jobs that run this job with the same context (matrix)
    const cacheKeyForJobContext = `${cacheKeyForJob}[${getCacheKeyJobInstance()}]`

    // Exact match on Git SHA
    const cacheKey = `${cacheKeyForJobContext}-${getCacheKeyJobExecution()}`

    if (params.isCacheStrictMatch()) {
        return new CacheKey(cacheKey, [cacheKeyForJobContext])
    }

    return new CacheKey(cacheKey, [cacheKeyForJobContext, cacheKeyForJob, cacheKeyForEnvironment])
}

export function getCacheKeyPrefix(): string {
    // Prefix can be used to force change all cache keys (defaults to cache protocol version)
    return process.env[CACHE_KEY_PREFIX_VAR] || ''
}

function getCacheKeyEnvironment(): string {
    const runnerOs = process.env['RUNNER_OS'] || ''
    return process.env[CACHE_KEY_OS_VAR] || runnerOs
}

function getCacheKeyJob(): string {
    return process.env[CACHE_KEY_JOB_VAR] || getCacheKeyForJob(github.context.workflow, github.context.job)
}

export function getCacheKeyForJob(workflowName: string, jobId: string): string {
    const sanitizedWorkflow = workflowName.replace(/,/g, '').toLowerCase()
    return `${sanitizedWorkflow}-${jobId}`
}

function getCacheKeyJobInstance(): string {
    const override = process.env[CACHE_KEY_JOB_INSTANCE_VAR]
    if (override) {
        return override
    }

    // By default, we hash the full `matrix` data for the run, to uniquely identify this job invocation
    // The only way we can obtain the `matrix` data is via the `workflow-job-context` parameter in action.yml.
    const workflowJobContext = params.getJobMatrix()
    return hashStrings([workflowJobContext])
}

export function getUniqueLabelForJobInstance(): string {
    return getUniqueLabelForJobInstanceValues(github.context.workflow, github.context.job, params.getJobMatrix())
}

export function getUniqueLabelForJobInstanceValues(workflow: string, jobId: string, matrixJson: string): string {
    const matrix = JSON.parse(matrixJson)
    const matrixString = Object.values(matrix).join('-')
    const label = matrixString ? `${workflow}-${jobId}-${matrixString}` : `${workflow}-${jobId}`
    return sanitize(label)
}

function sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
}

function getCacheKeyJobExecution(): string {
    // Used to associate a cache key with a particular execution (default is bound to the git commit sha)
    return process.env[CACHE_KEY_JOB_EXECUTION_VAR] || github.context.sha
}

export function hashFileNames(fileNames: string[]): string {
    return hashStrings(fileNames.map(x => x.replace(new RegExp(`\\${path.sep}`, 'g'), '/')))
}

export function hashStrings(values: string[]): string {
    const hash = crypto.createHash('md5')
    for (const value of values) {
        hash.update(value)
    }
    return hash.digest('hex')
}

export async function restoreCache(
    cachePath: string[],
    cacheKey: string,
    cacheRestoreKeys: string[],
    listener: CacheEntryListener
): Promise<cache.CacheEntry | undefined> {
    listener.markRequested(cacheKey, cacheRestoreKeys)
    try {
        // Only override the read timeout if the SEGMENT_DOWNLOAD_TIMEOUT_MINS env var has NOT been set
        const cacheRestoreOptions = process.env[SEGMENT_DOWNLOAD_TIMEOUT_VAR]
            ? {}
            : {segmentTimeoutInMs: SEGMENT_DOWNLOAD_TIMEOUT_DEFAULT}
        const restoredEntry = await cache.restoreCache(cachePath, cacheKey, cacheRestoreKeys, cacheRestoreOptions)
        if (restoredEntry !== undefined) {
            listener.markRestored(restoredEntry.key, restoredEntry.size)
        }
        return restoredEntry
    } catch (error) {
        listener.markNotRestored((error as Error).message)
        handleCacheFailure(error, `Failed to restore ${cacheKey}`)
        return undefined
    }
}

export async function saveCache(cachePath: string[], cacheKey: string, listener: CacheEntryListener): Promise<void> {
    try {
        const savedEntry = await cache.saveCache(cachePath, cacheKey)
        listener.markSaved(savedEntry.key, savedEntry.size)
    } catch (error) {
        if (error instanceof cache.ReserveCacheError) {
            listener.markAlreadyExists(cacheKey)
        } else {
            listener.markNotSaved((error as Error).message)
        }
        handleCacheFailure(error, `Failed to save cache entry with path '${cachePath}' and key: ${cacheKey}`)
    }
}

export function cacheDebug(message: string): void {
    if (isCacheDebuggingEnabled()) {
        core.info(message)
    } else {
        core.debug(message)
    }
}

export function handleCacheFailure(error: unknown, message: string): void {
    if (error instanceof cache.ValidationError) {
        // Fail on cache validation errors
        throw error
    }
    if (error instanceof cache.ReserveCacheError) {
        // Reserve cache errors are expected if the artifact has been previously cached
        core.info(`${message}: ${error}`)
    } else {
        // Warn on all other errors
        core.warning(`${message}: ${error}`)
        if (error instanceof Error && error.stack) {
            cacheDebug(error.stack)
        }
    }
}

/**
 * Attempt to delete a file or directory, waiting to allow locks to be released
 */
export async function tryDelete(file: string): Promise<void> {
    const maxAttempts = 5
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (!fs.existsSync(file)) {
            return
        }
        try {
            const stat = fs.lstatSync(file)
            if (stat.isDirectory()) {
                fs.rmSync(file, {recursive: true})
            } else {
                fs.unlinkSync(file)
            }
            return
        } catch (error) {
            if (attempt === maxAttempts) {
                core.warning(`Failed to delete ${file}, which will impact caching. 
It is likely locked by another process. Output of 'jps -ml':
${await getJavaProcesses()}`)
                throw error
            } else {
                cacheDebug(`Attempt to delete ${file} failed. Will try again.`)
                await delay(1000)
            }
        }
    }
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function getJavaProcesses(): Promise<string> {
    const jpsOutput = await exec.getExecOutput('jps', ['-lm'])
    return jpsOutput.stdout
}
