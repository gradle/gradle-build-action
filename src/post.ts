import * as cacheWrapper from './cache-wrapper'
import * as cacheDependencies from './cache-dependencies'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    await cacheWrapper.cacheWrapperDist()
    await cacheDependencies.cacheDependencies()
}

run()
