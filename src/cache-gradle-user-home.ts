import path from 'path'
import fs from 'fs'
import os from 'os'

import {AbstractCache} from './cache-utils'

const CACHE_PATH = [
    '~/.gradle/caches/*', // All directories in 'caches'
    '~/.gradle/notifications/*', // Prevent the re-rendering of first-use message for version
    '~/.gradle/wrapper/dists/*/*/*.zip' // Only wrapper zips are required : Gradle will expand these on demand
]

export class GradleUserHomeCache extends AbstractCache {
    constructor() {
        super('gradle', 'Gradle User Home')
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
