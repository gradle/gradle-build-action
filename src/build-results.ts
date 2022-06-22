import * as fs from 'fs'
import * as path from 'path'

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
