import * as core from '@actions/core'
import * as dependencyGraph from './dependency-graph'

export async function run(): Promise<void> {
    try {
        // Retrieve the dependency graph artifact and submit via Dependency Submission API
        await dependencyGraph.downloadAndSubmitDependencyGraphs()
    } catch (error) {
        core.setFailed(String(error))
        if (error instanceof Error && error.stack) {
            core.info(error.stack)
        }
    }
}

run()
