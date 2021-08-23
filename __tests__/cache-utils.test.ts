import * as cacheUtils from '../src/cache-utils'
import * as path from 'path'

describe('cacheUtils-utils', () => {
    describe('can truncate args', () => {
        test('handles zero-length string', () => {
            expect(cacheUtils.truncateArgs('')).toBe('')
        })
        test('leaves short string untouched', () => {
            expect(
                cacheUtils.truncateArgs('short string that-should-be-untouched')
            ).toBe('short string that-should-be-untouched')
        })
        test('truncates long string', () => {
            const longString = 'a'.repeat(500)
            expect(cacheUtils.truncateArgs(longString)).toBe('a'.repeat(400))
        })
        test('trims leading and trailing whitespace', () => {
            expect(cacheUtils.truncateArgs('    this is an arg      ')).toBe(
                'this is an arg'
            )
        })
        test('removes repeated whitespace', () => {
            expect(
                cacheUtils.truncateArgs(
                    '   this     one     has long   \t\n\t\r  spaces    '
                )
            ).toBe('this one has long spaces')
        })
    })
})
