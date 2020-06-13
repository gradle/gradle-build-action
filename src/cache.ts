import * as core from '@actions/core'

export async function restoreCachedWrapperDist(
    executableDirectory: string
): Promise<void> {
    core.saveState('GC_WRAPPER_BASE_DIR', executableDirectory)
}

export async function cacheWrapperDist(): Promise<void> {
    core.info(`GC_WRAPPER_BASE_DIR = ${core.getState('GC_WRAPPER_BASE_DIR')}`)
}
