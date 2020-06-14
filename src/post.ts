import * as cacheWrapper from './cache-wrapper'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    await cacheWrapper.cacheWrapperDist()
}

run()
