import * as path from 'path'
import * as glob from '@actions/glob'

export async function hashFiles(
    baseDir: string,
    patterns: string[] = ['**'],
    followSymbolicLinks = false
): Promise<string | null> {
    const combinedPatterns = patterns
        .map(pattern => `${baseDir}${path.sep}${pattern}`)
        .join('\n')
    return glob.hashFiles(combinedPatterns, {followSymbolicLinks})
}
