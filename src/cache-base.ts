import * as core from '@actions/core'
import * as exec from '@actions/exec'
import path from 'path'
import fs from 'fs'
import {CacheListener} from './cache-reporting'
import {saveCache, restoreCache, cacheDebug, isCacheDebuggingEnabled, tryDelete, generateCacheKey} from './cache-utils'
import {GradleHomeEntryExtractor} from './cache-extract-entries'

const RESTORED_CACHE_KEY_KEY = 'restored-cache-key'

export const META_FILE_DIR = '.gradle-build-action'
const INCLUDE_PATHS_PARAMETER = 'gradle-home-cache-includes'
const EXCLUDE_PATHS_PARAMETER = 'gradle-home-cache-excludes'

export class GradleStateCache {
    private cacheName: string
    private cacheDescription: string

    protected readonly gradleUserHome: string

    constructor(gradleUserHome: string) {
        this.gradleUserHome = gradleUserHome
        this.cacheName = 'gradle'
        this.cacheDescription = 'Gradle User Home'
    }

    init(): void {
        const actionCacheDir = path.resolve(this.gradleUserHome, '.gradle-build-action')
        fs.mkdirSync(actionCacheDir, {recursive: true})

        const initScriptsDir = path.resolve(this.gradleUserHome, 'init.d')
        fs.mkdirSync(initScriptsDir, {recursive: true})

        this.initializeGradleUserHome(this.gradleUserHome, initScriptsDir)
    }

    cacheOutputExists(): boolean {
        const cachesDir = path.resolve(this.gradleUserHome, 'caches')
        if (fs.existsSync(cachesDir)) {
            cacheDebug(`Cache output exists at ${cachesDir}`)
            return true
        }
        return false
    }

    /**
     * Restores the cache entry, finding the closest match to the currently running job.
     */
    async restore(listener: CacheListener): Promise<void> {
        const entryListener = listener.entry(this.cacheDescription)

        const cacheKey = generateCacheKey(this.cacheName)

        cacheDebug(
            `Requesting ${this.cacheDescription} with
    key:${cacheKey.key}
    restoreKeys:[${cacheKey.restoreKeys}]`
        )

        const cacheResult = await restoreCache(this.getCachePath(), cacheKey.key, cacheKey.restoreKeys, entryListener)
        if (!cacheResult) {
            core.info(`${this.cacheDescription} cache not found. Will initialize empty.`)
            return
        }

        core.saveState(RESTORED_CACHE_KEY_KEY, cacheResult.key)

        core.info(`Restored ${this.cacheDescription} from cache key: ${cacheResult.key}`)

        try {
            await this.afterRestore(listener)
        } catch (error) {
            core.warning(`Restore ${this.cacheDescription} failed in 'afterRestore': ${error}`)
        }
    }

    /**
     * Restore any extracted cache entries after the main Gradle User Home entry is restored.
     */
    async afterRestore(listener: CacheListener): Promise<void> {
        await this.debugReportGradleUserHomeSize('as restored from cache')
        await new GradleHomeEntryExtractor(this.gradleUserHome).restore(listener)
        // await new ConfigurationCacheEntryExtractor(this.gradleUserHome).restore(listener)
        await this.debugReportGradleUserHomeSize('after restoring common artifacts')
    }

    /**
     * Saves the cache entry based on the current cache key unless the cache was restored with the exact key,
     * in which case we cannot overwrite it.
     *
     * If the cache entry was restored with a partial match on a restore key, then
     * it is saved with the exact key.
     */
    async save(listener: CacheListener): Promise<void> {
        const cacheKey = generateCacheKey(this.cacheName).key
        const restoredCacheKey = core.getState(RESTORED_CACHE_KEY_KEY)
        const gradleHomeEntryListener = listener.entry(this.cacheDescription)

        if (restoredCacheKey && cacheKey === restoredCacheKey) {
            core.info(`Cache hit occurred on the cache key ${cacheKey}, not saving cache.`)

            for (const entryListener of listener.cacheEntries) {
                if (entryListener === gradleHomeEntryListener) {
                    entryListener.markNotSaved('cache key not changed')
                } else {
                    entryListener.markNotSaved(`referencing '${this.cacheDescription}' cache entry not saved`)
                }
            }
            return
        }

        try {
            await this.beforeSave(listener)
        } catch (error) {
            core.warning(`Save ${this.cacheDescription} failed in 'beforeSave': ${error}`)
            return
        }

        core.info(`Caching ${this.cacheDescription} with cache key: ${cacheKey}`)
        const cachePath = this.getCachePath()
        await saveCache(cachePath, cacheKey, gradleHomeEntryListener)

        return
    }

    /**
     * Extract and save any defined extracted cache entries prior to the main Gradle User Home entry being saved.
     */
    async beforeSave(listener: CacheListener): Promise<void> {
        await this.debugReportGradleUserHomeSize('before saving common artifacts')
        this.deleteExcludedPaths()
        await Promise.all([
            new GradleHomeEntryExtractor(this.gradleUserHome).extract(listener)
            // new ConfigurationCacheEntryExtractor(this.gradleUserHome).extract(listener)
        ])
        await this.debugReportGradleUserHomeSize(
            "after extracting common artifacts (only 'caches' and 'notifications' will be stored)"
        )
    }

    /**
     * Delete any file paths that are excluded by the `gradle-home-cache-excludes` parameter.
     */
    private deleteExcludedPaths(): void {
        const rawPaths: string[] = core.getMultilineInput(EXCLUDE_PATHS_PARAMETER)
        const resolvedPaths = rawPaths.map(x => path.resolve(this.gradleUserHome, x))

        for (const p of resolvedPaths) {
            cacheDebug(`Deleting excluded path: ${p}`)
            tryDelete(p)
        }
    }

    /**
     * Determines the paths within Gradle User Home to cache.
     * By default, this is the 'caches' and 'notifications' directories,
     * but this can be overridden by the `gradle-home-cache-includes` parameter.
     */
    protected getCachePath(): string[] {
        const rawPaths: string[] = core.getMultilineInput(INCLUDE_PATHS_PARAMETER)
        rawPaths.push(META_FILE_DIR)
        const resolvedPaths = rawPaths.map(x => this.resolveCachePath(x))
        cacheDebug(`Using cache paths: ${resolvedPaths}`)
        return resolvedPaths
    }

    private resolveCachePath(rawPath: string): string {
        if (rawPath.startsWith('!')) {
            const resolved = this.resolveCachePath(rawPath.substring(1))
            return `!${resolved}`
        }
        return path.resolve(this.gradleUserHome, rawPath)
    }

    private initializeGradleUserHome(gradleUserHome: string, initScriptsDir: string): void {
        const initScriptFilenames = ['build-result-capture.init.gradle', 'build-result-capture-service.plugin.groovy']
        for (const initScriptFilename of initScriptFilenames) {
            const initScriptContent = this.readInitScriptAsString(initScriptFilename)
            const initScriptPath = path.resolve(initScriptsDir, initScriptFilename)
            fs.writeFileSync(initScriptPath, initScriptContent)
        }
    }

    private readInitScriptAsString(resource: string): string {
        // Resolving relative to __dirname will allow node to find the resource at runtime
        const absolutePath = path.resolve(__dirname, '..', '..', 'src', 'resources', 'init-scripts', resource)
        return fs.readFileSync(absolutePath, 'utf8')
    }

    /**
     * When cache debugging is enabled, this method will give a detailed report
     * of the Gradle User Home contents.
     */
    private async debugReportGradleUserHomeSize(label: string): Promise<void> {
        if (!isCacheDebuggingEnabled()) {
            return
        }
        if (!fs.existsSync(this.gradleUserHome)) {
            return
        }
        const result = await exec.getExecOutput('du', ['-h', '-c', '-t', '5M'], {
            cwd: this.gradleUserHome,
            silent: true,
            ignoreReturnCode: true
        })

        core.info(`Gradle User Home (directories >5M): ${label}`)

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
