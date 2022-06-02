import * as core from '@actions/core'
import * as setupGradle from './setup-gradle'
import {writeJobSummary} from './job-summary'

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on('uncaughtException', e => handleFailure(e))

/**
 * The post-execution entry point for the action, called by Github Actions after completing all steps for the Job.
 */
export async function run(): Promise<void> {
    try {
        await setupGradle.complete()

        writeJobSummary()
    } catch (error) {
        handleFailure(error)
    }
}

function handleFailure(error: unknown): void {
    core.warning(`Unhandled error in Gradle post-action - job will continue: ${error}`)
    if (error instanceof Error && error.stack) {
        core.info(error.stack)
    }
}

run()
