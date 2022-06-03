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
        if (stringRep === '') {
            return new CacheListener()
        }
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

    markAlreadyExists(key: string): CacheEntryListener {
        this.savedKey = key
        this.savedSize = 0
        return this
    }
}

export function logCachingReport(listener: CacheListener): void {
    if (listener.cacheEntries.length === 0) {
        return
    }

    core.summary.addHeading('Caching Summary', 3)

    const entries = listener.cacheEntries
        .map(
            entry =>
                `Entry: ${entry.entryName}
    Requested Key : ${entry.requestedKey ?? ''}
    Restored  Key : ${entry.restoredKey ?? ''}
              Size: ${formatSize(entry.restoredSize)}
    Saved     Key : ${entry.savedKey ?? ''}
              Size: ${formatSize(entry.savedSize)}`
        )
        .join('\n')

    core.summary.addRaw(
        `

| | Count | Size (Mb) | Size (B) |
| - | -: | -: | -: |
| Restored | ${getCount(listener.cacheEntries, e => e.restoredSize)} | ${getMegaBytes(
            listener.cacheEntries,
            e => e.restoredSize
        )} | ${getBytes(listener.cacheEntries, e => e.restoredSize)} |
| Saved | ${getCount(listener.cacheEntries, e => e.savedSize)} | ${getMegaBytes(
            listener.cacheEntries,
            e => e.savedSize
        )} | ${getBytes(listener.cacheEntries, e => e.savedSize)} |

`
    )

    core.summary.addDetails(
        'Cache Entry Details',
        `
<pre>
${entries}
</pre>

`
    )
}

function getCount(
    cacheEntries: CacheEntryListener[],
    predicate: (value: CacheEntryListener) => number | undefined
): number {
    return cacheEntries.filter(e => predicate(e) !== undefined).length
}

function getBytes(
    cacheEntries: CacheEntryListener[],
    predicate: (value: CacheEntryListener) => number | undefined
): number {
    return cacheEntries.map(e => predicate(e) ?? 0).reduce((p, v) => p + v, 0)
}

function getMegaBytes(
    cacheEntries: CacheEntryListener[],
    predicate: (value: CacheEntryListener) => number | undefined
): number {
    const bytes = getBytes(cacheEntries, predicate)
    return Math.round(bytes / (1024 * 1024))
}

function formatSize(bytes: number | undefined): string {
    if (bytes === undefined) {
        return ''
    }
    if (bytes === 0) {
        return '0 (Entry already exists)'
    }
    return `${Math.round(bytes / (1024 * 1024))} MB (${bytes} B)`
}
