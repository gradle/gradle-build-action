const IS_WINDOWS = process.platform === 'win32'

export function wrapperFilename(): string {
    return IS_WINDOWS ? 'gradlew.bat' : 'gradlew'
}

export function installScriptFilename(): string {
    return IS_WINDOWS ? 'gradle.bat' : 'gradle'
}
