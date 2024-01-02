import * as cache from '@actions/cache'

/**
 * Collects information on what entries were saved and restored during the action.
 * This information is used to generate a summary of the cache usage.
 */
export class CacheListener {
    cacheEntries: CacheEntryListener[] = []
    cacheReadOnly = false
    cacheWriteOnly = false
    cacheDisabled = false
    cacheDisabledReason = 'disabled'

    get fullyRestored(): boolean {
        return this.cacheEntries.every(x => !x.wasRequestedButNotRestored())
    }

    get cacheStatus(): string {
        if (!cache.isFeatureAvailable()) return 'not available'
        if (this.cacheDisabled) return this.cacheDisabledReason
        if (this.cacheWriteOnly) return 'write-only'
        if (this.cacheReadOnly) return 'read-only'
        return 'enabled'
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
    notRestored: string | undefined

    savedKey: string | undefined
    savedSize: number | undefined
    notSaved: string | undefined

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

    markNotRestored(message: string): CacheEntryListener {
        this.notRestored = message
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

    markNotSaved(message: string): CacheEntryListener {
        this.notSaved = message
        return this
    }
}

export function generateCachingReport(listener: CacheListener): string {
    const entries = listener.cacheEntries

    return `
<details>
<summary><h4>Caching for gradle-build-action was ${listener.cacheStatus} - expand for details</h4></summary>
${renderEntryTable(entries)}

<h5>Cache Entry Details</h5>
<pre>
    ${renderEntryDetails(listener)}
</pre>
</details>
    `
}

function renderEntryTable(entries: CacheEntryListener[]): string {
    return `
<table>
    <tr><td></td><th>Count</th><th>Total Size (Mb)</th></tr>
    <tr><td>Entries Restored</td>
        <td>${getCount(entries, e => e.restoredSize)}</td>
        <td>${getSize(entries, e => e.restoredSize)}</td>
    </tr>
    <tr><td>Entries Saved</td>
        <td>${getCount(entries, e => e.savedSize)}</td>
        <td>${getSize(entries, e => e.savedSize)}</td>
    </tr>
</table>
    `
}

function renderEntryDetails(listener: CacheListener): string {
    return listener.cacheEntries
        .map(
            entry => `Entry: ${entry.entryName}
    Requested Key : ${entry.requestedKey ?? ''}
    Restored  Key : ${entry.restoredKey ?? ''}
              Size: ${formatSize(entry.restoredSize)}
              ${getRestoredMessage(entry, listener.cacheWriteOnly)}
    Saved     Key : ${entry.savedKey ?? ''}
              Size: ${formatSize(entry.savedSize)}
              ${getSavedMessage(entry, listener.cacheReadOnly)}
`
        )
        .join('---\n')
}

function getRestoredMessage(entry: CacheEntryListener, cacheWriteOnly: boolean): string {
    if (entry.notRestored) {
        return `(Entry not restored: ${entry.notRestored})`
    }
    if (cacheWriteOnly) {
        return '(Entry not restored: cache is write-only)'
    }
    if (entry.requestedKey === undefined) {
        return '(Entry not restored: not requested)'
    }
    if (entry.restoredKey === undefined) {
        return '(Entry not restored: no match found)'
    }
    if (entry.restoredKey === entry.requestedKey) {
        return '(Entry restored: exact match found)'
    }
    return '(Entry restored: partial match found)'
}

function getSavedMessage(entry: CacheEntryListener, cacheReadOnly: boolean): string {
    if (entry.notSaved) {
        return `(Entry not saved: ${entry.notSaved})`
    }
    if (entry.savedKey === undefined) {
        if (cacheReadOnly) {
            return '(Entry not saved: cache is read-only)'
        }
        if (entry.notRestored) {
            return '(Entry not saved: not restored)'
        }
        return '(Entry not saved: reason unknown)'
    }
    if (entry.savedSize === 0) {
        return '(Entry not saved: entry with key already exists)'
    }
    return '(Entry saved)'
}

function getCount(
    cacheEntries: CacheEntryListener[],
    predicate: (value: CacheEntryListener) => number | undefined
): number {
    return cacheEntries.filter(e => predicate(e)).length
}

function getSize(
    cacheEntries: CacheEntryListener[],
    predicate: (value: CacheEntryListener) => number | undefined
): number {
    const bytes = cacheEntries.map(e => predicate(e) ?? 0).reduce((p, v) => p + v, 0)
    return Math.round(bytes / (1024 * 1024))
}

function formatSize(bytes: number | undefined): string {
    if (bytes === undefined || bytes === 0) {
        return ''
    }
    return `${Math.round(bytes / (1024 * 1024))} MB (${bytes} B)`
}
