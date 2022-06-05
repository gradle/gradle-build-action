package com.gradle.gradlebuildaction

import groovy.json.JsonSlurper

import static org.junit.Assume.assumeTrue

class TestBuildResultRecorder extends BaseInitScriptTest {
    def initScript = 'build-result-capture.init.gradle'

    def "produces build results file for build with #testGradleVersion"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        run(['help'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('help', testGradleVersion, false, false)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "produces build results file for failing build with #testGradleVersion"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        addFailingTaskToBuild()
        runAndFail(['expectFailure'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('expectFailure', testGradleVersion, true, false)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "produces build results file for build with --configuration-cache on #testGradleVersion"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        run(['help', '--configuration-cache'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('help', testGradleVersion, false, false)
        assert buildResultFile.delete()

        when:
        run(['help', '--configuration-cache'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('help', testGradleVersion, false, false)

        where:
        testGradleVersion << CONFIGURATION_CACHE_VERSIONS
    }

    def "produces build results file for #testGradleVersion with build scan published"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        declareGePluginApplication(testGradleVersion.gradleVersion)
        run(['help'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('help', testGradleVersion, false, true)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "produces build results file for failing build on #testGradleVersion with build scan published"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        declareGePluginApplication(testGradleVersion.gradleVersion)
        addFailingTaskToBuild()
        runAndFail(['expectFailure'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('expectFailure', testGradleVersion, true, true)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "produces build results file for build with --configuration-cache on #testGradleVersion with build scan published"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        declareGePluginApplication(testGradleVersion.gradleVersion)
        run(['help', '--configuration-cache'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('help', testGradleVersion, false, true)
        assert buildResultFile.delete()

        when:
        run(['help', '--configuration-cache'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('help', testGradleVersion, false, true)

        where:
        testGradleVersion << CONFIGURATION_CACHE_VERSIONS
    }

    void assertResults(String task, TestGradleVersion testGradleVersion, boolean hasFailure, boolean hasBuildScan) {
        def results = new JsonSlurper().parse(buildResultFile)
        assert results['rootProject'] == ROOT_PROJECT_NAME
        assert results['requestedTasks'] == task
        assert results['gradleVersion'] == testGradleVersion.gradleVersion.version
        assert results['buildFailed'] == hasFailure
        assert results['buildScanUri'] == (hasBuildScan ? "${mockScansServer.address}s/${PUBLIC_BUILD_SCAN_ID}" : null)
    }

    private File getBuildResultFile() {
        def buildResultsDir = new File(testProjectDir, '.build-results')
        assert buildResultsDir.directory
        assert buildResultsDir.listFiles().size() == 1
        def resultsFile = buildResultsDir.listFiles()[0]
        assert resultsFile.name.startsWith('github-step-id')
        return resultsFile
    }
}
