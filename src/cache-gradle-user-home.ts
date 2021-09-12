import path from 'path'
import fs from 'fs'
import os from 'os'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as cache from '@actions/cache'
import * as exec from '@actions/exec'

import {AbstractCache} from './cache-utils'

const CACHE_PATH = [
    '~/.gradle/caches/*', // All directories in 'caches'
    '~/.gradle/notifications/*', // Prevent the re-rendering of first-use message for version
    '~/.gradle/wrapper/dists/*/*/*.zip.txt' // Only wrapper zips are required : We do not want to cache the exploded distributions
]

const DEDUPLCIATED_PATHS = [
    '~/.gradle/wrapper/dists/*/*/*.zip',
    '~/.gradle/caches/*/generated-gradle-jars/*.jar',
    '~/.gradle/caches/modules-*/files-*/**/*.jar'
]
const MARKER_FILE_EXTENSION = '.txt'

export class GradleUserHomeCache extends AbstractCache {
    constructor() {
        super('gradle', 'Gradle User Home')
    }

    async restore(): Promise<void> {
        await super.restore()
        await this.reportCacheEntrySize()
        await this.restoreDeduplicatedPaths()
        await this.reportCacheEntrySize()
    }

    private async restoreDeduplicatedPaths(): Promise<void> {
        const markerFilePatterns = DEDUPLCIATED_PATHS.map(targetPath => {
            return targetPath + MARKER_FILE_EXTENSION
        }).join('\n')

        core.info(`Using marker file patterns: ${markerFilePatterns}`)
        const globber = await glob.create(markerFilePatterns)
        const markerFiles = await globber.glob()

        const processes: Promise<void>[] = []
        for (const markerFile of markerFiles) {
            const p = this.restoreDeduplicatePath(markerFile)
            processes.push(p)
        }
        await Promise.all(processes)
    }

    private async restoreDeduplicatePath(markerFile: string): Promise<void> {
        const targetFile = markerFile.substring(
            0,
            markerFile.length - MARKER_FILE_EXTENSION.length
        )
        core.info(`Found marker file: ${markerFile}. Looking for ${targetFile}`)

        if (!fs.existsSync(targetFile)) {
            const key = path.relative(this.getGradleUserHome(), targetFile)
            const cacheKey = `gradle-dedup-${key}`
            core.info(`Cache key: ${cacheKey}. Cache path: ${targetFile}`)

            const restoreKey = await cache.restoreCache([targetFile], cacheKey)
            if (restoreKey) {
                core.info(`Restored ${cacheKey} from cache to ${targetFile}`)
            } else {
                core.info(`Did NOT restore from ${cacheKey} to ${targetFile}`)
            }
        } else {
            core.info(`Target file already exists: ${targetFile}`)
        }
    }

    private async reportCacheEntrySize(): Promise<void> {
        const gradleUserHome = path.resolve(os.homedir(), '.gradle')
        if (!fs.existsSync(gradleUserHome)) {
            return
        }
        core.info('Gradle User Home cache entry size summary')
        await exec.exec('du', ['-h', '-c', '-t', '5M'], {
            cwd: gradleUserHome,
            ignoreReturnCode: true
        })
        core.info('-----------')
    }

    async save(): Promise<void> {
        await this.cacheDeduplicatedPaths()
        await super.save()
    }

    private async cacheDeduplicatedPaths(): Promise<void> {
        const targetFilePatterns = DEDUPLCIATED_PATHS.join('\n')
        core.info(`Using target file patterns: ${targetFilePatterns}`)
        const globber = await glob.create(targetFilePatterns)
        const targetFiles = await globber.glob()

        const processes: Promise<void>[] = []
        for (const targetFile of targetFiles) {
            const p = this.cacheDeplucatePath(targetFile)
            processes.push(p)
        }
        await Promise.all(processes)
    }

    private async cacheDeplucatePath(targetFile: string): Promise<void> {
        core.info(`Deduplicate caching: ${targetFile}`)

        const markerFile = `${targetFile}${MARKER_FILE_EXTENSION}`

        if (!fs.existsSync(markerFile)) {
            const key = path.relative(this.getGradleUserHome(), targetFile)
            const cacheKey = `gradle-dedup-${key}`
            core.info(`Cache key: ${cacheKey}. Cache path: ${targetFile}`)

            try {
                await cache.saveCache([targetFile], cacheKey)
            } catch (error) {
                // Fail on validation errors or non-errors (the latter to keep Typescript happy)
                if (
                    error instanceof cache.ValidationError ||
                    !(error instanceof Error)
                ) {
                    throw error
                }
                // TODO : Avoid warning for reserve cache error: this is expected
                core.warning(error.message)
            }

            // Write the marker file and delete the original
            fs.writeFileSync(markerFile, 'dummy')
        } else {
            core.info(`Marker file already exists: ${markerFile}`)
        }

        // TODO : Should not need to delete. Just exclude from cache path.
        // Delete the target file
        fs.unlinkSync(targetFile)
    }

    protected cacheOutputExists(): boolean {
        // Need to check for 'caches' directory to avoid incorrect detection on MacOS agents
        const dir = path.resolve(this.getGradleUserHome(), 'caches')
        return fs.existsSync(dir)
    }

    protected getCachePath(): string[] {
        return CACHE_PATH
    }

    protected getGradleUserHome(): string {
        return path.resolve(os.homedir(), '.gradle')
    }
}
