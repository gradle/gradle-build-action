import path from 'path'
import fs from 'fs'
import {AbstractCache} from './cache-utils'

const PATHS_TO_CACHE = [
    'configuration-cache' // Only configuration-cache is stored at present
]

export class ProjectDotGradleCache extends AbstractCache {
    private rootDir: string
    constructor(rootDir: string) {
        super('project', 'Project .gradle directory')
        this.rootDir = rootDir
    }

    protected cacheOutputExists(): boolean {
        const dir = this.getProjectDotGradleDir()
        return fs.existsSync(dir)
    }

    protected getCachePath(): string[] {
        const dir = this.getProjectDotGradleDir()
        return PATHS_TO_CACHE.map(x => path.resolve(dir, x))
    }

    private getProjectDotGradleDir(): string {
        return path.resolve(this.rootDir, '.gradle')
    }
}
