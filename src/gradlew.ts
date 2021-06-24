import * as path from 'path'
import fs from 'fs'
import * as core from '@actions/core'

const IS_WINDOWS = process.platform === 'win32'

export function wrapperFilename(): string {
    return IS_WINDOWS ? 'gradlew.bat' : 'gradlew'
}

export function installScriptFilename(): string {
    return IS_WINDOWS ? 'gradle.bat' : 'gradle'
}

export function validateGradleWrapper(gradlewDirectory: string): void {
    const wrapperProperties = path.resolve(
        gradlewDirectory,
        'gradle/wrapper/gradle-wrapper.properties'
    )
    if (!fs.existsSync(wrapperProperties)) {
        core.warning(
            `Cannot locate a Gradle wrapper properties file at '${wrapperProperties}'. Specify 'gradle-version' or 'gradle-executable' for projects without Gradle wrapper configured.`
        )
        throw new Error(
            `Cannot locate a Gradle wrapper within '${gradlewDirectory}'`
        )
    }
}
