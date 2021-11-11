import path from 'path'
import fs from 'fs'
import os from 'os'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'

import {AbstractCache, CacheEntryListener, CacheListener} from './cache-base'
import {getCacheKeyPrefix, hashFileNames, tryDelete} from './cache-utils'

const META_FILE_DIR = '.gradle-build-action'

const INCLUDE_PATHS_PARAMETER = 'gradle-home-cache-includes'
const EXCLUDE_PATHS_PARAMETER = 'gradle-home-cache-excludes'
const ARTIFACT_BUNDLES_PARAMETER = 'gradle-home-cache-artifact-bundles'

class CacheResult {
    readonly bundle: string
    readonly cacheKey: string | undefined

    constructor(bundle: string, cacheKey: string | undefined) {
        this.bundle = bundle
        this.cacheKey = cacheKey
    }
}

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

    async afterRestore(listener: CacheListener): Promise<void> {
        await this.reportGradleUserHomeSize('as restored from cache')
        await this.restoreArtifactBundles(listener)
        await this.reportGradleUserHomeSize('after restoring common artifacts')
    }

    private async restoreArtifactBundles(listener: CacheListener): Promise<void> {
        const bundleMetadata = this.loadBundleMetadata()
        const bundlePatterns = this.getArtifactBundles()

        const processes: Promise<CacheResult>[] = []

        for (const [bundle, cacheKey] of bundleMetadata) {
            const entryListener = listener.entry(bundle)
            const bundlePattern = bundlePatterns.get(bundle)

            // Handle case where the 'artifactBundlePatterns' have been changed
            if (bundlePattern === undefined) {
                core.info(`Found bundle metadata for ${bundle} but no such bundle defined`)
                entryListener.markRequested('BUNDLE_NOT_CONFIGURED')
            } else {
                const p = this.restoreArtifactBundle(bundle, cacheKey, bundlePattern, entryListener)
                // Run sequentially when debugging enabled
                if (this.cacheDebuggingEnabled) {
                    await p
                }
                processes.push(p)
            }
        }

        const results = await Promise.all(processes)

        this.saveMetadataForCacheResults(results)
    }

    private async restoreArtifactBundle(
        bundle: string,
        cacheKey: string,
        bundlePattern: string,
        listener: CacheEntryListener
    ): Promise<CacheResult> {
        listener.markRequested(cacheKey)

        const restoredEntry = await this.restoreCache([bundlePattern], cacheKey)
        if (restoredEntry) {
            core.info(`Restored ${bundle} with key ${cacheKey} to ${bundlePattern}`)
            listener.markRestored(restoredEntry.key, restoredEntry.size)
            return new CacheResult(bundle, cacheKey)
        } else {
            core.info(`Did not restore ${bundle} with key ${cacheKey} to ${bundlePattern}`)
            return new CacheResult(bundle, undefined)
        }
    }

    async beforeSave(listener: CacheListener): Promise<void> {
        await this.reportGradleUserHomeSize('before saving common artifacts')
        this.removeExcludedPaths()
        await this.saveArtifactBundles(listener)
        await this.reportGradleUserHomeSize(
            "after saving common artifacts (only 'caches' and 'notifications' will be stored)"
        )
    }

    private removeExcludedPaths(): void {
        const rawPaths: string[] = core.getMultilineInput(EXCLUDE_PATHS_PARAMETER)
        const resolvedPaths = rawPaths.map(x => path.resolve(this.gradleUserHome, x))

        for (const p of resolvedPaths) {
            this.debug(`Deleting excluded path: ${p}`)
            tryDelete(p)
        }
    }

    private async saveArtifactBundles(listener: CacheListener): Promise<void> {
        const bundleMetadata = this.loadBundleMetadata()

        const processes: Promise<CacheResult>[] = []
        for (const [bundle, pattern] of this.getArtifactBundles()) {
            const entryListener = listener.entry(bundle)
            const previouslyRestoredKey = bundleMetadata.get(bundle)
            const p = this.saveArtifactBundle(bundle, pattern, previouslyRestoredKey, entryListener)
            // Run sequentially when debugging enabled
            if (this.cacheDebuggingEnabled) {
                await p
            }
            processes.push(p)
        }

        const results = await Promise.all(processes)

        this.saveMetadataForCacheResults(results)
    }

    private async saveArtifactBundle(
        bundle: string,
        artifactPath: string,
        previouslyRestoredKey: string | undefined,
        listener: CacheEntryListener
    ): Promise<CacheResult> {
        const globber = await glob.create(artifactPath, {
            implicitDescendants: false,
            followSymbolicLinks: false
        })
        const bundleFiles = await globber.glob()

        // Handle no matching files
        if (bundleFiles.length === 0) {
            this.debug(`No files found to cache for ${bundle}`)
            return new CacheResult(bundle, undefined)
        }

        const cacheKey = this.createCacheKey(bundle, bundleFiles)

        if (previouslyRestoredKey === cacheKey) {
            this.debug(`No change to previously restored ${bundle}. Not caching.`)
        } else {
            core.info(`Caching ${bundle} with cache key: ${cacheKey}`)
            const savedEntry = await this.saveCache([artifactPath], cacheKey)
            if (savedEntry !== undefined) {
                listener.markSaved(savedEntry.key, savedEntry.size)
            }
        }

        for (const file of bundleFiles) {
            tryDelete(file)
        }

        return new CacheResult(bundle, cacheKey)
    }

    protected createCacheKey(bundle: string, files: string[]): string {
        const cacheKeyPrefix = getCacheKeyPrefix()
        const relativeFiles = files.map(x => path.relative(this.gradleUserHome, x))
        const key = hashFileNames(relativeFiles)

        this.debug(`Generating cache key for ${bundle} from files: ${relativeFiles}`)

        return `${cacheKeyPrefix}${bundle}-${key}`
    }

    private loadBundleMetadata(): Map<string, string> {
        const bundleMetaFile = path.resolve(this.gradleUserHome, META_FILE_DIR, 'bundles.json')
        if (!fs.existsSync(bundleMetaFile)) {
            return new Map<string, string>()
        }
        const filedata = fs.readFileSync(bundleMetaFile, 'utf-8')
        core.debug(`Loaded bundle metadata: ${filedata}`)
        return new Map(JSON.parse(filedata))
    }

    private saveMetadataForCacheResults(results: CacheResult[]): void {
        const metadata = new Map<string, string>()
        for (const result of results) {
            if (result.cacheKey !== undefined) {
                metadata.set(result.bundle, result.cacheKey)
            }
        }
        const filedata = JSON.stringify(Array.from(metadata))
        core.debug(`Saving bundle metadata: ${filedata}`)

        const bundleMetaDir = path.resolve(this.gradleUserHome, META_FILE_DIR)
        const bundleMetaFile = path.resolve(bundleMetaDir, 'bundles.json')

        if (!fs.existsSync(bundleMetaDir)) {
            fs.mkdirSync(bundleMetaDir, {recursive: true})
        }
        fs.writeFileSync(bundleMetaFile, filedata, 'utf-8')
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

    private getArtifactBundles(): Map<string, string> {
        const artifactBundleDefinition = core.getInput(ARTIFACT_BUNDLES_PARAMETER)
        this.debug(`Using artifact bundle definition: ${artifactBundleDefinition}`)
        const artifactBundles = JSON.parse(artifactBundleDefinition)
        return new Map(Array.from(artifactBundles, ([key, value]) => [key, path.resolve(this.gradleUserHome, value)]))
    }

    private async reportGradleUserHomeSize(label: string): Promise<void> {
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
            println("::notice title=Build '\${rootProjectName}'\${buildOutcome}::\${buildScan.buildScanUri}")
            println("::set-output name=build-scan-url::\${buildScan.buildScanUri}")
        }
    }
}
`
    )
}
