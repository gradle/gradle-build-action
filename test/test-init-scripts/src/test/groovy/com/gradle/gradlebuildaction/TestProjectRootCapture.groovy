package com.gradle.gradlebuildaction

import static org.junit.Assume.assumeTrue

class TestProjectRootCapture extends BaseInitScriptTest {
    def initScript = 'project-root-capture.init.gradle'

    def "captures project root on #testGradleVersion"() {
        assumeTrue testGradleVersion.isCompatibleWithCurrentJvm()

        when:
        run(['help'], initScript, testGradleVersion.gradleVersion)

        then:
        assertCapturesProjectRoot()

        where:
        testGradleVersion << CONFIGURATION_CACHE_VERSIONS
    }

    def "captures project root on #testGradleVersion when build fails"() {
        assumeTrue testGradleVersion.isCompatibleWithCurrentJvm()

        addFailingTaskToBuild()

        when:
        runAndFail(['expectFailure'], initScript, testGradleVersion.gradleVersion)

        then:
        assertCapturesProjectRoot()

        where:
        testGradleVersion << CONFIGURATION_CACHE_VERSIONS
    }

    def "captures project root on #testGradleVersion with --configuration-cache"() {
        assumeTrue testGradleVersion.isCompatibleWithCurrentJvm()

        when:
        run(['help', '--configuration-cache'], initScript, testGradleVersion.gradleVersion)

        then:
        assertCapturesProjectRoot()
        assert projectRootList.delete()

        when:
        run(['help', '--configuration-cache'], initScript, testGradleVersion.gradleVersion)

        then:
        assertCapturesProjectRoot()

        where:
        testGradleVersion << CONFIGURATION_CACHE_VERSIONS
    }

    def "has no effect on #testVersion"() {
        assumeTrue testVersion.isCompatibleWithCurrentJvm()

        when:
        run(['help'], initScript, testVersion.gradleVersion)

        then:
        assert !projectRootList.exists()

        where:
        testVersion << (ALL_VERSIONS - CONFIGURATION_CACHE_VERSIONS)
    }

    private void assertCapturesProjectRoot() {
        assert projectRootList.exists()
        assert new File(projectRootList.text.trim()).canonicalPath == testProjectDir.canonicalPath
    }

    private File getProjectRootList() {
        new File(testProjectDir, 'project-roots.txt')
    }
}
