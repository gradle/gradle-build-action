package com.gradle.gradlebuildaction

import groovy.json.JsonSlurper

import static org.junit.Assume.assumeTrue

class TestBuildResultRecorder extends BaseInitScriptTest {
    def initScript = 'gradle-build-action.build-result-capture.init.gradle'

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

    def "produces build results file for #testGradleVersion with ge-plugin and no build scan published"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        declareGePluginApplication(testGradleVersion.gradleVersion)
        run(['help', '--no-scan'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('help', testGradleVersion, false, false)

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

    def "produces build results file for failing build on #testGradleVersion when build scan publish fails"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        declareGePluginApplication(testGradleVersion.gradleVersion)
        addFailingTaskToBuild()
        failScanUpload = true
        runAndFail(['expectFailure'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('expectFailure', testGradleVersion, true, false, true)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "produces no build results file when GitHub env vars not set with #testGradleVersion"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        run(['help'], initScript, testGradleVersion.gradleVersion, [], [RUNNER_TEMP: '', GITHUB_ACTION: ''])

        then:
        def buildResultsDir = new File(testProjectDir, '.build-results')
        assert !buildResultsDir.exists()

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "produces no build results file when RUNNER_TEMP dir is not a writable directory with #testGradleVersion"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def invalidDir = new File(testProjectDir, 'invalid-runner-temp')
        invalidDir.createNewFile()

        run(['help'], initScript, testGradleVersion.gradleVersion, [], [RUNNER_TEMP: invalidDir.absolutePath])

        then:
        def buildResultsDir = new File(testProjectDir, '.build-results')
        assert !buildResultsDir.exists()

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "produces build results file with build scan when GE plugin is applied in settingsEvaluated"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        settingsFile.text = """
            plugins {
                id 'com.gradle.enterprise' version '3.16.1' apply(false)
            }
            gradle.settingsEvaluated {
                apply plugin: 'com.gradle.enterprise'
                gradleEnterprise {
                    server = '$mockScansServer.address'
                    buildScan {
                        publishAlways()
                    }
                }
            }
        """ + settingsFile.text
        
        run(['help'], initScript, testGradleVersion.gradleVersion)

        then:
        assertResults('help', testGradleVersion, false, true)

        where:
        testGradleVersion << SETTINGS_PLUGIN_VERSIONS
    }

    void assertResults(String task, TestGradleVersion testGradleVersion, boolean hasFailure, boolean hasBuildScan, boolean scanUploadFailed = false) {
        def results = new JsonSlurper().parse(buildResultFile)
        assert results['rootProjectName'] == ROOT_PROJECT_NAME
        assert results['rootProjectDir'] == testProjectDir.canonicalPath
        assert results['requestedTasks'] == task
        assert results['gradleVersion'] == testGradleVersion.gradleVersion.version
        assert results['gradleHomeDir'] != null
        assert results['buildFailed'] == hasFailure
        assert results['buildScanUri'] == (hasBuildScan ? "${mockScansServer.address}s/${PUBLIC_BUILD_SCAN_ID}" : null)
        assert results['buildScanFailed'] == scanUploadFailed
    }

    private File getBuildResultFile() {
        def buildResultsDir = new File(testProjectDir, '.build-results')
        assert buildResultsDir.directory
        assert buildResultsDir.listFiles().size() == 1
        def resultsFile = buildResultsDir.listFiles()[0]
        assert resultsFile.name.startsWith('github-step-id')
        assert resultsFile.text.count('rootProjectName') == 1
        return resultsFile
    }
}
