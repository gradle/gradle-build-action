import * as core from '@actions/core'
import * as github from '@actions/github'
import * as glob from '@actions/glob'
import {DefaultArtifactClient} from '@actions/artifact'
import {GitHub} from '@actions/github/lib/utils'
import {RequestError} from '@octokit/request-error'
import type {PullRequestEvent} from '@octokit/webhooks-types'

import * as path from 'path'
import fs from 'fs'

import * as layout from './repository-layout'
import {DependencyGraphOption, getJobMatrix, getArtifactRetentionDays} from './input-params'

const DEPENDENCY_GRAPH_PREFIX = 'dependency-graph_'

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
    try {
        switch (option) {
            case DependencyGraphOption.Disabled:
            case DependencyGraphOption.Generate: // Performed via init-script: nothing to do here
            case DependencyGraphOption.DownloadAndSubmit: // Performed in setup
                return
            case DependencyGraphOption.GenerateAndSubmit:
                await submitDependencyGraphs(await findGeneratedDependencyGraphFiles())
                return
            case DependencyGraphOption.GenerateAndUpload:
                await uploadDependencyGraphs(await findGeneratedDependencyGraphFiles())
        }
    } catch (e) {
        core.warning(`Failed to ${option} dependency graph. Will continue. ${String(e)}`)
    }
}

async function findGeneratedDependencyGraphFiles(): Promise<string[]> {
    const workspaceDirectory = layout.workspaceDirectory()
    return await findDependencyGraphFiles(workspaceDirectory)
}

async function uploadDependencyGraphs(dependencyGraphFiles: string[]): Promise<void> {
    const workspaceDirectory = layout.workspaceDirectory()

    const artifactClient = new DefaultArtifactClient()
    for (const dependencyGraphFile of dependencyGraphFiles) {
        const relativePath = getRelativePathFromWorkspace(dependencyGraphFile)
        core.info(`Uploading dependency graph file: ${relativePath}`)
        const artifactName = `${DEPENDENCY_GRAPH_PREFIX}${path.basename(dependencyGraphFile)}`
        await artifactClient.uploadArtifact(artifactName, [dependencyGraphFile], workspaceDirectory, {
            retentionDays: getArtifactRetentionDays()
        })
    }
}

async function downloadAndSubmitDependencyGraphs(): Promise<void> {
    try {
        await submitDependencyGraphs(await downloadDependencyGraphs())
    } catch (e) {
        core.warning(`Download and submit dependency graph failed. Will continue. ${String(e)}`)
    }
}

async function submitDependencyGraphs(dependencyGraphFiles: string[]): Promise<void> {
    for (const jsonFile of dependencyGraphFiles) {
        try {
            await submitDependencyGraphFile(jsonFile)
        } catch (error) {
            if (error instanceof RequestError) {
                core.warning(buildWarningMessage(jsonFile, error))
            } else {
                throw error
            }
        }
    }
}

function buildWarningMessage(jsonFile: string, error: RequestError): string {
    const relativeJsonFile = getRelativePathFromWorkspace(jsonFile)
    const mainWarning = `Failed to submit dependency graph ${relativeJsonFile}.\n${String(error)}`
    if (error.message === 'Resource not accessible by integration') {
        return `${mainWarning}
Please ensure that the 'contents: write' permission is available for the workflow job.
Note that this permission is never available for a 'pull_request' trigger from a repository fork.
        `
    }
    return mainWarning
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

async function downloadDependencyGraphs(): Promise<string[]> {
    const workspaceDirectory = layout.workspaceDirectory()

    const findBy = github.context.payload.workflow_run
        ? {
              token: getGithubToken(),
              workflowRunId: github.context.payload.workflow_run.id,
              repositoryName: github.context.repo.repo,
              repositoryOwner: github.context.repo.owner
          }
        : undefined

    const artifactClient = new DefaultArtifactClient()
    const downloadPath = path.resolve(workspaceDirectory, 'dependency-graph')

    const dependencyGraphArtifacts = (
        await artifactClient.listArtifacts({
            latest: true,
            findBy
        })
    ).artifacts.filter(candidate => candidate.name.startsWith(DEPENDENCY_GRAPH_PREFIX))

    for (const artifact of dependencyGraphArtifacts) {
        const downloadedArtifact = await artifactClient.downloadArtifact(artifact.id, {
            path: downloadPath,
            findBy
        })
        core.info(`Downloading dependency-graph artifact ${artifact.name} to ${downloadedArtifact.downloadPath}`)
    }

    return findDependencyGraphFiles(downloadPath)
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
