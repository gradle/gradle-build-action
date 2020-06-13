import * as core from '@actions/core'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    core.info('POST Gradle Command Action')
}

run()
