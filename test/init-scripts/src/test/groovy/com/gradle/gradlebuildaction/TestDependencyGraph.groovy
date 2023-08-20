package com.gradle.gradlebuildaction

import static org.junit.Assume.assumeTrue

class TestDependencyGraph extends BaseInitScriptTest {
    def initScript = 'gradle-build-action.github-dependency-graph.init.gradle'

    static final List<TestGradleVersion> NO_DEPENDENCY_GRAPH_VERSIONS = [GRADLE_3_X, GRADLE_4_X]
    static final List<TestGradleVersion> DEPENDENCY_GRAPH_VERSIONS = ALL_VERSIONS - NO_DEPENDENCY_GRAPH_VERSIONS

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
        assert gitHubOutputFile.text == "dependency-graph-file=${reportFile.absolutePath}\n"

        where:
        testGradleVersion << [GRADLE_8_X]
    }

    def "produces dependency graph with configuration-cache on latest Gradle"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        run(['help', '--configuration-cache'], initScript, testGradleVersion.gradleVersion, [], envVars)

        then:
        assert reportFile.exists()

        where:
        // Dependency-graph plugin doesn't support config-cache for 8.0 of Gradle
        testGradleVersion << [GRADLE_8_X]
    }

    def "warns and produces no dependency graph when enabled for older Gradle versions"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def result = run(['help'], initScript, testGradleVersion.gradleVersion, [], envVars)

        then:
        assert !reportsDir.exists()
        assert result.output.contains("::warning::Dependency Graph is not supported")

        where:
        testGradleVersion << NO_DEPENDENCY_GRAPH_VERSIONS
    }

    def "constructs unique job correlator for each build invocation"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        def reportFile1 = new File(reportsDir, "CORRELATOR-1.json")
        def reportFile2 = new File(reportsDir, "CORRELATOR-2.json")

        buildFile << """
            task firstTask {
                doLast {
                    println "First"
                }
            }
            task secondTask {
                doLast {
                    println "Second"
                }
            }
        """

        when:
        run(['help'], initScript, testGradleVersion.gradleVersion, [], envVars)

        then:
        assert reportFile.exists()

        when:
        run(['first'], initScript, testGradleVersion.gradleVersion, [], envVars)

        then:
        assert reportFile.exists()
        assert reportFile1.exists()
        
        when:
        run(['second'], initScript, testGradleVersion.gradleVersion, [], envVars)

        then:
        assert reportFile.exists()
        assert reportFile1.exists()
        assert reportFile2.exists()
        
        where:
        testGradleVersion << DEPENDENCY_GRAPH_VERSIONS
    }

    def getEnvVars() {
        return [
            GITHUB_DEPENDENCY_GRAPH_ENABLED: "true",
            GITHUB_JOB_CORRELATOR: "CORRELATOR",
            GITHUB_JOB_ID: "1",
            GITHUB_REF: "main",
            GITHUB_SHA: "123456",
            GITHUB_WORKSPACE: testProjectDir.absolutePath,
            DEPENDENCY_GRAPH_REPORT_DIR: reportsDir.absolutePath,
            GITHUB_OUTPUT: gitHubOutputFile.absolutePath
        ]
    }

    def getReportsDir() {
        return new File(testProjectDir, 'build/reports/github-dependency-graph-snapshots')
    }

    def getReportFile() {
        return new File(reportsDir, "CORRELATOR.json")
    }

    def getGitHubOutputFile() {
        return new File(testProjectDir, "GITHUB_OUTPUT")
    }
}
