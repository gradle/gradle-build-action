import * as core from '@actions/core'

import * as caches from './caches'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    if (isCacheReadOnly()) return

    await caches.save()
}

function isCacheReadOnly(): boolean {
    return core.getBooleanInput('cache-read-only')
}

run()
