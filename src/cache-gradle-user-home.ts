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
    '!~/.gradle/caches/*/generated-gradle-jars', // Exclude generated-gradle-jars
    '~/.gradle/notifications/*', // Prevent the re-rendering of first-use message for version
    '~/.gradle/wrapper/dists/*/*/*.zip.txt' // Only wrapper zips are required : Gradle will expand these on demand
]

export class GradleUserHomeCache extends AbstractCache {
    constructor() {
        super('gradle', 'Gradle User Home')
    }

    async restore(): Promise<void> {
        await super.restore()
        await this.reportCacheEntrySize()
        await this.restoreWrapperZips()
        await this.restoreGeneratedJars()
    }

    private async restoreWrapperZips(): Promise<void> {
        const globber = await glob.create(
            '~/.gradle/wrapper/dists/*/*/*.zip.txt'
        )
        const wrapperMarkers = await globber.glob()

        core.info('Found the following wrapper zips')
        for (const wrapperMarker of wrapperMarkers) {
            const wrapperZip = wrapperMarker.substring(
                0,
                wrapperMarker.length - '.txt'.length
            )
            core.info(
                `Wrapper marker: ${wrapperMarker}. Looking for zip ${wrapperZip}`
            )

            if (!fs.existsSync(wrapperZip)) {
                // Extract the wrapper URL hash
                const wrapperKey = path.basename(path.dirname(wrapperMarker))
                core.info(`Wrapper key: ${wrapperKey}`)

                const cacheKey = `gradle-wrapper-${wrapperKey}`
                core.info(`Cache key: ${cacheKey}. Cache path: ${wrapperZip}`)

                const restoreKey = await cache.restoreCache(
                    [wrapperZip],
                    cacheKey
                )
                if (restoreKey) {
                    core.info(
                        `Restored wrapper zip ${cacheKey} from cache to ${wrapperZip}`
                    )
                } else {
                    core.info(
                        `Did NOT restore wrapper zip from ${cacheKey} to ${wrapperZip}`
                    )
                }
            } else {
                core.info(`Wrapper zip file already exists: ${wrapperZip}`)
            }
        }
    }

    private async restoreGeneratedJars(): Promise<void> {
        const globber = await glob.create(
            '~/.gradle/caches/*/generated-gradle-jars/*.jar.txt'
        )
        const generatedJarMarkers = await globber.glob()

        core.info('Found the following generated jars')
        for (const jarMarker of generatedJarMarkers) {
            const generatedJar = jarMarker.substring(
                0,
                jarMarker.length - '.txt'.length
            )
            core.info(
                `Jar marker: ${jarMarker}. Looking for jar ${generatedJar}`
            )

            if (!fs.existsSync(generatedJar)) {
                // Extract the wrapper URL hash
                const jarKey = path.basename(generatedJar)
                const cacheKey = `gradle-generated-jar-${jarKey}`
                core.info(`Cache key: ${cacheKey}. Cache path: ${generatedJar}`)

                const restoreKey = await cache.restoreCache(
                    [generatedJar],
                    cacheKey
                )
                if (restoreKey) {
                    core.info(
                        `Restored generated jar ${cacheKey} from cache to ${generatedJar}`
                    )
                } else {
                    core.info(
                        `Did NOT restore generated jar from ${cacheKey} to ${generatedJar}`
                    )
                }
            } else {
                core.info(`Generated jar file already exists: ${generatedJar}`)
            }
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
        await this.cacheWrapperZips()
        await this.cacheGeneratedJars()
        await super.save()
    }

    private async cacheWrapperZips(): Promise<void> {
        const globber = await glob.create('~/.gradle/wrapper/dists/*/*/*.zip')
        const wrapperZips = await globber.glob()

        for (const wrapperZip of wrapperZips) {
            core.info(`Wrapper zip: ${wrapperZip}`)

            const wrapperMarkerFile = `${wrapperZip}.txt`

            if (!fs.existsSync(wrapperMarkerFile)) {
                // Extract the wrapper URL hash
                const wrapperKey = path.basename(path.dirname(wrapperZip))
                core.info(`Wrapper key: ${wrapperKey}`)

                const cacheKey = `gradle-wrapper-${wrapperKey}`

                core.info(`Caching wrapper with cache key: ${cacheKey}`)
                try {
                    await cache.saveCache([wrapperZip], cacheKey)
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
                fs.writeFileSync(wrapperMarkerFile, 'dummy')
            } else {
                core.info(
                    `Wrapper marker file already exists: ${wrapperMarkerFile}`
                )
            }

            // TODO : Should not need to delete. Just exclude from cache path.
            // Delete the wrapper
            fs.unlinkSync(wrapperZip)
        }
    }

    private async cacheGeneratedJars(): Promise<void> {
        const globber = await glob.create(
            '~/.gradle/caches/*/generated-gradle-jars/*.jar'
        )
        const generatedJars = await globber.glob()

        for (const generatedJar of generatedJars) {
            core.info(`Generated jar: ${generatedJar}`)

            const generatedJarMarkerFile = `${generatedJar}.txt`

            if (!fs.existsSync(generatedJarMarkerFile)) {
                // Key by jar file name: this includes Gradle version
                const jarKey = path.basename(generatedJar)
                const cacheKey = `gradle-generated-jar-${jarKey}`

                core.info(`Caching generated jar with cache key: ${cacheKey}`)
                try {
                    await cache.saveCache([generatedJar], cacheKey)
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
                fs.writeFileSync(generatedJarMarkerFile, 'dummy')
            } else {
                core.info(
                    `Wrapper marker file already exists: ${generatedJarMarkerFile}`
                )
            }

            // TODO : Should not need to delete. Just exclude from cache path.
            // Delete the jar
            fs.unlinkSync(generatedJar)
        }
    }

    protected cacheOutputExists(): boolean {
        // Need to check for 'caches' directory to avoid incorrect detection on MacOS agents
        const dir = path.resolve(os.homedir(), '.gradle/caches')
        return fs.existsSync(dir)
    }

    protected getCachePath(): string[] {
        return CACHE_PATH
    }
}
