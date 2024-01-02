import * as core from '@actions/core'
import * as github from '@actions/github'
import {SUMMARY_ENV_VAR} from '@actions/core/lib/summary'
import {RequestError} from '@octokit/request-error'

import * as params from './input-params'
import {BuildResult} from './build-results'
import {CacheListener, generateCachingReport} from './cache-reporting'

export async function generateJobSummary(buildResults: BuildResult[], cacheListener: CacheListener): Promise<void> {
    const summaryTable = renderSummaryTable(buildResults)
    const cachingReport = generateCachingReport(cacheListener)

    if (shouldGenerateJobSummary(buildResults)) {
        core.info('Generating Job Summary')

        core.summary.addRaw(summaryTable)
        core.summary.addRaw(cachingReport)
        await core.summary.write()
    } else {
        core.info('============================')
        core.info(summaryTable)
        core.info('============================')
        core.info(cachingReport)
        core.info('============================')
    }

    if (shouldAddPRComment(buildResults)) {
        await addPRComment(summaryTable)
    }
}

async function addPRComment(jobSummary: string): Promise<void> {
    const context = github.context
    if (context.payload.pull_request == null) {
        core.info('No pull_request trigger: not adding PR comment')
        return
    }

    const pull_request_number = context.payload.pull_request.number
    core.info(`Adding Job Summary as comment to PR #${pull_request_number}.`)

    const prComment = `<h3>Job Summary for gradle-build-action</h3>
<h5>${github.context.workflow} :: <em>${github.context.job}</em></h5>

${jobSummary}`

    const github_token = params.getGithubToken()
    const octokit = github.getOctokit(github_token)
    try {
        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: pull_request_number,
            body: prComment
        })
    } catch (error) {
        if (error instanceof RequestError) {
            core.warning(buildWarningMessage(error))
        } else {
            throw error
        }
    }
}

function buildWarningMessage(error: RequestError): string {
    const mainWarning = `Failed to generate PR comment.\n${String(error)}`
    if (error.message === 'Resource not accessible by integration') {
        return `${mainWarning}
Please ensure that the 'pull-requests: write' permission is available for the workflow job.
Note that this permission is never available for a workflow triggered from a repository fork.
        `
    }
    return mainWarning
}

function renderSummaryTable(results: BuildResult[]): string {
    if (results.length === 0) {
        return 'No Gradle build results detected.'
    }

    return `
<table>
    <tr>
        <th>Gradle Root Project</th>
        <th>Requested Tasks</th>
        <th>Gradle Version</th>
        <th>Build Outcome</th>
        <th>Build Scan®</th>
    </tr>${results.map(result => renderBuildResultRow(result)).join('')}
</table>
    `
}

function renderBuildResultRow(result: BuildResult): string {
    return `
    <tr>
        <td>${result.rootProjectName}</td>
        <td>${result.requestedTasks}</td>
        <td align='center'>${result.gradleVersion}</td>
        <td align='center'>${renderOutcome(result)}</td>
        <td>${renderBuildScan(result)}</td>
    </tr>`
}

function renderOutcome(result: BuildResult): string {
    return result.buildFailed ? ':x:' : ':white_check_mark:'
}

function renderBuildScan(result: BuildResult): string {
    if (result.buildScanFailed) {
        return renderBuildScanBadge(
            'PUBLISH_FAILED',
            'orange',
            'https://docs.gradle.com/enterprise/gradle-plugin/#troubleshooting'
        )
    }
    if (result.buildScanUri) {
        return renderBuildScanBadge('PUBLISHED', '06A0CE', result.buildScanUri)
    }
    return renderBuildScanBadge('NOT_PUBLISHED', 'lightgrey', 'https://scans.gradle.com')
}

function renderBuildScanBadge(outcomeText: string, outcomeColor: string, targetUrl: string): string {
    const badgeUrl = `https://img.shields.io/badge/Build%20Scan%C2%AE-${outcomeText}-${outcomeColor}?logo=Gradle`
    const badgeHtml = `<img src="${badgeUrl}" alt="Build Scan ${outcomeText}" />`
    return `<a href="${targetUrl}" rel="nofollow">${badgeHtml}</a>`
}

function shouldGenerateJobSummary(buildResults: BuildResult[]): boolean {
    // Check if Job Summary is supported on this platform
    if (!process.env[SUMMARY_ENV_VAR]) {
        return false
    }

    // Check if Job Summary is disabled using the deprecated input
    if (!params.isJobSummaryEnabled()) {
        return false
    }

    return shouldAddJobSummary(params.getJobSummaryOption(), buildResults)
}

function shouldAddPRComment(buildResults: BuildResult[]): boolean {
    return shouldAddJobSummary(params.getPRCommentOption(), buildResults)
}

function shouldAddJobSummary(option: params.JobSummaryOption, buildResults: BuildResult[]): boolean {
    switch (option) {
        case params.JobSummaryOption.Always:
            return true
        case params.JobSummaryOption.Never:
            return false
        case params.JobSummaryOption.OnFailure:
            core.info(`Got these build results: ${JSON.stringify(buildResults)}`)
            return buildResults.some(result => result.buildFailed)
    }
}
