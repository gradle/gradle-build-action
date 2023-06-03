import * as core from '@actions/core'
import * as path from 'path'

export function workspaceDirectory(): string {
    return process.env[`GITHUB_WORKSPACE`] || ''
}

export function buildRootDirectory(): string {
    const baseDirectory = workspaceDirectory()
    const buildRootDirectoryInput = core.getInput('build-root-directory')
    const resolvedBuildRootDirectory =
        buildRootDirectoryInput === ''
            ? path.resolve(baseDirectory)
            : path.resolve(baseDirectory, buildRootDirectoryInput)
    return resolvedBuildRootDirectory
}
