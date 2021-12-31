import * as core from '@actions/core'
import * as exec from '@actions/exec'
import fs from 'fs'
import path from 'path'
import * as gradlew from './gradlew'

export async function executeGradleBuild(executable: string | undefined, root: string, args: string[]): Promise<void> {
    let buildScanUrl: string | undefined

    const buildScanFile = path.resolve(root, 'gradle-build-scan.txt')
    if (fs.existsSync(buildScanFile)) {
        fs.unlinkSync(buildScanFile)
    }

    // Use the provided executable, or look for a Gradle wrapper script to run
    const toExecute = executable ?? gradlew.locateGradleWrapperScript(root)
    verifyIsExecutableScript(toExecute)
    const status: number = await exec.exec(toExecute, args, {
        cwd: root,
        ignoreReturnCode: true
    })

    if (fs.existsSync(buildScanFile)) {
        buildScanUrl = fs.readFileSync(buildScanFile, 'utf-8')
    }

    if (status !== 0) {
        if (buildScanUrl) {
            core.setFailed(`Gradle build failed: ${buildScanUrl}`)
        } else {
            core.setFailed(`Gradle build failed: process exited with status ${status}`)
        }
    }
}

function verifyIsExecutableScript(toExecute: string): void {
    try {
        fs.accessSync(toExecute, fs.constants.X_OK)
    } catch (err) {
        throw new Error(`Gradle script '${toExecute}' is not executable.`)
    }
}
