import * as core from '@actions/core'
import {SUMMARY_ENV_VAR} from '@actions/core/lib/summary'

import * as params from './input-params'
import {BuildResult} from './build-results'
import {CacheListener, generateCachingReport} from './cache-reporting'

export async function generateJobSummary(buildResults: BuildResult[], cacheListener: CacheListener): Promise<void> {
    const summaryTable = renderSummaryTable(buildResults)
    const cachingReport = generateCachingReport(cacheListener)

    if (shouldGenerateJobSummary()) {
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
}

function renderSummaryTable(results: BuildResult[]): string {
    if (results.length === 0) {
        return 'No Gradle build results detected.'
    }

    return `
<h3>Gradle Builds</h3>
<table>
    <tr>
        <th>Root Project</th>
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

function shouldGenerateJobSummary(): boolean {
    // Check if Job Summary is supported on this platform
    if (!process.env[SUMMARY_ENV_VAR]) {
        return false
    }

    return params.isJobSummaryEnabled()
}
