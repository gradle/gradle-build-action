import * as core from '@actions/core'
import * as artifact from '@actions/artifact'
import * as github from '@actions/github'
import * as glob from '@actions/glob'
import * as toolCache from '@actions/tool-cache'
import {GitHub} from '@actions/github/lib/utils'
import {RequestError} from '@octokit/request-error'
import type {PullRequestEvent} from '@octokit/webhooks-types'

import * as path from 'path'
import fs from 'fs'

import * as layout from './repository-layout'
import {DependencyGraphOption, getJobMatrix} from './input-params'
import {UploadOptions} from '@actions/artifact'

const DEPENDENCY_GRAPH_ARTIFACT = 'dependency-graph'

export async function setup(option: DependencyGraphOption): Promise<void> {
    if (option === DependencyGraphOption.Disabled) {
        return
    }
    // Download and submit early, for compatability with dependency review.
    if (option === DependencyGraphOption.DownloadAndSubmit) {
        await downloadAndSubmitDependencyGraphs()
        return
    }

    core.info('Enabling dependency graph generation')
    core.exportVariable('GITHUB_DEPENDENCY_GRAPH_ENABLED', 'true')
    core.exportVariable('GITHUB_DEPENDENCY_GRAPH_JOB_CORRELATOR', getJobCorrelator())
    core.exportVariable('GITHUB_DEPENDENCY_GRAPH_JOB_ID', github.context.runId)
    core.exportVariable('GITHUB_DEPENDENCY_GRAPH_REF', github.context.ref)
    core.exportVariable('GITHUB_DEPENDENCY_GRAPH_SHA', getShaFromContext())
    core.exportVariable('GITHUB_DEPENDENCY_GRAPH_WORKSPACE', layout.workspaceDirectory())
    core.exportVariable(
        'DEPENDENCY_GRAPH_REPORT_DIR',
        path.resolve(layout.workspaceDirectory(), 'dependency-graph-reports')
    )
}

export async function complete(option: DependencyGraphOption): Promise<void> {
    switch (option) {
        case DependencyGraphOption.Disabled:
        case DependencyGraphOption.DownloadAndSubmit: // Performed in setup
            return
        case DependencyGraphOption.Generate:
            await uploadDependencyGraphs()
            return
        case DependencyGraphOption.GenerateAndSubmit:
            await submitDependencyGraphs(await uploadDependencyGraphs())
            return
    }
}

async function uploadDependencyGraphs(): Promise<string[]> {
    const workspaceDirectory = layout.workspaceDirectory()
    const graphFiles = await findDependencyGraphFiles(workspaceDirectory)

    const relativeGraphFiles = graphFiles.map(x => getRelativePathFromWorkspace(x))
    core.info(`Uploading dependency graph files: ${relativeGraphFiles}`)

    const artifactClient = artifact.create()

    const options: UploadOptions = {
        retentionDays: 1
    }

    artifactClient.uploadArtifact(DEPENDENCY_GRAPH_ARTIFACT, graphFiles, workspaceDirectory, options)

    return graphFiles
}

async function downloadAndSubmitDependencyGraphs(): Promise<void> {
    const workspaceDirectory = layout.workspaceDirectory()
    submitDependencyGraphs(await retrieveDependencyGraphs(workspaceDirectory))
}

async function submitDependencyGraphs(dependencyGraphFiles: string[]): Promise<void> {
    for (const jsonFile of dependencyGraphFiles) {
        try {
            await submitDependencyGraphFile(jsonFile)
        } catch (error) {
            if (error instanceof RequestError) {
                const relativeJsonFile = getRelativePathFromWorkspace(jsonFile)
                core.warning(
                    `Failed to submit dependency graph ${relativeJsonFile}.\n` +
                        "Please ensure that the 'contents: write' permission is available for the workflow job.\n" +
                        "Note that this permission is never available for a 'pull_request' trigger from a repository fork."
                )
            } else {
                throw error
            }
        }
    }
}

async function submitDependencyGraphFile(jsonFile: string): Promise<void> {
    const octokit = getOctokit()
    const jsonContent = fs.readFileSync(jsonFile, 'utf8')

    const jsonObject = JSON.parse(jsonContent)
    jsonObject.owner = github.context.repo.owner
    jsonObject.repo = github.context.repo.repo
    const response = await octokit.request('POST /repos/{owner}/{repo}/dependency-graph/snapshots', jsonObject)

    const relativeJsonFile = getRelativePathFromWorkspace(jsonFile)
    core.notice(`Submitted ${relativeJsonFile}: ${response.data.message}`)
}

async function retrieveDependencyGraphs(workspaceDirectory: string): Promise<string[]> {
    if (github.context.payload.workflow_run) {
        return await retrieveDependencyGraphsForWorkflowRun(github.context.payload.workflow_run.id, workspaceDirectory)
    }
    return retrieveDependencyGraphsForCurrentWorkflow(workspaceDirectory)
}

async function retrieveDependencyGraphsForWorkflowRun(runId: number, workspaceDirectory: string): Promise<string[]> {
    const octokit = getOctokit()

    // Find the workflow run artifacts named "dependency-graph"
    const artifacts = await octokit.rest.actions.listWorkflowRunArtifacts({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        run_id: runId
    })

    const matchArtifact = artifacts.data.artifacts.find(candidate => {
        return candidate.name === DEPENDENCY_GRAPH_ARTIFACT
    })

    if (matchArtifact === undefined) {
        throw new Error(`Dependency graph artifact not found. Has it been generated by workflow run '${runId}'?`)
    }

    // Download the dependency-graph artifact
    const download = await octokit.rest.actions.downloadArtifact({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        artifact_id: matchArtifact.id,
        archive_format: 'zip'
    })

    const downloadBuffer = download.data as ArrayBuffer
    const downloadZip = path.resolve(workspaceDirectory, 'dependency-graph.zip')
    fs.writeFileSync(downloadZip, Buffer.from(downloadBuffer))

    // Expance the dependency-graph zip and locate each dependency-graph JSON file
    const extractDir = path.resolve(workspaceDirectory, 'dependency-graph')
    const extracted = await toolCache.extractZip(downloadZip, extractDir)
    core.info(`Extracted dependency graph artifacts to ${extracted}: ${fs.readdirSync(extracted)}`)

    return findDependencyGraphFiles(extracted)
}

async function retrieveDependencyGraphsForCurrentWorkflow(workspaceDirectory: string): Promise<string[]> {
    const artifactClient = artifact.create()
    const downloadPath = path.resolve(workspaceDirectory, 'dependency-graph')
    await artifactClient.downloadArtifact(DEPENDENCY_GRAPH_ARTIFACT, downloadPath)
    return await findDependencyGraphFiles(downloadPath)
}

async function findDependencyGraphFiles(dir: string): Promise<string[]> {
    const globber = await glob.create(`${dir}/dependency-graph-reports/*.json`)
    const graphFiles = globber.glob()
    return graphFiles
}

function getOctokit(): InstanceType<typeof GitHub> {
    return github.getOctokit(getGithubToken())
}

function getGithubToken(): string {
    return core.getInput('github-token', {required: true})
}

function getRelativePathFromWorkspace(file: string): string {
    const workspaceDirectory = layout.workspaceDirectory()
    return path.relative(workspaceDirectory, file)
}

function getShaFromContext(): string {
    const context = github.context
    const pullRequestEvents = [
        'pull_request',
        'pull_request_comment',
        'pull_request_review',
        'pull_request_review_comment'
        // Note that pull_request_target is omitted here.
        // That event runs in the context of the base commit of the PR,
        // so the snapshot should not be associated with the head commit.
    ]
    if (pullRequestEvents.includes(context.eventName)) {
        const pr = (context.payload as PullRequestEvent).pull_request
        return pr.head.sha
    } else {
        return context.sha
    }
}

function getJobCorrelator(): string {
    return constructJobCorrelator(github.context.workflow, github.context.job, getJobMatrix())
}

export function constructJobCorrelator(workflow: string, jobId: string, matrixJson: string): string {
    const matrixString = describeMatrix(matrixJson)
    const label = matrixString ? `${workflow}-${jobId}-${matrixString}` : `${workflow}-${jobId}`
    return sanitize(label)
}

function describeMatrix(matrixJson: string): string {
    core.debug(`Got matrix json: ${matrixJson}`)
    const matrix = JSON.parse(matrixJson)
    if (matrix) {
        return Object.values(matrix).join('-')
    }
    return ''
}

function sanitize(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9_-\s]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase()
}
