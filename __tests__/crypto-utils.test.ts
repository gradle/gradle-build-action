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
                    : '63b9f14f65d014e585099c9c274b9dcbddf5cfd1a8978e5a24efb89ff9304348'
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
                    : '63b9f14f65d014e585099c9c274b9dcbddf5cfd1a8978e5a24efb89ff9304348'
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
                    : 'f42cd10636f09799f4e01cc84e7ae906cc1d9140f1446f8dcd054d19cbc44c2b'
            )
        })
    })
})
