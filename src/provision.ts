import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as httpm from 'typed-rest-client/HttpClient'
import * as unzip from 'unzipper'
import * as core from '@actions/core'
import * as io from '@actions/io'
import * as toolCache from '@actions/tool-cache'

import * as gradlew from './gradlew'

const httpc = new httpm.HttpClient('eskatos/gradle-command-action')
const gradleVersionsBaseUrl = 'https://services.gradle.org/versions'

/**
 * @return Gradle executable path
 */
export async function gradleVersion(version: string): Promise<string> {
    switch (version) {
        case 'current':
            return gradleCurrent()
        case 'rc':
            return gradleReleaseCandidate()
        case 'nightly':
            return gradleNightly()
        case 'release-nightly':
            return gradleReleaseNightly()
        default:
            return gradle(version)
    }
}

async function gradleCurrent(): Promise<string> {
    const versionInfo = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/current`
    )
    return provisionGradle(versionInfo.version, versionInfo.downloadUrl)
}

async function gradleReleaseCandidate(): Promise<string> {
    const versionInfo = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/release-candidate`
    )
    if (versionInfo && versionInfo.version && versionInfo.downloadUrl) {
        return provisionGradle(versionInfo.version, versionInfo.downloadUrl)
    }
    core.info('No current release-candidate found, will fallback to current')
    return gradleCurrent()
}

async function gradleNightly(): Promise<string> {
    const versionInfo = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/nightly`
    )
    return provisionGradle(versionInfo.version, versionInfo.downloadUrl)
}

async function gradleReleaseNightly(): Promise<string> {
    const versionInfo = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/release-nightly`
    )
    return provisionGradle(versionInfo.version, versionInfo.downloadUrl)
}

async function gradle(version: string): Promise<string> {
    const versionInfo = await findGradleVersionDeclaration(version)
    if (!versionInfo) {
        throw new Error(`Gradle version ${version} does not exists`)
    }
    return provisionGradle(versionInfo.version, versionInfo.downloadUrl)
}

async function gradleVersionDeclaration(
    url: string
): Promise<GradleVersionInfo> {
    return await httpGetGradleVersion(url)
}

async function findGradleVersionDeclaration(
    version: string
): Promise<GradleVersionInfo | undefined> {
    const gradleVersions = await httpGetGradleVersions(
        `${gradleVersionsBaseUrl}/all`
    )
    return gradleVersions.find((entry: GradleVersionInfo) => {
        return entry.version === version
    })
}

async function provisionGradle(version: string, url: string): Promise<string> {
    const cachedInstall: string = toolCache.find('gradle', version)
    if (cachedInstall.length > 0) {
        const cachedExecutable = executableFrom(cachedInstall)
        core.info(`Provisioned Gradle executable ${cachedExecutable}`)
        return cachedExecutable
    }

    const home = os.homedir()
    const tmpdir = path.join(home, 'gradle-provision-tmpdir')
    const downloadsDir = path.join(tmpdir, 'downloads')
    const installsDir = path.join(tmpdir, 'installs')
    await io.mkdirP(downloadsDir)
    await io.mkdirP(installsDir)

    core.info(`Downloading ${url}`)

    const downloadPath = path.join(downloadsDir, `gradle-${version}-bin.zip`)
    await httpDownload(url, downloadPath)
    core.info(
        `Downloaded at ${downloadPath}, size ${fs.statSync(downloadPath).size}`
    )

    await extractZip(downloadPath, installsDir)
    const installDir = path.join(installsDir, `gradle-${version}`)
    core.info(`Extracted in ${installDir}`)

    const executable = executableFrom(installDir)
    fs.chmodSync(executable, '755')
    core.info(`Provisioned Gradle executable ${executable}`)

    toolCache.cacheDir(installDir, 'gradle', version)

    return executable
}

function executableFrom(installDir: string): string {
    return path.join(installDir, 'bin', `${gradlew.installScriptFilename()}`)
}

async function httpGetGradleVersion(url: string): Promise<GradleVersionInfo> {
    return JSON.parse(await httpGetString(url))
}

async function httpGetGradleVersions(
    url: string
): Promise<GradleVersionInfo[]> {
    return JSON.parse(await httpGetString(url))
}

async function httpGetString(url: string): Promise<string> {
    const response = await httpc.get(url)
    return response.readBody()
}

async function httpDownload(url: string, localPath: string): Promise<void> {
    const response = await httpc.get(url)
    return new Promise<void>(function (resolve, reject) {
        const writeStream = fs.createWriteStream(localPath)
        response.message
            .pipe(writeStream)
            .on('close', () => {
                resolve()
            })
            .on('error', err => {
                reject(err)
            })
    })
}

async function extractZip(zip: string, destination: string): Promise<void> {
    return new Promise<void>(function (resolve, reject) {
        fs.createReadStream(zip)
            .pipe(unzip.Extract({path: destination}))
            .on('close', () => {
                resolve()
            })
            .on('error', err => {
                reject(err)
            })
    })
}

interface GradleVersionInfo {
    version: string
    downloadUrl: string
}
