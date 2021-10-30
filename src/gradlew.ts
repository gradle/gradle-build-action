import * as path from 'path'
import fs from 'fs'

const IS_WINDOWS = process.platform === 'win32'

export function wrapperScriptFilename(): string {
    return IS_WINDOWS ? 'gradlew.bat' : 'gradlew'
}

export function installScriptFilename(): string {
    return IS_WINDOWS ? 'gradle.bat' : 'gradle'
}

export function locateGradleWrapperScript(buildRootDirectory: string): string {
    validateGradleWrapper(buildRootDirectory)
    return path.resolve(buildRootDirectory, wrapperScriptFilename())
}

function validateGradleWrapper(buildRootDirectory: string): void {
    const wrapperProperties = path.resolve(buildRootDirectory, 'gradle/wrapper/gradle-wrapper.properties')
    if (!fs.existsSync(wrapperProperties)) {
        throw new Error(
            `Cannot locate a Gradle wrapper properties file at '${wrapperProperties}'. Specify 'gradle-version' or 'gradle-executable' for projects without Gradle wrapper configured.`
        )
    }
}
