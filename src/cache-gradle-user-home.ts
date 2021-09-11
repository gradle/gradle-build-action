import path from 'path'
import fs from 'fs'
import os from 'os'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as cache from '@actions/cache'

import {AbstractCache} from './cache-utils'

const CACHE_PATH = [
    '~/.gradle/caches/*', // All directories in 'caches'
    '~/.gradle/notifications/*', // Prevent the re-rendering of first-use message for version
    '~/.gradle/wrapper/dists/*/*/*.zip.txt' // Only wrapper zips are required : Gradle will expand these on demand
]

export class GradleUserHomeCache extends AbstractCache {
    constructor() {
        super('gradle', 'Gradle User Home')
    }

    async restore(): Promise<void> {
        await super.restore()

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

    async save(): Promise<void> {
        const globber = await glob.create('~/.gradle/wrapper/dists/*/*/*.zip')
        const wrapperZips = await globber.glob()

        core.info('Found the following wrapper zips')
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
                    core.warning(error.message)
                }

                // Write the marker file and delete the original
                fs.writeFileSync(wrapperMarkerFile, 'dummy')
            } else {
                core.info(
                    `Wrapper marker file already exists: ${wrapperMarkerFile}`
                )
            }
        }

        await super.save()
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
