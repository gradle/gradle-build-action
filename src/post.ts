import * as core from '@actions/core'
import * as cache from './cache'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    core.info('POST Gradle Command Action')
    await cache.cacheWrapperDist()
}

run()
