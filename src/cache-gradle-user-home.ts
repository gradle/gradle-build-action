import path from 'path'
import fs from 'fs'
import os from 'os'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'

import {AbstractCache, CacheEntryListener, CacheListener} from './cache-base'
import {getCacheKeyPrefix, hashFileNames, tryDelete} from './cache-utils'

const META_FILE_DIR = '.gradle-build-action'
const META_FILE = 'cache-metadata.json'

const INCLUDE_PATHS_PARAMETER = 'gradle-home-cache-includes'
const EXCLUDE_PATHS_PARAMETER = 'gradle-home-cache-excludes'
const EXTRACTED_CACHE_ENTRIES_PARAMETER = 'gradle-home-extracted-cache-entries'

/**
 * Represents the result of attempting to load or store an extracted cache entry.
 * An undefined cacheKey indicates that the operation did not succeed.
 * The collected results are then used to populate the `cache-metadata.json` file for later use.
 */
class ExtractedCacheEntry {
    artifactType: string
    pattern: string
    cacheKey: string | undefined

    constructor(artifactType: string, pattern: string, cacheKey: string | undefined) {
        this.artifactType = artifactType
        this.pattern = pattern
        this.cacheKey = cacheKey
    }
}

/**
 * Representation of all of the extracted cache entries for this Gradle User Home.
 * This object is persisted to JSON file in the Gradle User Home directory for storing,
 * and subsequently used to restore the Gradle User Home.
 */
class ExtractedCacheEntryMetadata {
    entries: ExtractedCacheEntry[] = []
}

/**
 * Caches and restores the entire Gradle User Home directory, extracting entries containing common artifacts
 * for more efficient storage.
 */
export class GradleUserHomeCache extends AbstractCache {
    private gradleUserHome: string

    constructor(rootDir: string) {
        super('gradle', 'Gradle User Home')
        this.gradleUserHome = this.determineGradleUserHome(rootDir)
    }

    init(): void {
        this.debug(`Initializing Gradle User Home with properties and init script: ${this.gradleUserHome}`)
        initializeGradleUserHome(this.gradleUserHome)
    }

    /**
     * Restore any extracted cache entries after the main Gradle User Home entry is restored.
     */
    async afterRestore(listener: CacheListener): Promise<void> {
        await this.debugReportGradleUserHomeSize('as restored from cache')
        await this.restoreExtractedCacheEntries(listener)
        await this.debugReportGradleUserHomeSize('after restoring common artifacts')
    }

    /**
     * Restores any artifacts that were cached separately, based on the information in the `cache-metadata.json` file.
     * Each extracted cache entry is restored in parallel, except when debugging is enabled.
     */
    private async restoreExtractedCacheEntries(listener: CacheListener): Promise<void> {
        const extractedCacheEntryDefinitions = this.getExtractedCacheEntryDefinitions()
        const previouslyExtractedCacheEntries = this.loadExtractedCacheEntries()

        const processes: Promise<ExtractedCacheEntry>[] = []

        for (const cacheEntry of previouslyExtractedCacheEntries) {
            const artifactType = cacheEntry.artifactType
            const entryListener = listener.entry(cacheEntry.pattern)

            // Handle case where the extracted-cache-entry definitions have been changed
            if (extractedCacheEntryDefinitions.get(artifactType) === undefined) {
                core.info(`Found extracted cache entry for ${artifactType} but no such entry defined`)
                entryListener.markRequested('EXTRACTED_ENTRY_NOT_DEFINED')
            } else {
                processes.push(
                    this.restoreExtractedCacheEntry(
                        artifactType,
                        cacheEntry.cacheKey!,
                        cacheEntry.pattern,
                        entryListener
                    )
                )
            }
        }

        this.saveMetadataForCacheResults(await this.collectCacheResults(processes))
    }

    private async restoreExtractedCacheEntry(
        artifactType: string,
        cacheKey: string,
        pattern: string,
        listener: CacheEntryListener
    ): Promise<ExtractedCacheEntry> {
        listener.markRequested(cacheKey)

        const restoredEntry = await this.restoreCache([pattern], cacheKey)
        if (restoredEntry) {
            core.info(`Restored ${artifactType} with key ${cacheKey} to ${pattern}`)
            listener.markRestored(restoredEntry.key, restoredEntry.size)
            return new ExtractedCacheEntry(artifactType, pattern, cacheKey)
        } else {
            core.info(`Did not restore ${artifactType} with key ${cacheKey} to ${pattern}`)
            return new ExtractedCacheEntry(artifactType, pattern, undefined)
        }
    }

    /**
     * Extract and save any defined extracted cache entries prior to the main Gradle User Home entry being saved.
     */
    async beforeSave(listener: CacheListener): Promise<void> {
        await this.debugReportGradleUserHomeSize('before saving common artifacts')
        this.removeExcludedPaths()
        await this.saveExtractedCacheEntries(listener)
        await this.debugReportGradleUserHomeSize(
            "after saving common artifacts (only 'caches' and 'notifications' will be stored)"
        )
    }

    /**
     * Delete any file paths that are excluded by the `gradle-home-cache-excludes` parameter.
     */
    private removeExcludedPaths(): void {
        const rawPaths: string[] = core.getMultilineInput(EXCLUDE_PATHS_PARAMETER)
        const resolvedPaths = rawPaths.map(x => path.resolve(this.gradleUserHome, x))

        for (const p of resolvedPaths) {
            this.debug(`Deleting excluded path: ${p}`)
            tryDelete(p)
        }
    }

    /**
     * Saves any artifacts that are configured to be cached separately, based on the extracted cache entry definitions.
     * These definitions are normally fixed, but can be overridden by the `gradle-home-extracted-cache-entries` parameter.
     * Each entry is extracted and saved in parallel, except when debugging is enabled.
     */
    private async saveExtractedCacheEntries(listener: CacheListener): Promise<void> {
        // Load the cache entry definitions (from config) and the previously restored entries (from filesystem)
        const cacheEntryDefinitions = this.getExtractedCacheEntryDefinitions()
        const previouslyRestoredEntries = this.loadExtractedCacheEntries()
        const cacheActions: Promise<ExtractedCacheEntry>[] = []

        for (const [artifactType, pattern] of cacheEntryDefinitions) {
            // Find all matching files for this cache entry definition
            const globber = await glob.create(pattern, {
                implicitDescendants: false,
                followSymbolicLinks: false
            })
            const matchingFiles = await globber.glob()

            if (matchingFiles.length === 0) {
                this.debug(`No files found to cache for ${artifactType}`)
                continue
            }

            if (this.isBundlePattern(pattern)) {
                // For an extracted "bundle", use the defined pattern and cache all matching files in a single entry.
                cacheActions.push(
                    this.saveExtractedCacheEntry(
                        matchingFiles,
                        artifactType,
                        pattern,
                        previouslyRestoredEntries,
                        listener.entry(pattern)
                    )
                )
            } else {
                // Otherwise cache each matching file in a separate entry, using the complete file path as the cache pattern.
                for (const cacheFile of matchingFiles) {
                    cacheActions.push(
                        this.saveExtractedCacheEntry(
                            [cacheFile],
                            artifactType,
                            cacheFile,
                            previouslyRestoredEntries,
                            listener.entry(cacheFile)
                        )
                    )
                }
            }
        }

        this.saveMetadataForCacheResults(await this.collectCacheResults(cacheActions))
    }

    private async saveExtractedCacheEntry(
        matchingFiles: string[],
        artifactType: string,
        pattern: string,
        previouslyRestoredEntries: ExtractedCacheEntry[],
        entryListener: CacheEntryListener
    ): Promise<ExtractedCacheEntry> {
        const cacheKey = this.createCacheKeyForArtifacts(artifactType, matchingFiles)
        const previouslyRestoredKey = previouslyRestoredEntries.find(
            x => x.artifactType === artifactType && x.pattern === pattern
        )?.cacheKey

        if (previouslyRestoredKey === cacheKey) {
            this.debug(`No change to previously restored ${artifactType}. Not saving.`)
        } else {
            core.info(`Caching ${artifactType} with path '${pattern}' and cache key: ${cacheKey}`)
            const savedEntry = await this.saveCache([pattern], cacheKey)
            if (savedEntry !== undefined) {
                entryListener.markSaved(savedEntry.key, savedEntry.size)
            }
        }

        for (const file of matchingFiles) {
            tryDelete(file)
        }

        return new ExtractedCacheEntry(artifactType, pattern, cacheKey)
    }

    protected createCacheKeyForArtifacts(artifactType: string, files: string[]): string {
        const cacheKeyPrefix = getCacheKeyPrefix()
        const relativeFiles = files.map(x => path.relative(this.gradleUserHome, x))
        const key = hashFileNames(relativeFiles)

        this.debug(`Generating cache key for ${artifactType} from files: ${relativeFiles}`)

        return `${cacheKeyPrefix}${artifactType}-${key}`
    }

    private isBundlePattern(pattern: string): boolean {
        return pattern.endsWith('*')
    }

    private async collectCacheResults(processes: Promise<ExtractedCacheEntry>[]): Promise<ExtractedCacheEntry[]> {
        // Run cache actions sequentially when debugging enabled
        if (this.cacheDebuggingEnabled) {
            for (const p of processes) {
                await p
            }
        }

        return await Promise.all(processes)
    }

    /**
     * Load information about the extracted cache entries previously restored/saved. This is loaded from the 'cache-metadata.json' file.
     */
    private loadExtractedCacheEntries(): ExtractedCacheEntry[] {
        const cacheMetadataFile = path.resolve(this.gradleUserHome, META_FILE_DIR, META_FILE)
        if (!fs.existsSync(cacheMetadataFile)) {
            return []
        }

        const filedata = fs.readFileSync(cacheMetadataFile, 'utf-8')
        core.debug(`Loaded cache metadata: ${filedata}`)
        const extractedCacheEntryMetadata = JSON.parse(filedata) as ExtractedCacheEntryMetadata
        return extractedCacheEntryMetadata.entries
    }

    /**
     * Saves information about the extracted cache entries into the 'cache-metadata.json' file.
     */
    private saveMetadataForCacheResults(results: ExtractedCacheEntry[]): void {
        const extractedCacheEntryMetadata = new ExtractedCacheEntryMetadata()
        extractedCacheEntryMetadata.entries = results.filter(x => x.cacheKey !== undefined)

        const filedata = JSON.stringify(extractedCacheEntryMetadata)
        core.debug(`Saving cache metadata: ${filedata}`)

        const actionMetadataDirectory = path.resolve(this.gradleUserHome, META_FILE_DIR)
        const cacheMetadataFile = path.resolve(actionMetadataDirectory, META_FILE)

        fs.mkdirSync(actionMetadataDirectory, {recursive: true})
        fs.writeFileSync(cacheMetadataFile, filedata, 'utf-8')
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

    /**
     * Determines the paths within Gradle User Home to cache.
     * By default, this is the 'caches' and 'notifications' directories,
     * but this can be overridden by the `gradle-home-cache-includes` parameter.
     */
    protected getCachePath(): string[] {
        const rawPaths: string[] = core.getMultilineInput(INCLUDE_PATHS_PARAMETER)
        rawPaths.push(META_FILE_DIR)
        const resolvedPaths = rawPaths.map(x => this.resolveCachePath(x))
        this.debug(`Using cache paths: ${resolvedPaths}`)
        return resolvedPaths
    }

    private resolveCachePath(rawPath: string): string {
        if (rawPath.startsWith('!')) {
            const resolved = this.resolveCachePath(rawPath.substring(1))
            return `!${resolved}`
        }
        return path.resolve(this.gradleUserHome, rawPath)
    }

    /**
     * Return the extracted cache entry definitions, which determine which artifacts will be cached
     * separately from the rest of the Gradle User Home cache entry.
     * This is normally a fixed set, but can be overridden by the `gradle-home-extracted-cache-entries` parameter.
     */
    private getExtractedCacheEntryDefinitions(): Map<string, string> {
        const rawDefinitions = core.getInput(EXTRACTED_CACHE_ENTRIES_PARAMETER)
        const parsedDefinitions = JSON.parse(rawDefinitions)
        return new Map(Array.from(parsedDefinitions, ([key, value]) => [key, path.resolve(this.gradleUserHome, value)]))
    }

    /**
     * When cache debugging is enabled, this method will give a detailed report
     * of the Gradle User Home contents.
     */
    private async debugReportGradleUserHomeSize(label: string): Promise<void> {
        if (!this.cacheDebuggingEnabled) {
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

function initializeGradleUserHome(gradleUserHome: string): void {
    fs.mkdirSync(gradleUserHome, {recursive: true})

    const propertiesFile = path.resolve(gradleUserHome, 'gradle.properties')
    fs.writeFileSync(propertiesFile, 'org.gradle.daemon=false')

    const initScript = path.resolve(gradleUserHome, 'init.gradle')
    fs.writeFileSync(
        initScript,
        `
import org.gradle.util.GradleVersion

// Don't run against the included builds (if the main build has any).
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
}
`
    )
}
