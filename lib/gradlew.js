"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function wrapperFilename() {
    const isWindows = process.platform === "win32";
    return isWindows ? "gradlew.bat" : "gradlew";
}
exports.wrapperFilename = wrapperFilename;
function installScriptFilename() {
    const isWindows = process.platform === "win32";
    return isWindows ? "gradle.bat" : "gradle";
}
exports.installScriptFilename = installScriptFilename;
