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
    const gradleVersion = github.inputOrNull('gradle-version')
    if (gradleVersion !== null && gradleVersion !== 'wrapper') {
        return path.resolve(await provision.gradleVersion(gradleVersion))
    }

    const gradleExecutable = github.inputOrNull('gradle-executable')
    if (gradleExecutable !== null) {
        if (gradleExecutable.endsWith(gradlew.wrapperFilename())) {
            await cacheWrapper.restoreCachedWrapperDist(
                path.resolve(gradleExecutable, '..')
            )
        }
        return path.resolve(baseDirectory, gradleExecutable)
    }

    const wrapperDirectory = github.inputOrNull('wrapper-directory')
    const gradlewDirectory =
        wrapperDirectory !== null
            ? path.join(baseDirectory, wrapperDirectory)
            : baseDirectory

    await cacheWrapper.restoreCachedWrapperDist(gradlewDirectory)

    return path.resolve(gradlewDirectory, gradlew.wrapperFilename())
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
