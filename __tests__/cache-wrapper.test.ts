import * as cacheWrapper from '../src/cache-wrapper'
import * as path from 'path'

describe('cache', () => {
    describe('can extract gradle wrapper slug', () => {
        it('from wrapper properties file', async () => {
            const version = cacheWrapper.extractGradleWrapperSlugFrom(
                path.resolve(
                    '__tests__/data/basic/gradle/wrapper/gradle-wrapper.properties'
                )
            )
            expect(version).toBe('6.6.1-bin')
        })
        it('for -bin dist', async () => {
            const version = cacheWrapper.extractGradleWrapperSlugFromDistUri(
                'distributionUrl=https\\://services.gradle.org/distributions/gradle-6.6.1-bin.zip'
            )
            expect(version).toBe('6.6.1-bin')
        })
        it('for -all dist', async () => {
            const version = cacheWrapper.extractGradleWrapperSlugFromDistUri(
                'distributionUrl=https\\://services.gradle.org/distributions/gradle-6.6.1-all.zip'
            )
            expect(version).toBe('6.6.1-all')
        })
        it('for milestone', async () => {
            const version = cacheWrapper.extractGradleWrapperSlugFromDistUri(
                'distributionUrl=https\\://services.gradle.org/distributions/gradle-6.6-milestone-1-all.zip'
            )
            expect(version).toBe('6.6-milestone-1-all')
        })
    })
})
