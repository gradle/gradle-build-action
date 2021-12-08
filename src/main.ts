import * as core from '@actions/core'
import * as path from 'path'
import * as os from 'os'
import {parseArgsStringToArgv} from 'string-argv'

import * as caches from './caches'
import * as execution from './execution'
import * as provision from './provision'

/**
 * The main entry point for the action, called by Github Actions for the step.
 */
export async function run(): Promise<void> {
    try {
        const workspaceDirectory = process.env[`GITHUB_WORKSPACE`] || ''
        const buildRootDirectory = resolveBuildRootDirectory(workspaceDirectory)
        const gradleUserHome = determineGradleUserHome(buildRootDirectory)

        await caches.restore(gradleUserHome)

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

function determineGradleUserHome(rootDir: string): string {
    const customGradleUserHome = process.env['GRADLE_USER_HOME']
    if (customGradleUserHome) {
        return path.resolve(rootDir, customGradleUserHome)
    }

    return path.resolve(os.homedir(), '.gradle')
}

function parseCommandLineArguments(): string[] {
    const input = core.getInput('arguments')
    return parseArgsStringToArgv(input)
}
