import * as core from '@actions/core'
import * as path from 'path'
import {parseArgsStringToArgv} from 'string-argv'

import * as caches from './caches'
import * as execution from './execution'
import * as gradlew from './gradlew'
import * as provision from './provision'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    try {
        const workspaceDirectory = process.env[`GITHUB_WORKSPACE`] || ''
        const buildRootDirectory = resolveBuildRootDirectory(workspaceDirectory)

        await caches.restore(buildRootDirectory)

        const args: string[] = parseCommandLineArguments()

        const result = await execution.execute(
            await resolveGradleExecutable(
                workspaceDirectory,
                buildRootDirectory
            ),
            buildRootDirectory,
            args
        )

        if (result.buildScanUrl) {
            core.setOutput('build-scan-url', result.buildScanUrl)
        }

        if (result.status !== 0) {
            if (result.buildScanUrl) {
                core.setFailed(`Gradle build failed: ${result.buildScanUrl}`)
            } else {
                core.setFailed(
                    `Gradle build failed: process exited with status ${result.status}`
                )
            }
        } else {
            if (result.buildScanUrl) {
                core.notice(`Gradle build succeeded: ${result.buildScanUrl}`)
            }
        }
    } catch (error) {
        core.setFailed(String(error))
        if (error instanceof Error && error.stack) {
            core.info(error.stack)
        }
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
        return path.resolve(workspaceDirectory, gradleExecutable)
    }

    return gradlew.locateGradleWrapperScript(buildRootDirectory)
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
