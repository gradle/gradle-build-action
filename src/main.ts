import * as core from '@actions/core'
import * as path from 'path'
import {parseArgsStringToArgv} from 'string-argv'

import * as setupGradle from './setup-gradle'
import * as execution from './execution'
import * as provision from './provision'

const GRADLE_VERSION = 'GRADLE_VERSION'

/**
 * The main entry point for the action, called by Github Actions for the step.
 */
export async function run(): Promise<void> {
    try {
        const workspaceDirectory = process.env[`GITHUB_WORKSPACE`] || ''
        const buildRootDirectory = resolveBuildRootDirectory(workspaceDirectory)

        await setupGradle.setup(buildRootDirectory)

        const executable = await provisionGradle(workspaceDirectory)
        // executable will be undefined if using Gradle wrapper
        if (executable !== undefined) {
            core.addPath(path.dirname(executable))
        }

        // Only execute if arguments have been provided
        const args: string[] = parseCommandLineArguments()
        if (args.length > 0) {
            await execution.executeGradleBuild(executable, buildRootDirectory, args)
        }
    } catch (error) {
        core.setFailed(String(error))
        if (error instanceof Error && error.stack) {
            core.info(error.stack)
        }
    }
}

run()

async function provisionGradle(workspaceDirectory: string): Promise<string | undefined> {
    const gradleVersion = core.getInput('gradle-version')

    // Save the Gradle version for use in the post-action step.
    core.saveState(GRADLE_VERSION, gradleVersion)

    if (gradleVersion !== '' && gradleVersion !== 'wrapper') {
        return path.resolve(await provision.gradleVersion(gradleVersion))
    }

    const gradleExecutable = core.getInput('gradle-executable')
    if (gradleExecutable !== '') {
        return path.resolve(workspaceDirectory, gradleExecutable)
    }

    return undefined
}

function resolveBuildRootDirectory(baseDirectory: string): string {
    const buildRootDirectory = core.getInput('build-root-directory')
    const resolvedBuildRootDirectory =
        buildRootDirectory === '' ? path.resolve(baseDirectory) : path.resolve(baseDirectory, buildRootDirectory)
    return resolvedBuildRootDirectory
}

function parseCommandLineArguments(): string[] {
    const input = core.getInput('arguments')
    return parseArgsStringToArgv(input)
}
