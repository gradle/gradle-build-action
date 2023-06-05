import * as core from '@actions/core'

import * as provisioner from './provision'
import * as dependencyGraph from './dependency-graph'

/**
 * The main entry point for the action, called by Github Actions for the step.
 */
export async function run(): Promise<void> {
    try {
        // Download and install Gradle if required
        const executable = await provisioner.provisionGradle()

        // Generate and upload dependency graph artifact
        await dependencyGraph.generateDependencyGraph(executable)
    } catch (error) {
        core.setFailed(String(error))
        if (error instanceof Error && error.stack) {
            core.info(error.stack)
        }
    }
}

run()
