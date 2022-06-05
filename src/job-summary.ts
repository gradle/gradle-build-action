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
}

export function writeJobSummary(cacheListener: CacheListener): void {
    core.info('Writing job summary')

    const buildResults = loadBuildResults()
    if (buildResults.length === 0) {
        core.debug('No Gradle build results found. Summary table will not be generated.')
    } else {
        writeSummaryTable(buildResults)
    }

    logCachingReport(cacheListener)

    core.summary.write()
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
            {data: 'Outcome', header: true}
        ],
        ...results.map(result => [
            result.rootProjectName,
            result.requestedTasks,
            result.gradleVersion,
            renderOutcome(result)
        ])
    ])
    core.summary.addRaw('\n')
}

function renderOutcome(result: BuildResult): string {
    const labelPart = result.buildScanUri ? 'Build%20Scan%E2%84%A2' : 'Build'
    const outcomePart = result.buildFailed ? 'FAILED-red' : 'SUCCESS-brightgreen'
    const badgeUrl = `https://img.shields.io/badge/${labelPart}-${outcomePart}?logo=Gradle`
    const badgeHtml = `<img src="${badgeUrl}" alt="Gradle Build">`
    const targetUrl = result.buildScanUri ? result.buildScanUri : '#'
    return `<a href="${targetUrl}" rel="nofollow">${badgeHtml}</a>`
}
