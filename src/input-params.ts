import * as core from '@actions/core'
import {parseArgsStringToArgv} from 'string-argv'

export function isCacheDisabled(): boolean {
    return getBooleanInput('cache-disabled')
}

export function isCacheReadOnly(): boolean {
    return getBooleanInput('cache-read-only')
}

export function isCacheWriteOnly(): boolean {
    return getBooleanInput('cache-write-only')
}

export function isCacheStrictMatch(): boolean {
    return getBooleanInput('gradle-home-cache-strict-match')
}

export function isCacheDebuggingEnabled(): boolean {
    return process.env['GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED'] ? true : false
}

export function isCacheCleanupEnabled(): boolean {
    return getBooleanInput('gradle-home-cache-cleanup')
}

export function getCacheProvider(): string {
    return core.getInput('cache-provider') || 'github'
}

export function getCacheIncludes(): string[] {
    return core.getMultilineInput('gradle-home-cache-includes')
}

export function getCacheExcludes(): string[] {
    return core.getMultilineInput('gradle-home-cache-excludes')
}

export function getBuildRootDirectory(): string {
    return core.getInput('build-root-directory')
}

export function getGradleVersion(): string {
    return core.getInput('gradle-version')
}

export function getGradleExecutable(): string {
    return core.getInput('gradle-executable')
}

export function getArguments(): string[] {
    const input = core.getInput('arguments')
    return parseArgsStringToArgv(input)
}

// Internal parameters
export function getJobContext(): string {
    return core.getInput('workflow-job-context')
}

export function getGithubToken(): string {
    return core.getInput('github-token', {required: true})
}

export function isJobSummaryEnabled(): boolean {
    return getBooleanInput('generate-job-summary', true)
}

export function getAWSAccessKeyId(): string {
    return core.getInput('aws-access-key-id')
}

export function getAWSSecretAccessKey(): string {
    return core.getInput('aws-secret-access-key')
}

function getBooleanInput(paramName: string, paramDefault = false): boolean {
    const paramValue = core.getInput(paramName)
    switch (paramValue.toLowerCase().trim()) {
        case '':
            return paramDefault
        case 'false':
            return false
        case 'true':
            return true
    }
    throw TypeError(`The value '${paramValue} is not valid for '${paramName}. Valid values are: [true, false]`)
}
