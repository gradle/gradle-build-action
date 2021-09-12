import path from 'path'
import fs from 'fs'
import os from 'os'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as cache from '@actions/cache'
import * as exec from '@actions/exec'

import {AbstractCache} from './cache-utils'

// Paths to artifacts that are common to all/many Gradle User Home caches
// These artifacts are cached separately to avoid blowing out the size of each GUH cache
const COMMON_ARTIFACT_PATHS = [
    '~/.gradle/wrapper/dists/*/*/*.zip',
    '~/.gradle/caches/*/generated-gradle-jars/*.jar',
    '~/.gradle/caches/modules-*/files-*/**/*.jar'
]

// When a common artifact is cached separately, it is replaced by a marker file to allow for restore.
const MARKER_FILE_EXTENSION = '.cached'

// Which paths under Gradle User Home should be cached
// TODO: This should adapt for the `GRADLE_USER_HOME` environment variable
const CACHE_PATH = [
    '~/.gradle/caches', // All directories in 'caches'
    '~/.gradle/notifications', // Prevent the re-rendering of first-use message for version
    `~/.gradle/wrapper/dists/*/*/*.zip${MARKER_FILE_EXTENSION}` // Only wrapper zips are required : We do not want to cache the exploded distributions
]

export class GradleUserHomeCache extends AbstractCache {
    constructor() {
        super('gradle', 'Gradle User Home')
    }

    async restore(): Promise<void> {
        await super.restore()
        await this.reportCacheEntrySize('excluding common artifacts')
        await this.restoreCommonArtifacts()
        await this.reportCacheEntrySize('including common artifacts')
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
            processes.push(p)
        }
        await Promise.all(processes)
    }

    private async restoreCommonArtifact(markerFile: string): Promise<void> {
        const artifactFile = markerFile.substring(
            0,
            markerFile.length - MARKER_FILE_EXTENSION.length
        )
        core.debug(
            `Found marker file: ${markerFile}. Will attempt to restore ${artifactFile}`
        )

        if (!fs.existsSync(artifactFile)) {
            const key = path.relative(this.getGradleUserHome(), artifactFile)
            const cacheKey = `gradle-artifact-${key}`

            const restoreKey = await cache.restoreCache(
                [artifactFile],
                cacheKey
            )
            if (restoreKey) {
                core.info(`Restored ${cacheKey} from cache to ${artifactFile}`)
            } else {
                core.warning(
                    `Failed to restore from ${cacheKey} to ${artifactFile}`
                )
            }
        } else {
            core.debug(
                `Artifact file already exists, not restoring: ${artifactFile}`
            )
        }
    }

    private async reportCacheEntrySize(label: string): Promise<void> {
        const gradleUserHome = path.resolve(os.homedir(), '.gradle')
        if (!fs.existsSync(gradleUserHome)) {
            return
        }
        core.info(`Gradle User Home cache entry: ${label}`)
        await exec.exec('du', ['-h', '-c', '-t', '5M'], {
            cwd: gradleUserHome,
            ignoreReturnCode: true
        })
    }

    async save(): Promise<void> {
        await this.saveCommonArtifacts()
        await super.save()
    }

    private async saveCommonArtifacts(): Promise<void> {
        const artifactFilePatterns = COMMON_ARTIFACT_PATHS.join('\n')
        const globber = await glob.create(artifactFilePatterns)
        const commonArtifactFiles = await globber.glob()

        const processes: Promise<void>[] = []
        for (const artifactFile of commonArtifactFiles) {
            const p = this.saveCommonArtifact(artifactFile)
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
            core.info(`Caching ${artifactFile} with cache key: ${cacheKey}`)
            try {
                await cache.saveCache([artifactFile], cacheKey)
            } catch (error) {
                // Fail on validation errors or non-errors (the latter to keep Typescript happy)
                if (
                    error instanceof cache.ValidationError ||
                    !(error instanceof Error)
                ) {
                    throw error
                } else if (error instanceof cache.ReserveCacheError) {
                    // These are expected if the artifact is already cached
                    this.debug(error.message)
                } else {
                    core.warning(error.message)
                }
            }

            // Write the marker file that will stand in place of the original
            fs.writeFileSync(markerFile, 'cached')
        } else {
            core.debug(
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
