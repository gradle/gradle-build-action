import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as glob from '@actions/glob'
import fs from 'fs'
import path from 'path'

export class CacheCleaner {
    private readonly gradleUserHome: string
    private readonly tmpDir: string

    constructor(gradleUserHome: string, tmpDir: string) {
        this.gradleUserHome = gradleUserHome
        this.tmpDir = tmpDir
    }

    async prepare(): Promise<void> {
        // Reset the file-access journal so that files appear not to have been used recently
        fs.rmSync(path.resolve(this.gradleUserHome, 'caches/journal-1'), {recursive: true, force: true})
        fs.mkdirSync(path.resolve(this.gradleUserHome, 'caches/journal-1'), {recursive: true})
        fs.writeFileSync(
            path.resolve(this.gradleUserHome, 'caches/journal-1/file-access.properties'),
            'inceptionTimestamp=0'
        )

        // Set the modification time of all files to the past: this timestamp is used when there is no matching entry in the journal
        await this.ageAllFiles()

        // Touch all 'gc' files so that cache cleanup won't run immediately.
        await this.touchAllFiles('gc.properties')
    }

    async forceCleanup(): Promise<void> {
        // Age all 'gc' files so that cache cleanup will run immediately.
        await this.ageAllFiles('gc.properties')

        // Run a dummy Gradle build to trigger cache cleanup
        const cleanupProjectDir = path.resolve(this.tmpDir, 'dummy-cleanup-project')
        fs.mkdirSync(cleanupProjectDir, {recursive: true})
        fs.writeFileSync(
            path.resolve(cleanupProjectDir, 'settings.gradle'),
            'rootProject.name = "dummy-cleanup-project"'
        )
        fs.writeFileSync(path.resolve(cleanupProjectDir, 'build.gradle'), 'task("noop") {}')

        const gradleCommand = `gradle -g ${this.gradleUserHome} --no-daemon --build-cache --no-scan --quiet -DGITHUB_DEPENDENCY_GRAPH_ENABLED=false noop`
        await exec.exec(gradleCommand, [], {
            cwd: cleanupProjectDir
        })
    }

    private async ageAllFiles(fileName = '*'): Promise<void> {
        core.debug(`Aging all files in Gradle User Home with name ${fileName}`)
        await this.setUtimes(`${this.gradleUserHome}/**/${fileName}`, new Date(0))
    }

    private async touchAllFiles(fileName = '*'): Promise<void> {
        core.debug(`Touching all files in Gradle User Home with name ${fileName}`)
        await this.setUtimes(`${this.gradleUserHome}/**/${fileName}`, new Date())
    }

    private async setUtimes(pattern: string, timestamp: Date): Promise<void> {
        const globber = await glob.create(pattern, {
            implicitDescendants: false
        })
        for await (const file of globber.globGenerator()) {
            fs.utimesSync(file, timestamp, timestamp)
        }
    }
}
