import * as exec from '@actions/exec'
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
        fs.rmSync(path.resolve(this.gradleUserHome, 'caches/journal-1'), {recursive: true, force: true})
        fs.mkdirSync(path.resolve(this.gradleUserHome, 'caches/journal-1'), {recursive: true})
        fs.writeFileSync(
            path.resolve(this.gradleUserHome, 'caches/journal-1/file-access.properties'),
            'inceptionTimestamp=0'
        )
        await this.ageAllFiles()
        await this.touchAllFiles('gc.properties')
    }

    async forceCleanup(): Promise<void> {
        await this.ageAllFiles('gc.properties')

        const cleanupProjectDir = path.resolve(this.tmpDir, 'dummy-cleanup-project')
        fs.mkdirSync(cleanupProjectDir, {recursive: true})
        fs.writeFileSync(
            path.resolve(cleanupProjectDir, 'settings.gradle'),
            'rootProject.name = "dummy-cleanup-project"'
        )
        fs.writeFileSync(path.resolve(cleanupProjectDir, 'build.gradle'), 'task("noop") {}')

        await exec.exec(`gradle -g ${this.gradleUserHome} --no-daemon --build-cache --no-scan --quiet noop`, [], {
            cwd: cleanupProjectDir
        })
    }

    private async ageAllFiles(fileName = '*'): Promise<void> {
        await exec.exec(
            'find',
            [this.gradleUserHome, '-name', fileName, '-exec', 'touch', '-m', '-d', '1970-01-01', '{}', '+'],
            {}
        )
    }

    private async touchAllFiles(fileName = '*'): Promise<void> {
        await exec.exec('find', [this.gradleUserHome, '-name', fileName, '-exec', 'touch', '-m', '{}', '+'], {})
    }
}
