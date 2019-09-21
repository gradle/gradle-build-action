import * as fs from "fs";
import * as path from "path";
import * as httpm from 'typed-rest-client/HttpClient';
import * as unzip from "unzipper"
import * as core from "@actions/core";
import * as io from '@actions/io';
import * as toolCache from "@actions/tool-cache";

import * as gradlew from "./gradlew";


/**
 * @return Gradle executable
 */
export async function gradleVersion(gradleVersion: string): Promise<string> {
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
}


const gradleVersionsBaseUrl = "https://services.gradle.org/versions";


async function gradleCurrent(): Promise<string> {
    const json = await gradleVersionDeclaration(`${gradleVersionsBaseUrl}/current`);
    return provisionGradle(json.version, json.downloadUrl);
}


async function gradleReleaseCandidate(): Promise<string> {
    const json = await gradleVersionDeclaration(`${gradleVersionsBaseUrl}/release-candidate`);
    if (json != null) {
        return provisionGradle(json.version, json.downloadUrl);
    }
    return gradleCurrent();
}


async function gradleNightly(): Promise<string> {
    const json = await gradleVersionDeclaration(`${gradleVersionsBaseUrl}/nightly`);
    return provisionGradle(json.version, json.downloadUrl);
}


async function gradleReleaseNightly(): Promise<string> {
    const json = await gradleVersionDeclaration(`${gradleVersionsBaseUrl}/release-nightly`);
    return provisionGradle(json.version, json.downloadUrl);
}


async function gradle(version: string): Promise<string> {
    const declaration = await findGradleVersionDeclaration(version);
    if (declaration == null) {
        throw new Error(`Gradle version ${version} does not exists`);
    }
    return provisionGradle(declaration.version, declaration.downloadUrl);
}


async function gradleVersionDeclaration(url: string): Promise<any | null> {
    const httpc = new httpm.HttpClient("gradle-github-action");
    const response = await httpc.get(url);
    const body = await response.readBody();
    const json = JSON.parse(body);
    return (json == null || json.version == null || json.version.length <= 0)
        ? null
        : json
}


async function findGradleVersionDeclaration(version: string): Promise<any | null> {
    const httpc = new httpm.HttpClient("gradle-github-action");
    const response = await httpc.get(`${gradleVersionsBaseUrl}/all`);
    const body = await response.readBody();
    const json = JSON.parse(body);
    const found = json.find(entry => {
        return entry.version == version;
    });
    return found != undefined ? found : null
}

async function provisionGradle(version: string, url: string): Promise<string> {

    const cachedInstall: string = toolCache.find("gradle", version);
    if (cachedInstall != null && cachedInstall.length > 0) {
        const cachedExecutable = executableFrom(cachedInstall);
        core.info(`Provisioned Gradle executable ${cachedExecutable}`);
        return cachedExecutable;
    }

    const home = process.env["HOME"] || "";
    const tmpdir = path.join(home, "gradle-provision-tmpdir");
    const downloadsDir = path.join(tmpdir, "downloads");
    const installsDir = path.join(tmpdir, "installs");
    await io.mkdirP(downloadsDir);
    await io.mkdirP(installsDir);

    core.info(`Downloading ${url}`);

    const downloadPath = path.join(downloadsDir, `gradle-${version}-bin.zip`);
    await httpDownload(url, downloadPath);
    core.info(`Downloaded at ${downloadPath}, size ${fs.statSync(downloadPath).size}`);

    await extractZip(downloadPath, installsDir);
    const installDir = path.join(installsDir, `gradle-${version}`);
    core.info(`Extracted in ${installDir}`);

    const executable = executableFrom(installDir);
    fs.chmodSync(executable, "755");
    core.info(`Provisioned Gradle executable ${executable}`);

    toolCache.cacheDir(installDir, "gradle", version);

    return executable;
}


function executableFrom(installDir: string): string {
    return path.join(installDir, "bin", `${gradlew.installScriptFilename()}`);
}


async function httpDownload(url: string, path: string): Promise<void> {
    return new Promise<void>(function (resolve, reject) {
        const httpc = new httpm.HttpClient("gradle-github-action");
        const writeStream = fs.createWriteStream(path);
        httpc.get(url).then(response => {
            response.message.pipe(writeStream)
                .on("close", () => {
                    resolve();
                })
                .on("error", err => {
                    reject(err)
                });
        }).catch(reason => {
            reject(reason);
        });
    });
}


async function extractZip(zip: string, destination: string): Promise<void> {
    return new Promise<void>(function (resolve, reject) {
        fs.createReadStream(zip)
            .pipe(unzip.Extract({"path": destination}))
            .on("close", () => {
                resolve();
            })
            .on("error", err => {
                reject(err)
            });
    });
}
