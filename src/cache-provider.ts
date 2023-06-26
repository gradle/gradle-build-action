export interface CacheProvider {
    saveCache(paths: string[], key: string): Promise<CacheEntry>

    restoreCache(paths: string[], primaryKey: string, restoreKeys?: string[]): Promise<CacheEntry | undefined>
}

export interface CacheEntry {
    key: string
    size?: number
}
