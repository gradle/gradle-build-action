import * as cacheWrapper from './cache-wrapper'
import * as cacheDependencies from './cache-dependencies'
import * as cacheConfiguration from './cache-configuration'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    await cacheWrapper.cacheWrapperDist()
    await cacheDependencies.cacheDependencies()
    await cacheConfiguration.cacheConfiguration()
}

run()
