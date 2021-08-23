import * as core from '@actions/core'

import * as cacheGradleUserHome from './cache-gradle-user-home'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    if (isCacheReadOnly()) return

    await cacheGradleUserHome.save()
}

function isCacheReadOnly(): boolean {
    return core.getBooleanInput('cache-read-only')
}

run()
