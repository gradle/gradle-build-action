import * as cache from '../src/cache'
import * as path from 'path'

describe('cache', () => {
    describe('can extract gradle wrapper slug', () => {
        it('from wrapper properties file', async () => {
            const version = cache.extractGradleWrapperSlugFrom(
                path.resolve(
                    '__tests__/data/basic/gradle/wrapper/gradle-wrapper.properties'
                )
            )
            expect(version).toBe('6.5-bin')
        })
        it('for -bin dist', async () => {
            const version = cache.extractGradleWrapperSlugFromDistUri(
                'distributionUrl=https\\://services.gradle.org/distributions/gradle-6.5-bin.zip'
            )
            expect(version).toBe('6.5-bin')
        })
        it('for -all dist', async () => {
            const version = cache.extractGradleWrapperSlugFromDistUri(
                'distributionUrl=https\\://services.gradle.org/distributions/gradle-6.5-all.zip'
            )
            expect(version).toBe('6.5-all')
        })
        it('for milestone', async () => {
            const version = cache.extractGradleWrapperSlugFromDistUri(
                'distributionUrl=https\\://services.gradle.org/distributions/gradle-6.6-milestone-1-all.zip'
            )
            expect(version).toBe('6.6-milestone-1-all')
        })
    })
})
