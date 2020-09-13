import * as exec from '@actions/exec'
import * as cacheDependencies from './cache-dependencies'
import * as cacheConfiguration from './cache-configuration'

export async function execute(
    executable: string,
    root: string,
    argv: string[]
): Promise<BuildResult> {
    await cacheDependencies.restoreCachedDependencies(root)
    await cacheConfiguration.restoreCachedConfiguration(root)

    let publishing = false
    let buildScanUrl: string | undefined

    const status: number = await exec.exec(executable, argv, {
        cwd: root,
        ignoreReturnCode: true,
        listeners: {
            stdline: (line: string) => {
                if (line.includes('Publishing build scan...')) {
                    publishing = true
                }
                if (publishing && line.startsWith('http')) {
                    buildScanUrl = line.trim()
                    publishing = false
                }
            }
        }
    })

    return new BuildResultImpl(status, buildScanUrl)
}

export interface BuildResult {
    readonly status: number
    readonly buildScanUrl?: string
}

class BuildResultImpl implements BuildResult {
    constructor(readonly status: number, readonly buildScanUrl?: string) {}
}
