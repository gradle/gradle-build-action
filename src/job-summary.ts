import * as core from '@actions/core'
import fs from 'fs'
import path from 'path'

interface BuildResult {
    get rootProject(): string
    get requestedTasks(): string
    get gradleVersion(): string
    get buildFailed(): boolean
    get buildScanUri(): string
}

export function writeJobSummary(): void {
    const buildResults = loadBuildResults()
    if (buildResults.length === 0) {
        core.debug('No Gradle build results found. Summary table will not be generated.')
    } else {
        writeSummaryTable(buildResults)
    }
}

function loadBuildResults(): BuildResult[] {
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
    core.summary.addRaw(`| Root Project | Tasks | Gradle Version | Outcome |\n| - | - | - | - |\n`)
    for (const result of results) {
        const tableRow = `| ${result.rootProject} \
                          | ${result.requestedTasks} \
                          | ${result.gradleVersion} \
                          | ${renderOutcome(result)} \
                          |\n`
        core.summary.addRaw(tableRow)
    }
    core.summary.write()
}

function renderOutcome(result: BuildResult): string {
    if (result.buildScanUri) {
        return `[![Gradle Build](https://img.shields.io/badge/Build%20Scan%E2%84%A2-${
            result.buildFailed ? 'FAILED-red' : 'SUCCESS-brightgreen'
        }?logo=Gradle)](${result.buildScanUri})`
    }

    return `![Gradle Build](https://img.shields.io/badge/${
        result.buildFailed ? 'FAILED-red' : 'SUCCESS-brightgreen'
    }?logo=Gradle)`
}
