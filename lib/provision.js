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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const httpm = __importStar(require("typed-rest-client/HttpClient"));
const unzip = __importStar(require("unzipper"));
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const toolCache = __importStar(require("@actions/tool-cache"));
const gradlew = __importStar(require("./gradlew"));
/**
 * @return Gradle executable
 */
function gradleVersion(gradleVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (gradleVersion) {
            case "current":
                return gradleCurrent();
            case "rc":
                return gradleReleaseCandidate();
            case "nightly":
                return gradleNightly();
            case "release-nightly":
                return gradleReleaseNightly();
            default:
                return gradle(gradleVersion);
        }
    });
}
exports.gradleVersion = gradleVersion;
const gradleVersionsBaseUrl = "https://services.gradle.org/versions";
function gradleCurrent() {
    return __awaiter(this, void 0, void 0, function* () {
        const json = yield gradleVersionDeclaration(`${gradleVersionsBaseUrl}/current`);
        return provisionGradle(json.version, json.downloadUrl);
    });
}
function gradleReleaseCandidate() {
    return __awaiter(this, void 0, void 0, function* () {
        const json = yield gradleVersionDeclaration(`${gradleVersionsBaseUrl}/release-candidate`);
        if (json != null) {
            return provisionGradle(json.version, json.downloadUrl);
        }
        return gradleCurrent();
    });
}
function gradleNightly() {
    return __awaiter(this, void 0, void 0, function* () {
        const json = yield gradleVersionDeclaration(`${gradleVersionsBaseUrl}/nightly`);
        return provisionGradle(json.version, json.downloadUrl);
    });
}
function gradleReleaseNightly() {
    return __awaiter(this, void 0, void 0, function* () {
        const json = yield gradleVersionDeclaration(`${gradleVersionsBaseUrl}/release-nightly`);
        return provisionGradle(json.version, json.downloadUrl);
    });
}
function gradle(version) {
    return __awaiter(this, void 0, void 0, function* () {
        const declaration = yield findGradleVersionDeclaration(version);
        if (declaration == null) {
            throw new Error(`Gradle version ${version} does not exists`);
        }
        return provisionGradle(declaration.version, declaration.downloadUrl);
    });
}
function gradleVersionDeclaration(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const httpc = new httpm.HttpClient("gradle-github-action");
        const response = yield httpc.get(url);
        const body = yield response.readBody();
        const json = JSON.parse(body);
        return (json == null || json.version == null || json.version.length <= 0)
            ? null
            : json;
    });
}
function findGradleVersionDeclaration(version) {
    return __awaiter(this, void 0, void 0, function* () {
        const httpc = new httpm.HttpClient("gradle-github-action");
        const response = yield httpc.get(`${gradleVersionsBaseUrl}/all`);
        const body = yield response.readBody();
        const json = JSON.parse(body);
        const found = json.find(entry => {
            return entry.version == version;
        });
        return found != undefined ? found : null;
    });
}
function provisionGradle(version, url) {
    return __awaiter(this, void 0, void 0, function* () {
        const cachedInstall = toolCache.find("gradle", version);
        if (cachedInstall != null && cachedInstall.length > 0) {
            const cachedExecutable = executableFrom(cachedInstall);
            core.info(`Provisioned Gradle executable ${cachedExecutable}`);
            return cachedExecutable;
        }
        const home = process.env["HOME"] || "";
        const tmpdir = path.join(home, "gradle-provision-tmpdir");
        const downloadsDir = path.join(tmpdir, "downloads");
        const installsDir = path.join(tmpdir, "installs");
        yield io.mkdirP(downloadsDir);
        yield io.mkdirP(installsDir);
        core.info(`Downloading ${url}`);
        const downloadPath = path.join(downloadsDir, `gradle-${version}-bin.zip`);
        yield httpDownload(url, downloadPath);
        core.info(`Downloaded at ${downloadPath}, size ${fs.statSync(downloadPath).size}`);
        yield extractZip(downloadPath, installsDir);
        const installDir = path.join(installsDir, `gradle-${version}`);
        core.info(`Extracted in ${installDir}`);
        const executable = executableFrom(installDir);
        fs.chmodSync(executable, "755");
        core.info(`Provisioned Gradle executable ${executable}`);
        toolCache.cacheDir(installDir, "gradle", version);
        return executable;
    });
}
function executableFrom(installDir) {
    return path.join(installDir, "bin", `${gradlew.installScriptFilename()}`);
}
function httpDownload(url, path) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(function (resolve, reject) {
            const httpc = new httpm.HttpClient("gradle-github-action");
            const writeStream = fs.createWriteStream(path);
            httpc.get(url).then(response => {
                response.message.pipe(writeStream)
                    .on("close", () => {
                    resolve();
                })
                    .on("error", err => {
                    reject(err);
                });
            }).catch(reason => {
                reject(reason);
            });
        });
    });
}
function extractZip(zip, destination) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(function (resolve, reject) {
            fs.createReadStream(zip)
                .pipe(unzip.Extract({ "path": destination }))
                .on("close", () => {
                resolve();
            })
                .on("error", err => {
                reject(err);
            });
        });
    });
}
