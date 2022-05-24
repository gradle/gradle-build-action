import * as core from '@actions/core'
import * as exec from '@actions/exec'
import fs from 'fs'
import * as gradlew from './gradlew'

export async function executeGradleBuild(executable: string | undefined, root: string, args: string[]): Promise<void> {
    // Use the provided executable, or look for a Gradle wrapper script to run
    const toExecute = executable ?? gradlew.locateGradleWrapperScript(root)
    verifyIsExecutableScript(toExecute)
    const status: number = await exec.exec(toExecute, args, {
        cwd: root,
        ignoreReturnCode: true
    })

    if (status !== 0) {
        core.setFailed(`Gradle build failed: see console output for details`)
    }
}

function verifyIsExecutableScript(toExecute: string): void {
    try {
        fs.accessSync(toExecute, fs.constants.X_OK)
    } catch (err) {
        throw new Error(`Gradle script '${toExecute}' is not executable.`)
    }
}
