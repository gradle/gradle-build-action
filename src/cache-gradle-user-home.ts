import path from 'path'
import fs from 'fs'
import os from 'os'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'

import {AbstractCache} from './cache-utils'

// When a common artifact is cached separately, it is replaced by a marker file to allow for restore.
const MARKER_FILE_EXTENSION = '.cached'

// Which paths under Gradle User Home should be cached
// TODO: This should adapt for the `GRADLE_USER_HOME` environment variable
// TODO: Allow the user to override / tweak this set
const CACHE_PATH = [
    '~/.gradle/caches',
    '~/.gradle/notifications', // Prevent the re-rendering of first-use message for version
    `~/.gradle/wrapper/dists/*/*/*.zip${MARKER_FILE_EXTENSION}` // Only cache/restore wrapper zips: Gradle will automatically expand these on startup if required
]

// Paths to artifacts that are common to all/many Gradle User Home caches
// These artifacts are cached separately to avoid blowing out the size of each GUH cache
// TODO: Allow the user to override / tweak this set
const COMMON_ARTIFACT_PATHS = [
    '~/.gradle/caches/*/generated-gradle-jars/*.jar',
    '~/.gradle/wrapper/dists/*/*/*.zip'
]

export class GradleUserHomeCache extends AbstractCache {
    constructor() {
        super('gradle', 'Gradle User Home')
    }

    async afterRestore(): Promise<void> {
        await this.reportCacheEntrySize('as restored from cache')
        await this.restoreCommonArtifacts()
        await this.reportCacheEntrySize('after restoring common artifacts')
    }

    private async restoreCommonArtifacts(): Promise<void> {
        const markerFilePatterns = COMMON_ARTIFACT_PATHS.map(targetPath => {
            return targetPath + MARKER_FILE_EXTENSION
        }).join('\n')

        const globber = await glob.create(markerFilePatterns)
        const markerFiles = await globber.glob()

        const processes: Promise<void>[] = []
        for (const markerFile of markerFiles) {
            const p = this.restoreCommonArtifact(markerFile)
            // Run sequentially when debugging enabled
            if (this.cacheDebuggingEnabled) {
                await p
            }
            processes.push(p)
        }

        await Promise.all(processes)
    }

    private async restoreCommonArtifact(markerFile: string): Promise<void> {
        const artifactFile = markerFile.substring(
            0,
            markerFile.length - MARKER_FILE_EXTENSION.length
        )

        if (!fs.existsSync(artifactFile)) {
            const key = path.relative(this.getGradleUserHome(), artifactFile)
            const cacheKey = `gradle-artifact-${key}`

            const restoreKey = await this.restoreCache([artifactFile], cacheKey)
            if (restoreKey) {
                this.debug(`Restored ${cacheKey} from cache to ${artifactFile}`)
            } else {
                this.debug(
                    `Failed to restore from ${cacheKey} to ${artifactFile}`
                )
            }
        } else {
            this.debug(
                `Artifact file already exists, not restoring: ${artifactFile}`
            )
        }
    }

    private async reportCacheEntrySize(label: string): Promise<void> {
        if (!this.cacheDebuggingEnabled) {
            return
        }
        const gradleUserHome = path.resolve(os.homedir(), '.gradle')
        if (!fs.existsSync(gradleUserHome)) {
            return
        }
        const result = await exec.getExecOutput(
            'du',
            ['-h', '-c', '-t', '5M'],
            {
                cwd: gradleUserHome,
                silent: true,
                ignoreReturnCode: true
            }
        )

        core.info(`Gradle User Home cache entry (directories >5M): ${label}`)

        core.info(
            result.stdout
                .trimEnd()
                .replace(/\t/g, '    ')
                .split('\n')
                .map(it => {
                    return `  ${it}`
                })
                .join('\n')
        )

        core.info('-----------------------')
    }

    async beforeSave(): Promise<void> {
        await this.saveCommonArtifacts()
    }

    private async saveCommonArtifacts(): Promise<void> {
        const artifactFilePatterns = COMMON_ARTIFACT_PATHS.join('\n')
        const globber = await glob.create(artifactFilePatterns)
        const commonArtifactFiles = await globber.glob()

        const processes: Promise<void>[] = []
        for (const artifactFile of commonArtifactFiles) {
            const p = this.saveCommonArtifact(artifactFile)
            // Run sequentially when debugging enabled
            if (this.cacheDebuggingEnabled) {
                await p
            }
            processes.push(p)
        }

        await Promise.all(processes)
    }

    private async saveCommonArtifact(artifactFile: string): Promise<void> {
        const markerFile = `${artifactFile}${MARKER_FILE_EXTENSION}`

        if (!fs.existsSync(markerFile)) {
            const filePath = path.relative(
                this.getGradleUserHome(),
                artifactFile
            )
            const cacheKey = `gradle-artifact-${filePath}`

            this.debug(`Caching ${artifactFile} with cache key: ${cacheKey}`)
            await this.saveCache([artifactFile], cacheKey)

            // Write the marker file that will stand in place of the original
            fs.writeFileSync(markerFile, 'cached')
        } else {
            this.debug(
                `Marker file already exists: ${markerFile}. Not caching ${artifactFile}`
            )
        }

        // TODO : Should not need to delete. Just exclude from cache path.
        // Delete the original artifact file
        fs.unlinkSync(artifactFile)
    }

    protected getGradleUserHome(): string {
        return path.resolve(os.homedir(), '.gradle')
    }

    protected cacheOutputExists(): boolean {
        // Need to check for 'caches' directory to avoid incorrect detection on MacOS agents
        const dir = path.resolve(this.getGradleUserHome(), 'caches')
        return fs.existsSync(dir)
    }

    protected getCachePath(): string[] {
        return CACHE_PATH
    }
}
