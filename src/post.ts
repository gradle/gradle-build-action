import * as core from '@actions/core'
import * as caches from './caches'

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on('uncaughtException', e => handleFailure(e))

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    try {
        await caches.save()
    } catch (error) {
        handleFailure(error)
    }
}

function handleFailure(error: unknown): void {
    core.warning(`Unhandled error saving cache - job will continue: ${error}`)
    if (error instanceof Error && error.stack) {
        core.info(error.stack)
    }
}

run()
