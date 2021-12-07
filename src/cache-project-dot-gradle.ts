import * as core from '@actions/core'
import path from 'path'
import fs from 'fs'
import {AbstractCache, META_FILE_DIR, PROJECT_ROOTS_FILE} from './cache-base'

/**
 * A simple cache that saves and restores the '.gradle/configuration-cache' directory in the project root.
 */
export class ProjectDotGradleCache extends AbstractCache {
    constructor(gradleUserHome: string) {
        super(gradleUserHome, 'project', 'Project configuration cache')
    }

    protected getCachePath(): string[] {
        return this.getProjectRoots().map(x => path.resolve(x, '.gradle/configuration-cache'))
    }

    protected initializeGradleUserHome(gradleUserHome: string, initScriptsDir: string): void {
        const projectRootCapture = path.resolve(initScriptsDir, 'project-root-capture.init.gradle')
        fs.writeFileSync(
            projectRootCapture,
            `
    // Only run again root build. Do not run against included builds.
    def isTopLevelBuild = gradle.getParent() == null
    if (isTopLevelBuild) {
        settingsEvaluated { settings ->
            def projectRootEntry = settings.rootDir.absolutePath + "\\n"
            def projectRootList = new File(settings.gradle.gradleUserHomeDir, "${META_FILE_DIR}/${PROJECT_ROOTS_FILE}")
            println "Adding " + projectRootEntry + " to " + projectRootList
            if (!projectRootList.exists() || !projectRootList.text.contains(projectRootEntry)) {
                projectRootList << projectRootEntry
            }
        }
    }`
        )
    }

    /**
     * For every Gradle invocation, we record the project root directory. This method returns the entire
     * set of project roots, to allow saving of configuration-cache entries for each.
     */
    private getProjectRoots(): string[] {
        const projectList = path.resolve(this.gradleUserHome, META_FILE_DIR, PROJECT_ROOTS_FILE)
        if (!fs.existsSync(projectList)) {
            core.info(`Missing project list file ${projectList}`)
            return []
        }
        const projectRoots = fs.readFileSync(projectList, 'utf-8')
        core.info(`Found project roots '${projectRoots}' in ${projectList}`)
        return projectRoots.trim().split('\n')
    }
}
