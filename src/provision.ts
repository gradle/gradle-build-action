import * as fs from 'fs'
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
    const json = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/current`
    )
    return provisionGradle(json.version, json.downloadUrl)
}

async function gradleReleaseCandidate(): Promise<string> {
    const json = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/release-candidate`
    )
    if (json) {
        return provisionGradle(json.version, json.downloadUrl)
    }
    return gradleCurrent()
}

async function gradleNightly(): Promise<string> {
    const json = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/nightly`
    )
    return provisionGradle(json.version, json.downloadUrl)
}

async function gradleReleaseNightly(): Promise<string> {
    const json = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/release-nightly`
    )
    return provisionGradle(json.version, json.downloadUrl)
}

async function gradle(version: string): Promise<string> {
    const declaration = await findGradleVersionDeclaration(version)
    if (!declaration) {
        throw new Error(`Gradle version ${version} does not exists`)
    }
    return provisionGradle(declaration.version, declaration.downloadUrl)
}

async function gradleVersionDeclaration(url: string): Promise<any | undefined> {
    const json: any = await httpGetJson(url)
    return json.version && json.version.length > 0 ? json : undefined
}

async function findGradleVersionDeclaration(
    version: string
): Promise<any | undefined> {
    const json: any = await httpGetJson(`${gradleVersionsBaseUrl}/all`)
    const found: any = json.find((entry: any) => {
        return entry.version === version
    })
    return found ? found : undefined
}

async function provisionGradle(version: string, url: string): Promise<string> {
    const cachedInstall: string = toolCache.find('gradle', version)
    if (cachedInstall.length > 0) {
        const cachedExecutable = executableFrom(cachedInstall)
        core.info(`Provisioned Gradle executable ${cachedExecutable}`)
        return cachedExecutable
    }

    const home = process.env['HOME'] || ''
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

async function httpGetJson(url: string): Promise<any> {
    const response = await httpc.get(url)
    const body = await response.readBody()
    return JSON.parse(body)
}

async function httpDownload(url: string, localPath: string): Promise<void> {
    return new Promise<void>(function (resolve, reject) {
        const writeStream = fs.createWriteStream(localPath)
        httpc
            .get(url)
            .then(response => {
                response.message
                    .pipe(writeStream)
                    .on('close', () => {
                        resolve()
                    })
                    .on('error', err => {
                        reject(err)
                    })
            })
            .catch(reason => {
                reject(reason)
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
