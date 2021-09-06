import {GradleUserHomeCache} from './cache-gradle-user-home'
import {ProjectDotGradleCache} from './cache-project-dot-gradle'
import * as core from '@actions/core'
import {isCacheReadEnabled, isCacheSaveEnabled} from './cache-utils'

const BUILD_ROOT_DIR = 'BUILD_ROOT_DIR'

export async function restore(buildRootDirectory: string): Promise<void> {
    if (!isCacheReadEnabled('gradle')) {
        core.debug('Cache read disabled')
        return
    }

    core.startGroup('Restore Gradle state from cache')
    core.saveState(BUILD_ROOT_DIR, buildRootDirectory)
    new GradleUserHomeCache().restore()
    new ProjectDotGradleCache(buildRootDirectory).restore()
    core.endGroup()
}

export async function save(): Promise<void> {
    if (!isCacheSaveEnabled('gradle')) {
        core.debug('Cache save disabled')
        return
    }

    core.startGroup('Caching Gradle state')
    const buildRootDirectory = core.getState(BUILD_ROOT_DIR)
    new GradleUserHomeCache().save()
    new ProjectDotGradleCache(buildRootDirectory).save()
    core.endGroup()
}
