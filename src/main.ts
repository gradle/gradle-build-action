import * as core from '@actions/core'
import * as path from 'path'
import {parseArgsStringToArgv} from 'string-argv'

import * as github from './github-utils'
import * as cacheWrapper from './cache-wrapper'
import * as execution from './execution'
import * as gradlew from './gradlew'
import * as provision from './provision'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    try {
        const workspaceDirectory = process.env[`GITHUB_WORKSPACE`] || ''
        const buildRootDirectory = resolveBuildRootDirectory(workspaceDirectory)

        const result = await execution.execute(
            await resolveGradleExecutable(
                workspaceDirectory,
                buildRootDirectory
            ),
            buildRootDirectory,
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

async function resolveGradleExecutable(
    workspaceDirectory: string,
    buildRootDirectory: string
): Promise<string> {
    // Download and use a specified Gradle version
    const gradleVersion = github.inputOrNull('gradle-version')
    if (gradleVersion !== null && gradleVersion !== 'wrapper') {
        return path.resolve(await provision.gradleVersion(gradleVersion))
    }

    // Use a Gradle executable if defined
    const gradleExecutable = github.inputOrNull('gradle-executable')
    if (gradleExecutable !== null) {
        if (gradleExecutable.endsWith(gradlew.wrapperFilename())) {
            await cacheWrapper.restoreCachedWrapperDist(
                path.resolve(gradleExecutable, '..')
            )
        }
        return path.resolve(workspaceDirectory, gradleExecutable)
    }

    // By default, use the Gradle wrapper declared for the build
    gradlew.validateGradleWrapper(buildRootDirectory)
    await cacheWrapper.restoreCachedWrapperDist(buildRootDirectory)
    return path.resolve(buildRootDirectory, gradlew.wrapperFilename())
}

function resolveBuildRootDirectory(baseDirectory: string): string {
    const buildRootDirectory = github.inputOrNull('build-root-directory')
    const resolvedBuildRootDirectory =
        buildRootDirectory === null
            ? path.resolve(baseDirectory)
            : path.resolve(baseDirectory, buildRootDirectory)
    return resolvedBuildRootDirectory
}

function parseCommandLineArguments(): string[] {
    const input = github.inputOrNull('arguments')
    return input === null ? [] : parseArgsStringToArgv(input)
}
