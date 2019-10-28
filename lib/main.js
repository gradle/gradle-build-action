"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const path = __importStar(require("path"));
const string_argv_1 = require("string-argv");
const execution = __importStar(require("./execution"));
const gradlew = __importStar(require("./gradlew"));
const provision = __importStar(require("./provision"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const baseDirectory = process.env[`GITHUB_WORKSPACE`] || "";
            let result = yield execution.execute(yield resolveGradleExecutable(baseDirectory), resolveBuildRootDirectory(baseDirectory), parseCommandLineArguments());
            if (result.buildScanUrl) {
                core.setOutput("build-scan-url", result.buildScanUrl);
            }
            if (result.status != 0) {
                core.setFailed(`Gradle process exited with status ${result.status}`);
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
exports.run = run;
run();
function resolveGradleExecutable(baseDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        const gradleVersion = inputOrNull("gradle-version");
        if (gradleVersion != null) {
            return path.resolve(yield provision.gradleVersion(gradleVersion));
        }
        const gradleExecutable = inputOrNull("gradle-executable");
        if (gradleExecutable != null) {
            return path.resolve(baseDirectory, gradleExecutable);
        }
        const wrapperDirectory = inputOrNull("wrapper-directory");
        const executableDirectory = wrapperDirectory != null
            ? path.join(baseDirectory, wrapperDirectory)
            : baseDirectory;
        return path.resolve(executableDirectory, gradlew.wrapperFilename());
    });
}
function resolveBuildRootDirectory(baseDirectory) {
    let buildRootDirectory = inputOrNull("build-root-directory");
    return buildRootDirectory == null
        ? path.resolve(baseDirectory)
        : path.resolve(baseDirectory, buildRootDirectory);
}
function parseCommandLineArguments() {
    const input = inputOrNull("arguments");
    return input == null ? [] : string_argv_1.parseArgsStringToArgv(input);
}
function inputOrNull(name) {
    const inputString = core.getInput(name);
    if (inputString.length == 0) {
        return null;
    }
    return inputString;
}
