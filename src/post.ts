import * as core from '@actions/core'

import * as cacheWrapper from './cache-wrapper'
import * as cacheDependencies from './cache-dependencies'
import * as cacheConfiguration from './cache-configuration'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    if (isCacheReadOnly()) return

    await cacheWrapper.cacheWrapperDist()
    await cacheDependencies.cacheDependencies()
    await cacheConfiguration.cacheConfiguration()
}

function isCacheReadOnly(): boolean {
    return core.getBooleanInput('cache-read-only')
}

run()
