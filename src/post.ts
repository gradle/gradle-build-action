import * as cache from './cache'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    await cache.cacheWrapperDist()
}

run()
