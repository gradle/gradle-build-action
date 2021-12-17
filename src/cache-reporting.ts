import * as core from '@actions/core'

/**
 * Collects information on what entries were saved and restored during the action.
 * This information is used to generate a summary of the cache usage.
 */
export class CacheListener {
    cacheEntries: CacheEntryListener[] = []

    get fullyRestored(): boolean {
        return this.cacheEntries.every(x => !x.wasRequestedButNotRestored())
    }

    entry(name: string): CacheEntryListener {
        for (const entry of this.cacheEntries) {
            if (entry.entryName === name) {
                return entry
            }
        }

        const newEntry = new CacheEntryListener(name)
        this.cacheEntries.push(newEntry)
        return newEntry
    }

    stringify(): string {
        return JSON.stringify(this)
    }

    static rehydrate(stringRep: string): CacheListener {
        const rehydrated: CacheListener = Object.assign(new CacheListener(), JSON.parse(stringRep))
        const entries = rehydrated.cacheEntries
        for (let index = 0; index < entries.length; index++) {
            const rawEntry = entries[index]
            entries[index] = Object.assign(new CacheEntryListener(rawEntry.entryName), rawEntry)
        }
        return rehydrated
    }
}

/**
 * Collects information on the state of a single cache entry.
 */
export class CacheEntryListener {
    entryName: string
    requestedKey: string | undefined
    requestedRestoreKeys: string[] | undefined
    restoredKey: string | undefined
    restoredSize: number | undefined

    savedKey: string | undefined
    savedSize: number | undefined

    constructor(entryName: string) {
        this.entryName = entryName
    }

    wasRequestedButNotRestored(): boolean {
        return this.requestedKey !== undefined && this.restoredKey === undefined
    }

    markRequested(key: string, restoreKeys: string[] = []): CacheEntryListener {
        this.requestedKey = key
        this.requestedRestoreKeys = restoreKeys
        return this
    }

    markRestored(key: string, size: number | undefined): CacheEntryListener {
        this.restoredKey = key
        this.restoredSize = size
        return this
    }

    markSaved(key: string, size: number | undefined): CacheEntryListener {
        this.savedKey = key
        this.savedSize = size
        return this
    }
}

export function logCachingReport(listener: CacheListener): void {
    if (listener.cacheEntries.length === 0) {
        return
    }

    core.info(`---------- Caching Summary -------------
Restored Entries Count: ${getCount(listener.cacheEntries, e => e.restoredSize)}
                  Size: ${getSum(listener.cacheEntries, e => e.restoredSize)}
Saved Entries    Count: ${getCount(listener.cacheEntries, e => e.savedSize)}
                  Size: ${getSum(listener.cacheEntries, e => e.savedSize)}`)

    core.startGroup('Cache Entry details')
    for (const entry of listener.cacheEntries) {
        core.info(`Entry: ${entry.entryName}
    Requested Key : ${entry.requestedKey ?? ''}
    Restored  Key : ${entry.restoredKey ?? ''}
              Size: ${formatSize(entry.restoredSize)}
    Saved     Key : ${entry.savedKey ?? ''}
              Size: ${formatSize(entry.savedSize)}`)
    }
    core.endGroup()
}

function getCount(
    cacheEntries: CacheEntryListener[],
    predicate: (value: CacheEntryListener) => number | undefined
): number {
    return cacheEntries.filter(e => predicate(e) !== undefined).length
}

function getSum(
    cacheEntries: CacheEntryListener[],
    predicate: (value: CacheEntryListener) => number | undefined
): string {
    return formatSize(cacheEntries.map(e => predicate(e) ?? 0).reduce((p, v) => p + v, 0))
}

function formatSize(bytes: number | undefined): string {
    if (bytes === undefined || bytes === 0) {
        return ''
    }
    return `${Math.round(bytes / (1024 * 1024))} MB (${bytes} B)`
}
