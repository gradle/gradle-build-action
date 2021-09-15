import path from 'path'
import fs from 'fs'
import os from 'os'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'

import {AbstractCache, hashStrings} from './cache-utils'

// Which paths under Gradle User Home should be cached
// TODO: This should adapt for the `GRADLE_USER_HOME` environment variable
// TODO: Allow the user to override / tweak this set
const CACHE_PATH = ['~/.gradle/caches', '~/.gradle/notifications']

const COMMON_ARTIFACT_CACHES = new Map([
    ['generated-gradle-jars', '~/.gradle/caches/*/generated-gradle-jars/*.jar'],
    ['wrapper-zips', '~/.gradle/wrapper/dists/*/*/*.zip'],
    ['dependency-jars', '~/.gradle/caches/modules-*/files-*/**/*.jar'],
    ['instrumented-jars', '~/.gradle/caches/jars-*/*/*.jar']
])

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
        const processes: Promise<void>[] = []
        for (const [bundle, pattern] of COMMON_ARTIFACT_CACHES) {
            const p = this.restoreCommonArtifactBundle(bundle, pattern)
            // Run sequentially when debugging enabled
            if (this.cacheDebuggingEnabled) {
                await p
            }
            processes.push(p)
        }

        await Promise.all(processes)
    }

    private async restoreCommonArtifactBundle(
        bundle: string,
        pattern: string
    ): Promise<void> {
        const cacheMetaFile = this.getCacheMetaFile(bundle)
        if (fs.existsSync(cacheMetaFile)) {
            const cacheKey = fs.readFileSync(cacheMetaFile, 'utf-8').trim()
            const restoreKey = await this.restoreCache([pattern], cacheKey)
            if (restoreKey) {
                this.debug(
                    `Restored ${bundle} with key ${cacheKey} to ${pattern}`
                )
            } else {
                this.debug(
                    `Failed to restore ${bundle} with key ${cacheKey} to ${pattern}`
                )
            }
        } else {
            this.debug(
                `No metafile found to restore ${bundle}: ${cacheMetaFile}`
            )
        }
    }

    private getCacheMetaFile(name: string): string {
        return path.resolve(
            this.getGradleUserHome(),
            'caches',
            `.gradle-build-action.${name}.cache`
        )
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
        const processes: Promise<void>[] = []
        for (const [bundle, pattern] of COMMON_ARTIFACT_CACHES) {
            const p = this.saveCommonArtifactBundle(bundle, pattern)
            // Run sequentially when debugging enabled
            if (this.cacheDebuggingEnabled) {
                await p
            }
            processes.push(p)
        }

        await Promise.all(processes)
    }

    private async saveCommonArtifactBundle(
        bundle: string,
        pattern: string
    ): Promise<void> {
        const cacheMetaFile = this.getCacheMetaFile(bundle)

        const globber = await glob.create(pattern)
        const commonArtifactFiles = await globber.glob()

        // Handle no matching files
        if (commonArtifactFiles.length === 0) {
            this.debug(`No files found to cache for ${bundle}`)
            if (fs.existsSync(cacheMetaFile)) {
                fs.unlinkSync(cacheMetaFile)
            }
            return
        }

        const previouslyRestoredKey = fs.existsSync(cacheMetaFile)
            ? fs.readFileSync(cacheMetaFile, 'utf-8').trim()
            : ''
        const cacheKey = this.createCacheKey(hashStrings(commonArtifactFiles))

        if (previouslyRestoredKey === cacheKey) {
            this.debug(
                `No change to previously restored ${bundle}. Not caching.`
            )
        } else {
            this.debug(`Caching ${bundle} with cache key: ${cacheKey}`)
            await this.saveCache([pattern], cacheKey)

            this.debug(`Writing cache metafile: ${cacheMetaFile}`)
            fs.writeFileSync(cacheMetaFile, cacheKey)
        }

        for (const file of commonArtifactFiles) {
            fs.unlinkSync(file)
        }
    }

    protected createCacheKey(key: string): string {
        const cacheKeyPrefix = process.env['CACHE_KEY_PREFIX'] || ''
        return `${cacheKeyPrefix}${key}`
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
