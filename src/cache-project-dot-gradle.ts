import path from 'path'
import {AbstractCache} from './cache-base'

// TODO: Maybe allow the user to override / tweak this set
const PATHS_TO_CACHE = [
    'configuration-cache' // Only configuration-cache is stored at present
]

/**
 * A simple cache that saves and restores the '.gradle/configuration-cache' directory in the project root.
 */
export class ProjectDotGradleCache extends AbstractCache {
    private rootDir: string
    constructor(rootDir: string) {
        super('project', 'Project configuration cache')
        this.rootDir = rootDir
    }

    protected getCachePath(): string[] {
        const dir = this.getProjectDotGradleDir()
        return PATHS_TO_CACHE.map(x => path.resolve(dir, x))
    }

    private getProjectDotGradleDir(): string {
        return path.resolve(this.rootDir, '.gradle')
    }
}
