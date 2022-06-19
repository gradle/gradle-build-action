import * as core from '@actions/core'
import fs from 'fs'
import path from 'path'
import {logCachingReport, CacheListener} from './cache-reporting'

export interface BuildResult {
    get rootProjectName(): string
    get rootProjectDir(): string
    get requestedTasks(): string
    get gradleVersion(): string
    get gradleHomeDir(): string
    get buildFailed(): boolean
    get buildScanUri(): string
    get buildScanFailed(): boolean
}

export async function writeJobSummary(buildResults: BuildResult[], cacheListener: CacheListener): Promise<void> {
    core.info('Writing job summary')

    if (buildResults.length === 0) {
        core.debug('No Gradle build results found. Summary table will not be generated.')
    } else {
        writeSummaryTable(buildResults)
    }

    logCachingReport(cacheListener)

    await core.summary.write()
}

export function loadBuildResults(): BuildResult[] {
    const buildResultsDir = path.resolve(process.env['RUNNER_TEMP']!, '.build-results')
    if (!fs.existsSync(buildResultsDir)) {
        return []
    }

    return fs.readdirSync(buildResultsDir).map(file => {
        // Every file in the .build-results dir should be a BuildResults JSON
        const filePath = path.join(buildResultsDir, file)
        const content = fs.readFileSync(filePath, 'utf8')
        return JSON.parse(content) as BuildResult
    })
}

function writeSummaryTable(results: BuildResult[]): void {
    core.summary.addHeading('Gradle Builds', 3)
    core.summary.addTable([
        [
            {data: 'Root Project', header: true},
            {data: 'Tasks', header: true},
            {data: 'Gradle Version', header: true},
            {data: 'Outcome', header: true},
            {data: 'Build Scan™', header: true}
        ],
        ...results.map(result => [
            result.rootProjectName,
            result.requestedTasks,
            result.gradleVersion,
            renderOutcome(result),
            renderBuildScan(result)
        ])
    ])
    core.summary.addRaw('\n')
}

function renderOutcome(result: BuildResult): string {
    return result.buildFailed ? ':x:' : ':white_check_mark:'
}

function renderBuildScan(result: BuildResult): string {
    if (result.buildScanFailed) {
        return renderBuildScanBadge(
            'PUBLISHED_FAILED',
            'orange',
            'https://docs.gradle.com/enterprise/gradle-plugin/#troubleshooting'
        )
    }
    if (result.buildScanUri) {
        return renderBuildScanBadge('PUBLISHED', '06A0CE', result.buildScanUri)
    }
    return renderBuildScanBadge('NOT_PUBLISHED', 'lightgrey', 'https://docs.gradle.com/enterprise/gradle-plugin/')
}

function renderBuildScanBadge(outcomeText: string, outcomeColor: string, targetUrl: string): string {
    const badgeUrl = `https://img.shields.io/badge/Build%20Scan%E2%84%A2-${outcomeText}-${outcomeColor}?logo=Gradle`
    const badgeHtml = `<img src="${badgeUrl}" alt="Build Scan ${outcomeText}" />`
    return `<a href="${targetUrl}" rel="nofollow">${badgeHtml}</a>`
}
