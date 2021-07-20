import * as core from '@actions/core'
import * as path from 'path'
import {parseArgsStringToArgv} from 'string-argv'

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
    const gradleVersion = core.getInput('gradle-version')
    if (gradleVersion !== '' && gradleVersion !== 'wrapper') {
        return path.resolve(await provision.gradleVersion(gradleVersion))
    }

    const gradleExecutable = core.getInput('gradle-executable')
    if (gradleExecutable !== '') {
        if (gradleExecutable.endsWith(gradlew.wrapperFilename())) {
            await cacheWrapper.restoreCachedWrapperDist(
                path.resolve(gradleExecutable, '..')
            )
        }
        return path.resolve(workspaceDirectory, gradleExecutable)
    }

    const wrapperDirectory = core.getInput('wrapper-directory')
    const gradlewDirectory =
        wrapperDirectory !== ''
            ? path.resolve(workspaceDirectory, wrapperDirectory)
            : buildRootDirectory

    gradlew.validateGradleWrapper(gradlewDirectory)
    await cacheWrapper.restoreCachedWrapperDist(gradlewDirectory)

    return path.resolve(gradlewDirectory, gradlew.wrapperFilename())
}

function resolveBuildRootDirectory(baseDirectory: string): string {
    const buildRootDirectory = core.getInput('build-root-directory')
    const resolvedBuildRootDirectory =
        buildRootDirectory === ''
            ? path.resolve(baseDirectory)
            : path.resolve(baseDirectory, buildRootDirectory)
    return resolvedBuildRootDirectory
}

function parseCommandLineArguments(): string[] {
    const input = core.getInput('arguments')
    return parseArgsStringToArgv(input)
}
