import * as core from '@actions/core'
import * as path from 'path'
import {parseArgsStringToArgv} from 'string-argv'

import * as cache from './cache'
import * as execution from './execution'
import * as gradlew from './gradlew'
import * as provision from './provision'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    try {
        const baseDirectory = process.env[`GITHUB_WORKSPACE`] || ''

        const result = await execution.execute(
            await resolveGradleExecutable(baseDirectory),
            resolveBuildRootDirectory(baseDirectory),
            parseCommandLineArguments()
        )

        if (result.buildScanUrl) {
            core.setOutput('build-scan-url', result.buildScanUrl)
        }

        if (result.status !== 0) {
            core.setFailed(`Gradle process exited with status ${result.status}`)
        }
    } catch (error) {
        core.setFailed(error.message)
    }
}

run()

async function resolveGradleExecutable(baseDirectory: string): Promise<string> {
    const gradleVersion = inputOrNull('gradle-version')
    if (gradleVersion !== null && gradleVersion !== 'wrapper') {
        return path.resolve(await provision.gradleVersion(gradleVersion))
    }

    const gradleExecutable = inputOrNull('gradle-executable')
    if (gradleExecutable !== null) {
        return path.resolve(baseDirectory, gradleExecutable)
    }

    const wrapperDirectory = inputOrNull('wrapper-directory')
    const executableDirectory =
        wrapperDirectory !== null
            ? path.join(baseDirectory, wrapperDirectory)
            : baseDirectory

    await cache.restoreCachedWrapperDist(executableDirectory)

    return path.resolve(executableDirectory, gradlew.wrapperFilename())
}

function resolveBuildRootDirectory(baseDirectory: string): string {
    const buildRootDirectory = inputOrNull('build-root-directory')
    const resolvedBuildRootDirectory =
        buildRootDirectory === null
            ? path.resolve(baseDirectory)
            : path.resolve(baseDirectory, buildRootDirectory)
    return resolvedBuildRootDirectory
}

function parseCommandLineArguments(): string[] {
    const input = inputOrNull('arguments')
    return input === null ? [] : parseArgsStringToArgv(input)
}

function inputOrNull(name: string): string | null {
    const inputString = core.getInput(name)
    if (inputString.length === 0) {
        return null
    }
    return inputString
}
