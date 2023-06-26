import * as cache from '@actions/cache'
import {CacheEntry, CacheProvider} from './cache-provider'

const SEGMENT_DOWNLOAD_TIMEOUT_VAR = 'SEGMENT_DOWNLOAD_TIMEOUT_MINS'
const SEGMENT_DOWNLOAD_TIMEOUT_DEFAULT = 10 * 60 * 1000 // 10 minutes

class GitHubCache implements CacheProvider {
    // Only override the read timeout if the SEGMENT_DOWNLOAD_TIMEOUT_MINS env var has NOT been set
    private cacheRestoreOptions = !process.env[SEGMENT_DOWNLOAD_TIMEOUT_VAR]
        ? {segmentTimeoutInMs: SEGMENT_DOWNLOAD_TIMEOUT_DEFAULT}
        : {}

    async saveCache(paths: string[], key: string): Promise<CacheEntry> {
        return cache.saveCache(paths, key)
    }

    async restoreCache(paths: string[], primaryKey: string, restoreKeys?: string[]): Promise<CacheEntry | undefined> {
        return cache.restoreCache(paths, primaryKey, restoreKeys, this.cacheRestoreOptions)
    }
}

export default function createGitHubCache(): CacheProvider | undefined {
    return cache.isFeatureAvailable() ? new GitHubCache() : undefined
}
