import * as exec from '@actions/exec'
import fs from 'fs'
import path from 'path'

export async function execute(executable: string, root: string, args: string[]): Promise<BuildResult> {
    let buildScanUrl: string | undefined

    const buildScanFile = path.resolve(root, 'gradle-build-scan.txt')
    if (fs.existsSync(buildScanFile)) {
        fs.unlinkSync(buildScanFile)
    }

    const status: number = await exec.exec(executable, args, {
        cwd: root,
        ignoreReturnCode: true
    })

    if (fs.existsSync(buildScanFile)) {
        buildScanUrl = fs.readFileSync(buildScanFile, 'utf-8')
    }

    return new BuildResultImpl(status, buildScanUrl)
}

export interface BuildResult {
    readonly status: number
    readonly buildScanUrl?: string
}

class BuildResultImpl implements BuildResult {
    constructor(readonly status: number, readonly buildScanUrl?: string) {}
}
