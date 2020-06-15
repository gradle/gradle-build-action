import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as stream from 'stream'
import * as util from 'util'

import * as glob from '@actions/glob'

export async function hashFiles(
    baseDir: string,
    globs: string[] = ['**'],
    followSymbolicLinks = false
): Promise<string | null> {
    let hasMatch = false
    type FileHashes = Record<string, Buffer>
    const hashes: FileHashes = {}
    for await (const globPattern of globs) {
        const globMatch = `${baseDir}${path.sep}${globPattern}`
        const globber = await glob.create(globMatch, {followSymbolicLinks})
        for await (const file of globber.globGenerator()) {
            // console.log(file)
            if (!file.startsWith(`${baseDir}${path.sep}`)) {
                // console.log(`Ignore '${file}' since it is not under '${baseDir}'.`)
                continue
            }
            if (fs.statSync(file).isDirectory()) {
                // console.log(`Skip directory '${file}'.`)
                continue
            }
            const hash = crypto.createHash('sha256')
            const pipeline = util.promisify(stream.pipeline)
            await pipeline(fs.createReadStream(file), hash)
            hashes[path.relative(baseDir, file)] = hash.digest()
            hasMatch = true
        }
    }
    if (!hasMatch) return null
    const result = crypto.createHash('sha256')
    for (const file of Object.keys(hashes).sort()) {
        result.update(hashes[file])
    }
    result.end()
    return result.digest('hex')
}
