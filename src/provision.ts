import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as httpm from '@actions/http-client'
import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as toolCache from '@actions/tool-cache'

import * as gradlew from './gradlew'

const gradleVersionsBaseUrl = 'https://services.gradle.org/versions'

/**
 * @return Gradle executable path
 */
export async function gradleVersion(version: string): Promise<string> {
    switch (version) {
        case 'current':
            return gradleCurrent()
        case 'rc':
            core.warning(
                `Specifying gradle-version 'rc' has been deprecated. Use 'release-candidate' instead.`
            )
            return gradleReleaseCandidate()
        case 'release-candidate':
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
    return provisionGradle(versionInfo)
}

async function gradleReleaseCandidate(): Promise<string> {
    const versionInfo = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/release-candidate`
    )
    if (versionInfo && versionInfo.version && versionInfo.downloadUrl) {
        return provisionGradle(versionInfo)
    }
    core.info('No current release-candidate found, will fallback to current')
    return gradleCurrent()
}

async function gradleNightly(): Promise<string> {
    const versionInfo = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/nightly`
    )
    return provisionGradle(versionInfo)
}

async function gradleReleaseNightly(): Promise<string> {
    const versionInfo = await gradleVersionDeclaration(
        `${gradleVersionsBaseUrl}/release-nightly`
    )
    return provisionGradle(versionInfo)
}

async function gradle(version: string): Promise<string> {
    const versionInfo = await findGradleVersionDeclaration(version)
    if (!versionInfo) {
        throw new Error(`Gradle version ${version} does not exists`)
    }
    return provisionGradle(versionInfo)
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

async function provisionGradle(
    versionInfo: GradleVersionInfo
): Promise<string> {
    const installsDir = path.join(os.homedir(), 'gradle-installations/installs')
    const installDir = path.join(installsDir, `gradle-${versionInfo.version}`)
    if (fs.existsSync(installDir)) {
        core.info(`Gradle installation already exists at ${installDir}`)
        return executableFrom(installDir)
    }

    const downloadPath = await downloadAndCacheGradleDistribution(versionInfo)
    await toolCache.extractZip(downloadPath, installsDir)
    core.info(`Extracted Gradle ${versionInfo.version} to ${installDir}`)

    const executable = executableFrom(installDir)
    fs.chmodSync(executable, '755')
    core.info(`Provisioned Gradle executable ${executable}`)

    return executable
}

async function downloadAndCacheGradleDistribution(
    versionInfo: GradleVersionInfo
): Promise<string> {
    const downloadPath = path.join(
        os.homedir(),
        `gradle-installations/downloads/gradle-${versionInfo.version}-bin.zip`
    )

    if (isDistributionsCacheDisabled()) {
        await downloadGradleDistribution(versionInfo, downloadPath)
        return downloadPath
    }

    const cacheKey = `gradle-${versionInfo.version}`
    const restoreKey = await cache.restoreCache([downloadPath], cacheKey)
    if (restoreKey) {
        core.info(
            `Restored Gradle distribution ${cacheKey} from cache to ${downloadPath}`
        )
    } else {
        core.info(
            `Gradle distribution ${versionInfo.version} not found in cache. Will download.`
        )
        await downloadGradleDistribution(versionInfo, downloadPath)

        try {
            await cache.saveCache([downloadPath], cacheKey)
        } catch (error) {
            if (error.name === cache.ValidationError.name) {
                throw error
            } else if (error.name === cache.ReserveCacheError.name) {
                core.info(error.message)
            } else {
                core.info(`[warning] ${error.message}`)
            }
        }
    }
    return downloadPath
}

async function downloadGradleDistribution(
    versionInfo: GradleVersionInfo,
    downloadPath: string
): Promise<void> {
    await toolCache.downloadTool(versionInfo.downloadUrl, downloadPath)
    core.info(
        `Downloaded ${versionInfo.downloadUrl} to ${downloadPath} (size ${
            fs.statSync(downloadPath).size
        })`
    )
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
    const httpClient = new httpm.HttpClient('eskatos/gradle-command-action')
    const response = await httpClient.get(url)
    return response.readBody()
}

function isDistributionsCacheDisabled(): boolean {
    return !core.getBooleanInput('distributions-cache-enabled')
}

interface GradleVersionInfo {
    version: string
    downloadUrl: string
}
