import * as cryptoUtils from '../src/crypto-utils'
import * as path from 'path'

describe('crypto-utils', () => {
    describe('can hash', () => {
        it('a directory', async () => {
            const hash = await cryptoUtils.hashFiles(
                path.resolve('__tests__/data/basic/gradle')
            )
            expect(hash).toBe(
                process.platform === 'win32'
                    ? '3364336e94e746ce65a31748a6371b7efd7d499e18ad605c74c91cde0edc0a44'
                    : '4ebb65b45e6f6796d5ec6ace96e9471cc6573d294c54f99c4920fe5328e75bab'
            )
        })
        it('a directory with a glob', async () => {
            const hash = await cryptoUtils.hashFiles(
                path.resolve('__tests__/data/basic/'),
                ['gradle/**']
            )
            expect(hash).toBe(
                process.platform === 'win32'
                    ? '3364336e94e746ce65a31748a6371b7efd7d499e18ad605c74c91cde0edc0a44'
                    : '4ebb65b45e6f6796d5ec6ace96e9471cc6573d294c54f99c4920fe5328e75bab'
            )
        })
        it('a directory with globs', async () => {
            const hash = await cryptoUtils.hashFiles(
                path.resolve('__tests__/data/basic/'),
                ['**/*.gradle', 'gradle/**']
            )
            expect(hash).toBe(
                process.platform === 'win32'
                    ? 'd9b66fded38f79f601ce745d64ed726a8df8c0b242b02bcd2c1d331f54742ad6'
                    : 'aa72a837158799fbadd1c4aff94fcc2b5bb9dc6ad8d12f6337d047d4b0c8f79e'
            )
        })
    })
})
