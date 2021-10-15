import path from 'path'
import fs from 'fs'
import os from 'os'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'

import {AbstractCache, hashFileNames, tryDelete} from './cache-utils'

// Which paths under Gradle User Home should be cached
const CACHE_PATH = ['caches', 'notifications']

const COMMON_ARTIFACT_CACHES = new Map([
    ['generated-gradle-jars', 'caches/*/generated-gradle-jars/*.jar'],
    ['wrapper-zips', 'wrapper/dists/*/*/*.zip'],
    ['dependency-jars', 'caches/modules-*/files-*/**/*.jar'],
    ['instrumented-jars', 'caches/jars-*/*/*.jar']
])

export class GradleUserHomeCache extends AbstractCache {
    private gradleUserHome: string

    constructor(rootDir: string) {
        super('gradle', 'Gradle User Home')
        this.gradleUserHome = this.determineGradleUserHome(rootDir)
    }

    async afterRestore(): Promise<void> {
        await this.reportGradleUserHomeSize('as restored from cache')
        await this.restoreCommonArtifacts()
        await this.reportGradleUserHomeSize('after restoring common artifacts')
    }

    private async restoreCommonArtifacts(): Promise<void> {
        const processes: Promise<void>[] = []
        for (const [bundle, pattern] of this.getCommonArtifactPaths()) {
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
        artifactPath: string
    ): Promise<void> {
        const cacheMetaFile = this.getCacheMetaFile(bundle)
        if (fs.existsSync(cacheMetaFile)) {
            const cacheKey = fs.readFileSync(cacheMetaFile, 'utf-8').trim()
            const restoreKey = await this.restoreCache([artifactPath], cacheKey)
            if (restoreKey) {
                core.info(
                    `Restored ${bundle} with key ${cacheKey} to ${artifactPath}`
                )
            } else {
                this.debug(
                    `Did not restore ${bundle} with key ${cacheKey} to ${artifactPath}`
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
            this.gradleUserHome,
            'caches',
            `.gradle-build-action.${name}.cache`
        )
    }

    async beforeSave(): Promise<void> {
        await this.reportGradleUserHomeSize('before saving common artifacts')
        await this.saveCommonArtifacts()
        await this.reportGradleUserHomeSize('after saving common artifacts')
    }

    private async saveCommonArtifacts(): Promise<void> {
        const processes: Promise<void>[] = []
        for (const [bundle, pattern] of this.getCommonArtifactPaths()) {
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
        artifactPath: string
    ): Promise<void> {
        const cacheMetaFile = this.getCacheMetaFile(bundle)

        const globber = await glob.create(artifactPath)
        const commonArtifactFiles = await globber.glob()

        // Handle no matching files
        if (commonArtifactFiles.length === 0) {
            this.debug(`No files found to cache for ${bundle}`)
            if (fs.existsSync(cacheMetaFile)) {
                tryDelete(cacheMetaFile)
            }
            return
        }

        const previouslyRestoredKey = fs.existsSync(cacheMetaFile)
            ? fs.readFileSync(cacheMetaFile, 'utf-8').trim()
            : ''
        const cacheKey = this.createCacheKey(bundle, commonArtifactFiles)

        if (previouslyRestoredKey === cacheKey) {
            this.debug(
                `No change to previously restored ${bundle}. Not caching.`
            )
        } else {
            core.info(`Caching ${bundle} with cache key: ${cacheKey}`)
            await this.saveCache([artifactPath], cacheKey)

            this.debug(`Writing cache metafile: ${cacheMetaFile}`)
            fs.writeFileSync(cacheMetaFile, cacheKey)
        }

        for (const file of commonArtifactFiles) {
            tryDelete(file)
        }
    }

    protected createCacheKey(bundle: string, files: string[]): string {
        const cacheKeyPrefix = process.env['CACHE_KEY_PREFIX'] || ''
        const relativeFiles = files.map(x =>
            path.relative(this.gradleUserHome, x)
        )
        const key = hashFileNames(relativeFiles)

        this.debug(
            `Generating cache key for ${bundle} from files: ${relativeFiles}`
        )

        return `${cacheKeyPrefix}${bundle}-${key}`
    }

    protected determineGradleUserHome(rootDir: string): string {
        const customGradleUserHome = process.env['GRADLE_USER_HOME']
        if (customGradleUserHome) {
            return path.resolve(rootDir, customGradleUserHome)
        }

        return path.resolve(os.homedir(), '.gradle')
    }

    protected cacheOutputExists(): boolean {
        // Need to check for 'caches' directory to avoid incorrect detection on MacOS agents
        const dir = path.resolve(this.gradleUserHome, 'caches')
        return fs.existsSync(dir)
    }

    protected getCachePath(): string[] {
        return CACHE_PATH.map(x => path.resolve(this.gradleUserHome, x))
    }

    private getCommonArtifactPaths(): Map<string, string> {
        return new Map(
            Array.from(COMMON_ARTIFACT_CACHES, ([key, value]) => [
                key,
                path.resolve(this.gradleUserHome, value)
            ])
        )
    }

    private async reportGradleUserHomeSize(label: string): Promise<void> {
        if (!this.cacheDebuggingEnabled) {
            return
        }
        if (!fs.existsSync(this.gradleUserHome)) {
            return
        }
        const result = await exec.getExecOutput(
            'du',
            ['-h', '-c', '-t', '5M'],
            {
                cwd: this.gradleUserHome,
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
}
