import * as core from '@actions/core'
import * as path from 'path'

export async function restoreCachedWrapperDist(
    executableDirectory: string
): Promise<void> {
    core.saveState('WRAPPER_BASE_DIR', path.resolve(executableDirectory))
    core.info(`WRAPPER_BASE_DIR = ${core.getState('WRAPPER_BASE_DIR')}`)
    const wrapperProperties = path.join(
        executableDirectory,
        'gradle/wrapper/gradle-wrapper.properties'
    )
    core.info(`wrapper properties = ${wrapperProperties}`)
}

export async function cacheWrapperDist(): Promise<void> {
    core.info(`WRAPPER_BASE_DIR = ${core.getState('WRAPPER_BASE_DIR')}`)
}
