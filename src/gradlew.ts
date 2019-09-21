export function wrapperFilename() {
    const isWindows = process.platform === "win32";
    return isWindows ? "gradlew.bat" : "gradlew";
}

export function installScriptFilename() {
    const isWindows = process.platform === "win32";
    return isWindows ? "gradle.bat" : "gradle";
}
