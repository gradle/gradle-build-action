import * as cryptoUtils from '../src/crypto-utils'
import * as path from 'path'

describe('crypto-utils', () => {
    describe('can hash', () => {
        it('a directory', async () => {
            const hash = await cryptoUtils.hashFiles(
                path.resolve('__tests__/data/basic/gradle')
            )
            expect(hash).toBe(
                '4ebb65b45e6f6796d5ec6ace96e9471cc6573d294c54f99c4920fe5328e75bab'
            )
        })
        it('a directory with a glob', async () => {
            const hash = await cryptoUtils.hashFiles(
                path.resolve('__tests__/data/basic/'),
                ['gradle/**']
            )
            expect(hash).toBe(
                '4ebb65b45e6f6796d5ec6ace96e9471cc6573d294c54f99c4920fe5328e75bab'
            )
        })
        it('a directory with globs', async () => {
            const hash = await cryptoUtils.hashFiles(
                path.resolve('__tests__/data/basic/'),
                ['**/*.gradle', 'gradle/**']
            )
            expect(hash).toBe(
                '2db1d5291774949ab89e18e9d82ee24748ca0f6cc78de69ea9104357c50ad4a5'
            )
        })
    })
})
