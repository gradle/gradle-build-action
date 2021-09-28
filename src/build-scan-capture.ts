import fs from 'fs'
import path from 'path'
import * as core from '@actions/core'

export function writeInitScript(): string {
    const tmpDir = process.env['RUNNER_TEMP'] || ''
    const initScript = path.resolve(tmpDir, 'build-scan-capture.init.gradle')
    core.info(`Writing init script: ${initScript}`)
    if (fs.existsSync(initScript)) {
        return initScript
    }
    fs.writeFileSync(
        initScript,
        `
import org.gradle.util.GradleVersion

// Don't run against the included builds (if the main build has any).
def isTopLevelBuild = gradle.getParent() == null
if (isTopLevelBuild) {
    def version = GradleVersion.current().baseVersion
    def atLeastGradle5 = version >= GradleVersion.version("5.0")
    def atLeastGradle6 = version >= GradleVersion.version("6.0")

    if (atLeastGradle6) {
        settingsEvaluated { settings ->
            if (settings.pluginManager.hasPlugin("com.gradle.enterprise")) {
                registerCallbacks(settings.extensions["gradleEnterprise"], settings.rootProject.name)
            }
        }
    } else if (atLeastGradle5) {
        projectsEvaluated { gradle ->
            if (gradle.rootProject.pluginManager.hasPlugin("com.gradle.build-scan")) {
                registerCallbacks(gradle.rootProject.extensions["gradleEnterprise"], gradle.rootProject.name)
            }
        }
    }
}

def registerCallbacks(gradleEnterprise, rootProjectName) {
    gradleEnterprise.with {
        buildScan {
            def scanFile = new File("gradle-build-scan.txt")
            buildScanPublished { buildScan ->
                scanFile.text = buildScan.buildScanUri
            }
        }
    }
}
`
    )
    return initScript
}
