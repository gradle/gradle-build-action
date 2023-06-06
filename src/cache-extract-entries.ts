import path from 'path'
import fs from 'fs'
import * as core from '@actions/core'
import * as glob from '@actions/glob'

import * as params from './input-params'

import {META_FILE_DIR} from './cache-base'
import {CacheEntryListener, CacheListener} from './cache-reporting'
import {cacheDebug, getCacheKeyPrefix, hashFileNames, restoreCache, saveCache, tryDelete} from './cache-utils'
import {loadBuildResults} from './build-results'

const SKIP_RESTORE_VAR = 'GRADLE_BUILD_ACTION_SKIP_RESTORE'

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
 * The specification for a type of extracted cache entry.
 */
class ExtractedCacheEntryDefinition {
    artifactType: string
    pattern: string
    bundle: boolean
    uniqueFileNames = true

    constructor(artifactType: string, pattern: string, bundle: boolean) {
        this.artifactType = artifactType
        this.pattern = pattern
        this.bundle = bundle
    }

    withNonUniqueFileNames(): ExtractedCacheEntryDefinition {
        this.uniqueFileNames = false
        return this
    }
}

/**
 * Caches and restores the entire Gradle User Home directory, extracting entries containing common artifacts
 * for more efficient storage.
 */
abstract class AbstractEntryExtractor {
    protected readonly gradleUserHome: string
    private extractorName: string

    constructor(gradleUserHome: string, extractorName: string) {
        this.gradleUserHome = gradleUserHome
        this.extractorName = extractorName
    }

    /**
     * Restores any artifacts that were cached separately, based on the information in the `cache-metadata.json` file.
     * Each extracted cache entry is restored in parallel, except when debugging is enabled.
     */
    async restore(listener: CacheListener): Promise<void> {
        const previouslyExtractedCacheEntries = this.loadExtractedCacheEntries()

        const processes: Promise<ExtractedCacheEntry>[] = []

        for (const cacheEntry of previouslyExtractedCacheEntries) {
            const artifactType = cacheEntry.artifactType
            const entryListener = listener.entry(cacheEntry.pattern)

            // Handle case where the extracted-cache-entry definitions have been changed
            const skipRestore = process.env[SKIP_RESTORE_VAR] || ''
            if (skipRestore.includes(artifactType)) {
                core.info(`Not restoring extracted cache entry for ${artifactType}`)
                entryListener.markRequested('SKIP_RESTORE')
            } else {
                processes.push(
                    this.awaitForDebugging(
                        this.restoreExtractedCacheEntry(
                            artifactType,
                            cacheEntry.cacheKey!,
                            cacheEntry.pattern,
                            entryListener
                        )
                    )
                )
            }
        }

        this.saveMetadataForCacheResults(await Promise.all(processes))
    }

    private async restoreExtractedCacheEntry(
        artifactType: string,
        cacheKey: string,
        pattern: string,
        listener: CacheEntryListener
    ): Promise<ExtractedCacheEntry> {
        const restoredEntry = await restoreCache([pattern], cacheKey, [], listener)
        if (restoredEntry) {
            core.info(`Restored ${artifactType} with key ${cacheKey} to ${pattern}`)
            return new ExtractedCacheEntry(artifactType, pattern, cacheKey)
        } else {
            core.info(`Did not restore ${artifactType} with key ${cacheKey} to ${pattern}`)
            return new ExtractedCacheEntry(artifactType, pattern, undefined)
        }
    }

    /**
     * Saves any artifacts that are configured to be cached separately, based on the extracted cache entry definitions.
     * Each entry is extracted and saved in parallel, except when debugging is enabled.
     */
    async extract(listener: CacheListener): Promise<void> {
        // Load the cache entry definitions (from config) and the previously restored entries (from persisted metadata file)
        const cacheEntryDefinitions = this.getExtractedCacheEntryDefinitions()
        cacheDebug(
            `Extracting cache entries for ${this.extractorName}: ${JSON.stringify(cacheEntryDefinitions, null, 2)}`
        )

        const previouslyRestoredEntries = this.loadExtractedCacheEntries()
        const cacheActions: Promise<ExtractedCacheEntry>[] = []

        // For each cache entry definition, determine if it has already been restored, and if not, extract it
        for (const cacheEntryDefinition of cacheEntryDefinitions) {
            const artifactType = cacheEntryDefinition.artifactType
            const pattern = cacheEntryDefinition.pattern

            // Find all matching files for this cache entry definition
            const globber = await glob.create(pattern, {
                implicitDescendants: false
            })
            const matchingFiles = await globber.glob()

            if (matchingFiles.length === 0) {
                cacheDebug(`No files found to cache for ${artifactType}`)
                continue
            }

            if (cacheEntryDefinition.bundle) {
                // For an extracted "bundle", use the defined pattern and cache all matching files in a single entry.
                cacheActions.push(
                    this.awaitForDebugging(
                        this.saveExtractedCacheEntry(
                            matchingFiles,
                            artifactType,
                            pattern,
                            cacheEntryDefinition.uniqueFileNames,
                            previouslyRestoredEntries,
                            listener.entry(pattern)
                        )
                    )
                )
            } else {
                // Otherwise cache each matching file in a separate entry, using the complete file path as the cache pattern.
                for (const cacheFile of matchingFiles) {
                    cacheActions.push(
                        this.awaitForDebugging(
                            this.saveExtractedCacheEntry(
                                [cacheFile],
                                artifactType,
                                cacheFile,
                                cacheEntryDefinition.uniqueFileNames,
                                previouslyRestoredEntries,
                                listener.entry(cacheFile)
                            )
                        )
                    )
                }
            }
        }

        this.saveMetadataForCacheResults(await Promise.all(cacheActions))
    }

    private async saveExtractedCacheEntry(
        matchingFiles: string[],
        artifactType: string,
        pattern: string,
        uniqueFileNames: boolean,
        previouslyRestoredEntries: ExtractedCacheEntry[],
        entryListener: CacheEntryListener
    ): Promise<ExtractedCacheEntry> {
        const cacheKey = uniqueFileNames
            ? this.createCacheKeyFromFileNames(artifactType, matchingFiles)
            : await this.createCacheKeyFromFileContents(artifactType, pattern)
        const previouslyRestoredKey = previouslyRestoredEntries.find(
            x => x.artifactType === artifactType && x.pattern === pattern
        )?.cacheKey

        if (previouslyRestoredKey === cacheKey) {
            cacheDebug(`No change to previously restored ${artifactType}. Not saving.`)
            entryListener.markNotSaved('contents unchanged')
        } else {
            core.info(`Caching ${artifactType} with path '${pattern}' and cache key: ${cacheKey}`)
            await saveCache([pattern], cacheKey, entryListener)
        }

        for (const file of matchingFiles) {
            tryDelete(file)
        }

        return new ExtractedCacheEntry(artifactType, pattern, cacheKey)
    }

    protected createCacheKeyFromFileNames(artifactType: string, files: string[]): string {
        const cacheKeyPrefix = getCacheKeyPrefix()
        const relativeFiles = files.map(x => path.relative(this.gradleUserHome, x))
        const key = hashFileNames(relativeFiles)

        cacheDebug(`Generating cache key for ${artifactType} from file names: ${relativeFiles}`)

        return `${cacheKeyPrefix}${artifactType}-${key}`
    }

    protected async createCacheKeyFromFileContents(artifactType: string, pattern: string): Promise<string> {
        const cacheKeyPrefix = getCacheKeyPrefix()
        const key = await glob.hashFiles(pattern)

        cacheDebug(`Generating cache key for ${artifactType} from files matching: ${pattern}`)

        return `${cacheKeyPrefix}${artifactType}-${key}`
    }

    // Run actions sequentially if debugging is enabled
    private async awaitForDebugging(p: Promise<ExtractedCacheEntry>): Promise<ExtractedCacheEntry> {
        if (params.isCacheDebuggingEnabled()) {
            await p
        }
        return p
    }

    /**
     * Load information about the extracted cache entries previously restored/saved. This is loaded from the 'cache-metadata.json' file.
     */
    protected loadExtractedCacheEntries(): ExtractedCacheEntry[] {
        const cacheMetadataFile = this.getCacheMetadataFile()
        if (!fs.existsSync(cacheMetadataFile)) {
            return []
        }

        const filedata = fs.readFileSync(cacheMetadataFile, 'utf-8')
        cacheDebug(`Loaded cache metadata: ${filedata}`)
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
        cacheDebug(`Saving cache metadata: ${filedata}`)

        fs.writeFileSync(this.getCacheMetadataFile(), filedata, 'utf-8')
    }

    private getCacheMetadataFile(): string {
        const actionMetadataDirectory = path.resolve(this.gradleUserHome, META_FILE_DIR)
        fs.mkdirSync(actionMetadataDirectory, {recursive: true})

        return path.resolve(actionMetadataDirectory, `${this.extractorName}-entry-metadata.json`)
    }

    protected abstract getExtractedCacheEntryDefinitions(): ExtractedCacheEntryDefinition[]
}

export class GradleHomeEntryExtractor extends AbstractEntryExtractor {
    constructor(gradleUserHome: string) {
        super(gradleUserHome, 'gradle-home')
    }

    async extract(listener: CacheListener): Promise<void> {
        await this.deleteWrapperZips()
        return super.extract(listener)
    }

    /**
     * Delete any downloaded wrapper zip files that are not needed after extraction.
     * These files are cleaned up by Gradle >= 7.5, but for older versions we remove them manually.
     */
    private async deleteWrapperZips(): Promise<void> {
        const wrapperZips = path.resolve(this.gradleUserHome, 'wrapper/dists/*/*/*.zip')
        const globber = await glob.create(wrapperZips, {
            implicitDescendants: false
        })

        for (const wrapperZip of await globber.glob()) {
            cacheDebug(`Deleting wrapper zip: ${wrapperZip}`)
            await tryDelete(wrapperZip)
        }
    }

    /**
     * Return the extracted cache entry definitions, which determine which artifacts will be cached
     * separately from the rest of the Gradle User Home cache entry.
     */
    protected getExtractedCacheEntryDefinitions(): ExtractedCacheEntryDefinition[] {
        const entryDefinition = (
            artifactType: string,
            patterns: string[],
            bundle: boolean
        ): ExtractedCacheEntryDefinition => {
            const resolvedPatterns = patterns
                .map(x => {
                    const isDir = x.endsWith('/')
                    const resolved = path.resolve(this.gradleUserHome, x)
                    return isDir ? `${resolved}/` : resolved // Restore trailing '/' removed by path.resolve()
                })
                .join('\n')
            return new ExtractedCacheEntryDefinition(artifactType, resolvedPatterns, bundle)
        }

        return [
            entryDefinition('generated-gradle-jars', ['caches/*/generated-gradle-jars/*.jar'], false),
            entryDefinition('wrapper-zips', ['wrapper/dists/*/*/'], false), // Each wrapper directory cached separately
            entryDefinition('java-toolchains', ['jdks/*/'], false), // Each extracted JDK cached separately
            entryDefinition('dependencies', ['caches/modules-*/files-*/*/*/*/*'], true),
            entryDefinition('instrumented-jars', ['caches/jars-*/*'], true),
            entryDefinition('kotlin-dsl', ['caches/*/kotlin-dsl/*/*'], true)
        ]
    }
}

export class ConfigurationCacheEntryExtractor extends AbstractEntryExtractor {
    constructor(gradleUserHome: string) {
        super(gradleUserHome, 'configuration-cache')
    }

    /**
     * Handle the case where Gradle User Home has not been fully restored, so that the configuration-cache
     * entry is not reusable.
     */
    async restore(listener: CacheListener): Promise<void> {
        if (listener.fullyRestored) {
            return super.restore(listener)
        }

        core.info('Not restoring configuration-cache state, as Gradle User Home was not fully restored')
        for (const cacheEntry of this.loadExtractedCacheEntries()) {
            listener.entry(cacheEntry.pattern).markRequested('NOT_RESTORED')
        }
    }

    /**
     * Extract cache entries for the configuration cache in each project.
     */
    protected getExtractedCacheEntryDefinitions(): ExtractedCacheEntryDefinition[] {
        return this.getProjectRoots().map(projectRoot => {
            const configCachePath = path.resolve(projectRoot, '.gradle/configuration-cache')
            return new ExtractedCacheEntryDefinition(
                'configuration-cache',
                configCachePath,
                true
            ).withNonUniqueFileNames()
        })
    }

    /**
     * For every Gradle invocation, we record the project root directory. This method returns the entire
     * set of project roots, to allow saving of configuration-cache entries for each.
     */
    private getProjectRoots(): string[] {
        const buildResults = loadBuildResults()
        const projectRootDirs = buildResults.map(x => x.rootProjectDir)
        return [...new Set(projectRootDirs)] // Remove duplicates
    }
}
