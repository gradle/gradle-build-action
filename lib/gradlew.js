"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const IS_WINDOWS = process.platform === "win32";
function wrapperFilename() {
    return IS_WINDOWS ? "gradlew.bat" : "gradlew";
}
exports.wrapperFilename = wrapperFilename;
function installScriptFilename() {
    return IS_WINDOWS ? "gradle.bat" : "gradle";
}
exports.installScriptFilename = installScriptFilename;
