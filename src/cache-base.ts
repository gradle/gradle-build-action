import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import path from 'path'
import fs from 'fs'
import {CacheListener} from './cache-reporting'
import {
    getCacheKeyPrefix,
    determineJobContext,
    saveCache,
    restoreCache,
    cacheDebug,
    isCacheDebuggingEnabled,
    tryDelete
} from './cache-utils'
import {ConfigurationCacheEntryExtractor, GradleHomeEntryExtractor} from './cache-extract-entries'

const CACHE_PROTOCOL_VERSION = 'v5-'

export const META_FILE_DIR = '.gradle-build-action'
export const PROJECT_ROOTS_FILE = 'project-roots.txt'
const INCLUDE_PATHS_PARAMETER = 'gradle-home-cache-includes'
const EXCLUDE_PATHS_PARAMETER = 'gradle-home-cache-excludes'

/**
 * Represents a key used to restore a cache entry.
 * The Github Actions cache will first try for an exact match on the key.
 * If that fails, it will try for a prefix match on any of the restoreKeys.
 */
class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
    }
}

/**
 * Generates a cache key specific to the current job execution.
 * The key is constructed from the following inputs:
 * - A user-defined prefix (optional)
 * - The cache protocol version
 * - The name of the cache
 * - The runner operating system
 * - The name of the Job being executed
 * - The matrix values for the Job being executed (job context)
 * - The SHA of the commit being executed
 *
 * Caches are restored by trying to match the these key prefixes in order:
 * - The full key with SHA
 * - A previous key for this Job + matrix
 * - Any previous key for this Job (any matrix)
 * - Any previous key for this cache on the current OS
 */
function generateCacheKey(cacheName: string): CacheKey {
    const cacheKeyBase = `${getCacheKeyPrefix()}${CACHE_PROTOCOL_VERSION}${cacheName}`

    // At the most general level, share caches for all executions on the same OS
    const runnerOs = process.env['RUNNER_OS'] || ''
    const cacheKeyForOs = `${cacheKeyBase}|${runnerOs}`

    // Prefer caches that run this job
    const cacheKeyForJob = `${cacheKeyForOs}|${github.context.job}`

    // Prefer (even more) jobs that run this job with the same context (matrix)
    const cacheKeyForJobContext = `${cacheKeyForJob}[${determineJobContext()}]`

    // Exact match on Git SHA
    const cacheKey = `${cacheKeyForJobContext}-${github.context.sha}`

    return new CacheKey(cacheKey, [cacheKeyForJobContext, cacheKeyForJob, cacheKeyForOs])
}

export class GradleStateCache {
    private cacheName: string
    private cacheDescription: string
    private cacheKeyStateKey: string
    private cacheResultStateKey: string

    protected readonly gradleUserHome: string

    constructor(gradleUserHome: string) {
        this.gradleUserHome = gradleUserHome
        this.cacheName = 'gradle'
        this.cacheDescription = 'Gradle User Home'
        this.cacheKeyStateKey = `CACHE_KEY_gradle`
        this.cacheResultStateKey = `CACHE_RESULT_gradle`
    }

    init(): void {
        const actionCacheDir = path.resolve(this.gradleUserHome, '.gradle-build-action')
        fs.mkdirSync(actionCacheDir, {recursive: true})

        const initScriptsDir = path.resolve(this.gradleUserHome, 'init.d')
        fs.mkdirSync(initScriptsDir, {recursive: true})

        this.initializeGradleUserHome(this.gradleUserHome, initScriptsDir)
    }

    /**
     * Restores the cache entry, finding the closest match to the currently running job.
     */
    async restore(listener: CacheListener): Promise<void> {
        const entryListener = listener.entry(this.cacheDescription)

        const cacheKey = generateCacheKey(this.cacheName)
        core.saveState(this.cacheKeyStateKey, cacheKey.key)

        cacheDebug(
            `Requesting ${this.cacheDescription} with
    key:${cacheKey.key}
    restoreKeys:[${cacheKey.restoreKeys}]`
        )

        const cacheResult = await restoreCache(this.getCachePath(), cacheKey.key, cacheKey.restoreKeys)
        entryListener.markRequested(cacheKey.key, cacheKey.restoreKeys)

        if (!cacheResult) {
            core.info(`${this.cacheDescription} cache not found. Will initialize empty.`)
            return
        }

        core.saveState(this.cacheResultStateKey, cacheResult.key)
        entryListener.markRestored(cacheResult.key, cacheResult.size)

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
        await new ConfigurationCacheEntryExtractor(this.gradleUserHome).restore(listener)
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
        // Retrieve the state set in the previous 'restore' step.
        const cacheKeyFromRestore = core.getState(this.cacheKeyStateKey)
        const cacheResultFromRestore = core.getState(this.cacheResultStateKey)

        if (cacheResultFromRestore && cacheKeyFromRestore === cacheResultFromRestore) {
            core.info(`Cache hit occurred on the cache key ${cacheKeyFromRestore}, not saving cache.`)
            return
        }

        try {
            await this.beforeSave(listener)
        } catch (error) {
            core.warning(`Save ${this.cacheDescription} failed in 'beforeSave': ${error}`)
            return
        }

        core.info(`Caching ${this.cacheDescription} with cache key: ${cacheKeyFromRestore}`)
        const cachePath = this.getCachePath()
        const savedEntry = await saveCache(cachePath, cacheKeyFromRestore)

        if (savedEntry) {
            listener.entry(this.cacheDescription).markSaved(savedEntry.key, savedEntry.size)
        }

        return
    }

    /**
     * Extract and save any defined extracted cache entries prior to the main Gradle User Home entry being saved.
     */
    async beforeSave(listener: CacheListener): Promise<void> {
        await this.debugReportGradleUserHomeSize('before saving common artifacts')
        this.deleteExcludedPaths()
        await Promise.all([
            new GradleHomeEntryExtractor(this.gradleUserHome).extract(listener),
            new ConfigurationCacheEntryExtractor(this.gradleUserHome).extract(listener)
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
        const propertiesFile = path.resolve(gradleUserHome, 'gradle.properties')
        fs.writeFileSync(propertiesFile, 'org.gradle.daemon=false')

        const buildScanCapture = path.resolve(initScriptsDir, 'build-scan-capture.init.gradle')
        fs.writeFileSync(
            buildScanCapture,
            `import org.gradle.util.GradleVersion

// Only run again root build. Do not run against included builds.
def isTopLevelBuild = gradle.getParent() == null
if (isTopLevelBuild) {
    def version = GradleVersion.current().baseVersion
    def atLeastGradle4 = version >= GradleVersion.version("4.0")
    def atLeastGradle6 = version >= GradleVersion.version("6.0")

    if (atLeastGradle6) {
        settingsEvaluated { settings ->
            if (settings.pluginManager.hasPlugin("com.gradle.enterprise")) {
                registerCallbacks(settings.extensions["gradleEnterprise"].buildScan, settings.rootProject.name)
            }
        }
    } else if (atLeastGradle4) {
        projectsEvaluated { gradle ->
            if (gradle.rootProject.pluginManager.hasPlugin("com.gradle.build-scan")) {
                registerCallbacks(gradle.rootProject.extensions["buildScan"], gradle.rootProject.name)
            }
        }
    }
}

def registerCallbacks(buildScanExtension, rootProjectName) {
    buildScanExtension.with {
        def buildOutcome = ""
        def scanFile = new File("gradle-build-scan.txt")

        buildFinished { result ->
            buildOutcome = result.failure == null ? " succeeded" : " failed"
        }

        buildScanPublished { buildScan ->
            scanFile.text = buildScan.buildScanUri

            // Send commands directly to GitHub Actions via STDOUT.
            def message = "Build '\${rootProjectName}'\${buildOutcome} - \${buildScan.buildScanUri}"
            println("::notice ::\${message}")
            println("::set-output name=build-scan-url::\${buildScan.buildScanUri}")
        }
    }
}`
        )

        const projectRootCapture = path.resolve(initScriptsDir, 'project-root-capture.init.gradle')
        fs.writeFileSync(
            projectRootCapture,
            `
// Only run again root build. Do not run against included builds.
def isTopLevelBuild = gradle.getParent() == null
if (isTopLevelBuild) {
    settingsEvaluated { settings ->
        def projectRootEntry = settings.rootDir.absolutePath + "\\n"
        def projectRootList = new File(settings.gradle.gradleUserHomeDir, "${PROJECT_ROOTS_FILE}")
        if (!projectRootList.exists() || !projectRootList.text.contains(projectRootEntry)) {
            projectRootList << projectRootEntry
        }
    }
}`
        )
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
