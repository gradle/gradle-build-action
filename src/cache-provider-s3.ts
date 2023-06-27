import * as core from '@actions/core'
import * as AWS from '@aws-sdk/client-s3'
import {CacheEntry, CacheProvider} from './cache-provider'
import fs from 'fs'
import path from 'path'
import utils from '@actions/cache/lib/internal/cacheUtils'
import {createTar, extractTar, listTar} from '@actions/cache/lib/internal/tar'
import {NoSuchKey} from '@aws-sdk/client-s3'
import {Readable} from 'stream'

class S3BucketCache implements CacheProvider {
    private readonly s3: AWS.S3
    private readonly bucket: string

    constructor(s3: AWS.S3, bucket: string) {
        this.s3 = s3
        this.bucket = bucket
    }

    async saveCache(paths: string[], key: string): Promise<CacheEntry> {
        const compressionMethod = await utils.getCompressionMethod()
        const archiveFolder = await utils.createTempDirectory()
        const archivePath = path.join(archiveFolder, utils.getCacheFileName(compressionMethod))
        const cachePaths = await utils.resolvePaths(paths)

        try {
            await createTar(archiveFolder, cachePaths, compressionMethod)
            if (core.isDebug()) {
                await listTar(archivePath, compressionMethod)
            }

            const archiveFileSize = utils.getArchiveFileSizeInBytes(archivePath)
            core.debug(`File Size: ${archiveFileSize}`)

            core.debug(`Uploading to S3 bucket ${this.bucket}...`)
            const content = fs.createReadStream(archivePath)
            await this.s3.putObject({Bucket: this.bucket, Key: key, Body: content, ContentLength: archiveFileSize})
            return {key, size: archiveFileSize}
        } finally {
            try {
                await utils.unlinkFile(archivePath)
            } catch (error) {
                core.debug(`Failed to delete archive: ${error}`)
            }
        }
    }

    async restoreCache(paths: string[], primaryKey: string, restoreKeys?: string[]): Promise<CacheEntry | undefined> {
        const keys = [primaryKey, ...(restoreKeys || [])]
        core.debug('Resolved Keys:')
        core.debug(JSON.stringify(keys))

        const compressionMethod = await utils.getCompressionMethod()
        const archivePath = path.join(await utils.createTempDirectory(), utils.getCacheFileName(compressionMethod))
        core.debug(`Archive Path: ${archivePath}`)

        for (const key of keys) {
            core.info(`Trying resolve cache for key: ${key}`)
            try {
                const object = await this.s3.getObject({Bucket: this.bucket, Key: key})

                core.info(`Cache hit found for key: ${key}`)
                const content = object.Body as Readable
                const fileStream = fs.createWriteStream(archivePath)
                try {
                    content.pipe(fileStream)
                } finally {
                    fileStream.close()
                }

                const archiveFileSize = utils.getArchiveFileSizeInBytes(archivePath)
                core.info(`Cache Size: ~${Math.round(archiveFileSize / (1024 * 1024))} MB (${archiveFileSize} B)`)
                await extractTar(archivePath, compressionMethod)

                core.info('Cache restored successfully')
                return {key, size: archiveFileSize}
            } catch (error) {
                if (error instanceof NoSuchKey) continue
                throw error
            }
        }
        return undefined
    }
}

export default function createS3Cache(
    bucketURL: string,
    accessKeyId: string | undefined,
    secretAccessKey: string | undefined
): CacheProvider | undefined {
    const regEx = /https:\/\/(.*?).s3.(.*?).amazonaws.com\/?/gi
    const match = bucketURL.match(regEx)
    if (!match) return

    const [bucket, region] = match.slice(1)
    const credentials = accessKeyId && secretAccessKey ? {accessKeyId, secretAccessKey} : undefined
    const s3 = new AWS.S3({region, credentials})
    return new S3BucketCache(s3, bucket)
}
