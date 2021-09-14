import * as core from '@actions/core'
import * as caches from './caches'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    try {
        await caches.save()
    } catch (error) {
        core.setFailed(String(error))
        if (error instanceof Error && error.stack) {
            core.info(error.stack)
        }
    }
}

run()
