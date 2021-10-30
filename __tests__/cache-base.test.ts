import {CacheEntryReport, CachingReport} from '../src/cache-base'

describe('caching report', () => {
    describe('reports not fully restored', () => {
        it('with one requested entry report', async () => {
            const report = new CachingReport()
            report.entryReport('foo').markRequested('1', ['2'])
            report.entryReport('bar').markRequested('3').markRestored('4')
            expect(report.fullyRestored).toBe(false)
        })
    })
    describe('reports fully restored', () => {
        it('when empty', async () => {
            const report = new CachingReport()
            expect(report.fullyRestored).toBe(true)
        })
        it('with empty entry reports', async () => {
            const report = new CachingReport()
            report.entryReport('foo')
            report.entryReport('bar')
            expect(report.fullyRestored).toBe(true)
        })
        it('with restored entry report', async () => {
            const report = new CachingReport()
            report.entryReport('bar').markRequested('3').markRestored('4')
            expect(report.fullyRestored).toBe(true)
        })
        it('with multiple restored entry reportss', async () => {
            const report = new CachingReport()
            report.entryReport('foo').markRestored('4')
            report.entryReport('bar').markRequested('3').markRestored('4')
            expect(report.fullyRestored).toBe(true)
        })
    })
    describe('can be stringified and rehydrated', () => {
        it('when empty', async () => {
            const report = new CachingReport()

            const stringRep = report.stringify()
            const reportClone: CachingReport = CachingReport.rehydrate(stringRep)

            expect(reportClone.cacheEntryReports).toEqual([])

            // Can call methods on rehydrated
            expect(reportClone.entryReport('foo')).toBeInstanceOf(CacheEntryReport)
        })
        it('with entry reports', async () => {
            const report = new CachingReport()
            report.entryReport('foo')
            report.entryReport('bar')
            report.entryReport('baz')

            const stringRep = report.stringify()
            const reportClone: CachingReport = CachingReport.rehydrate(stringRep)

            expect(reportClone.cacheEntryReports.length).toBe(3)
            expect(reportClone.cacheEntryReports[0].entryName).toBe('foo')
            expect(reportClone.cacheEntryReports[1].entryName).toBe('bar')
            expect(reportClone.cacheEntryReports[2].entryName).toBe('baz')

            expect(reportClone.entryReport('foo')).toBe(reportClone.cacheEntryReports[0])
        })
        it('with rehydrated entry report', async () => {
            const report = new CachingReport()
            const entryReport = report.entryReport('foo')
            entryReport.markRequested('1', ['2', '3'])
            entryReport.markSaved('4')

            const stringRep = report.stringify()
            const reportClone: CachingReport = CachingReport.rehydrate(stringRep)
            const entryClone = reportClone.entryReport('foo')

            expect(entryClone.requestedKey).toBe('1')
            expect(entryClone.requestedRestoreKeys).toEqual(['2', '3'])
            expect(entryClone.savedKey).toBe('4')
        })
        it('with live entry report', async () => {
            const report = new CachingReport()
            const entryReport = report.entryReport('foo')
            entryReport.markRequested('1', ['2', '3'])

            const stringRep = report.stringify()
            const reportClone: CachingReport = CachingReport.rehydrate(stringRep)
            const entryClone = reportClone.entryReport('foo')

            // Check type and call method on rehydrated entry report
            expect(entryClone).toBeInstanceOf(CacheEntryReport)
            entryClone.markSaved('4')

            expect(entryClone.requestedKey).toBe('1')
            expect(entryClone.requestedRestoreKeys).toEqual(['2', '3'])
            expect(entryClone.savedKey).toBe('4')
        })
    })
})
