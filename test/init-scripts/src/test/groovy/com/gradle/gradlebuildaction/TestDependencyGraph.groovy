package com.gradle.gradlebuildaction

import static org.junit.Assume.assumeTrue

class TestDependencyGraph extends BaseInitScriptTest {
    def initScript = 'github-dependency-graph.init.gradle'


    def "does not produce dependency graph when not enabled"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        run(['help'], initScript, testGradleVersion.gradleVersion)

        then:
        assert !reportsDir.exists()

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "produces dependency graph when enabled"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        run(['help'], initScript, testGradleVersion.gradleVersion, [], envVars)

        then:
        assert reportFile.exists()

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "warns and does not overwrite existing report file"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        reportsDir.mkdirs()
        reportFile << "DUMMY CONTENT"
        def result = run(['help'], initScript, testGradleVersion.gradleVersion, [], envVars)

        then:
        assert reportFile.text == "DUMMY CONTENT"
        assert result.output.contains("::warning::No dependency report generated for step")

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def getEnvVars() {
        return [
            GITHUB_DEPENDENCY_GRAPH_ENABLED: "true",
            GITHUB_DEPENDENCY_GRAPH_JOB_CORRELATOR: "CORRELATOR",
            GITHUB_DEPENDENCY_GRAPH_JOB_ID: "1",
            GITHUB_DEPENDENCY_GRAPH_REPORT_DIR: reportsDir.absolutePath,
            GITHUB_REF: "main",
            GITHUB_SHA: "123456",
            GITHUB_WORKSPACE: testProjectDir.absolutePath
        ]
    }

    def getReportsDir() {
        return new File(testProjectDir, 'build/reports/github-dependency-graph-snapshots')
    }

    def getReportFile() {
        return new File(reportsDir, "CORRELATOR.json")
    }
}
