import * as core from '@actions/core'
import {BuildResult} from './build-results'
import {writeCachingReport, CacheListener, logCachingReport} from './cache-reporting'

export async function writeJobSummary(buildResults: BuildResult[], cacheListener: CacheListener): Promise<void> {
    core.info('Writing job summary')

    if (buildResults.length === 0) {
        core.debug('No Gradle build results found. Summary table will not be generated.')
    } else {
        writeSummaryTable(buildResults)
    }

    writeCachingReport(cacheListener)

    await core.summary.write()
}

export async function logJobSummary(buildResults: BuildResult[], cacheListener: CacheListener): Promise<void> {
    if (buildResults.length === 0) {
        core.debug('No Gradle build results found. Summary table will not be logged.')
    } else {
        logSummaryTable(buildResults)
    }

    logCachingReport(cacheListener)
}

function writeSummaryTable(results: BuildResult[]): void {
    core.summary.addHeading('Gradle Builds', 3)

    core.summary.addRaw(`
<table>
    <tr>
        <th>Root Project</th>
        <th>Requested Tasks</th>
        <th>Gradle Version</th>
        <th>Build Outcome</th>
        <th>Build Scan®</th>
    </tr>${results.map(result => renderBuildResultRow(result)).join('')}
</table>
    `)
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

function logSummaryTable(results: BuildResult[]): void {
    core.info('============================')
    core.info('Gradle Builds')
    core.info('----------------------------')
    core.info('Root Project | Requested Tasks | Gradle Version | Build Outcome | Build Scan®')
    core.info('----------------------------')
    for (const result of results) {
        core.info(
            `${result.rootProjectName} | ${result.requestedTasks} | ${result.gradleVersion} | ${
                result.buildFailed ? 'FAILED' : 'SUCCESS'
            } | ${result.buildScanFailed ? 'Publish failed' : result.buildScanUri}`
        )
    }
    core.info('============================')
}
