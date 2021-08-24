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

export function truncateArgs(args: string): string {
    return args.trim().replace(/\s+/g, ' ').substr(0, 400)
}
