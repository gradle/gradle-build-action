package com.gradle.gradlebuildaction

import org.gradle.testkit.runner.BuildResult
import org.gradle.util.GradleVersion

import static org.junit.Assume.assumeTrue

class TestGradleEnterpriseInjection  extends BaseInitScriptTest {
    static final List<TestGradleVersion> CCUD_COMPATIBLE_VERSIONS = ALL_VERSIONS - [GRADLE_3_X]

    def initScript = 'gradle-build-action.inject-gradle-enterprise.init.gradle'

    private static final GradleVersion GRADLE_6 = GradleVersion.version('6.0')

    def "does not apply GE plugins when not requested"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def result = run([], initScript, testGradleVersion.gradleVersion)

        then:
        outputMissesGePluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "does not override GE plugin when already defined in project"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginApplication(testGradleVersion.gradleVersion)

        when:
        def result = run(testGradleVersion, testConfig())

        then:
        outputMissesGePluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "applies GE plugin via init script when not defined in project"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def result = run(testGradleVersion, testConfig())

        then:
        outputContainsGePluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "applies GE and CCUD plugins via init script when not defined in project"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def result = run(testGradleVersion, testConfig().withCCUDPlugin())

        then:
        outputContainsGePluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << CCUD_COMPATIBLE_VERSIONS
    }

    def "applies CCUD plugin via init script where GE plugin already applied"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginApplication(testGradleVersion.gradleVersion)

        when:
        def result = run(testGradleVersion, testConfig().withCCUDPlugin())

        then:
        outputMissesGePluginApplicationViaInitScript(result)
        outputContainsCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << CCUD_COMPATIBLE_VERSIONS
    }

    def "does not override CCUD plugin when already defined in project"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginAndCcudPluginApplication(testGradleVersion.gradleVersion)

        when:
        def result = run(testGradleVersion, testConfig().withCCUDPlugin())

        then:
        outputMissesGePluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << CCUD_COMPATIBLE_VERSIONS
    }

    def "ignores GE URL and allowUntrustedServer when GE plugin is not applied by the init script"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginApplication(testGradleVersion.gradleVersion)

        when:
        def config = testConfig().withServer(URI.create('https://ge-server.invalid'))
        def result = run(testGradleVersion, config)

        then:
        outputMissesGePluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "configures GE URL and allowUntrustedServer when GE plugin is applied by the init script"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def config = testConfig().withServer(mockScansServer.address)
        def result = run(testGradleVersion, config)

        then:
        outputContainsGePluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsGeConnectionInfo(result, mockScansServer.address.toString(), true)
        outputMissesCcudPluginApplicationViaInitScript(result)
        outputContainsPluginRepositoryInfo(result, 'https://plugins.gradle.org/m2')

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "enforces GE URL and allowUntrustedServer in project if enforce url parameter is enabled"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginApplication(testGradleVersion.gradleVersion, URI.create('https://ge-server.invalid'))

        when:
        def config = testConfig().withServer(mockScansServer.address, true)
        def result = run(testGradleVersion, config)

        then:
        outputMissesGePluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputEnforcesGeUrl(result, mockScansServer.address.toString(), true)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "can configure alternative repository for plugins when GE plugin is applied by the init script"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def config = testConfig().withPluginRepository(new URI('https://plugins.grdev.net/m2'))
        def result = run(testGradleVersion, config)

        then:
        outputContainsGePluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsGeConnectionInfo(result, mockScansServer.address.toString(), true)
        outputMissesCcudPluginApplicationViaInitScript(result)
        outputContainsPluginRepositoryInfo(result, 'https://plugins.grdev.net/m2')

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "stops gracefully when requested CCUD plugin version is <1.7"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def config = testConfig().withCCUDPlugin("1.6.6")
        def result = run(testGradleVersion, config)

        then:
        outputMissesGePluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)
        result.output.contains('Common Custom User Data Gradle plugin must be at least 1.7. Configured version is 1.6.6.')

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "can configure GE via CCUD system property overrides when CCUD plugin is inject via init script"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def config = testConfig().withCCUDPlugin().withServer(URI.create('https://ge-server.invalid'))
        def result = run(testGradleVersion, config, ["help", "-Dgradle.enterprise.url=${mockScansServer.address}".toString()])

        then:
        outputContainsGePluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << CCUD_COMPATIBLE_VERSIONS
    }

    def "init script is configuration cache compatible"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def config = testConfig().withCCUDPlugin()
        def result = run(testGradleVersion, config, ["help", "--configuration-cache"])

        then:
        outputContainsGePluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        when:
        result = run(testGradleVersion, config, ["help", "--configuration-cache"])

        then:
        outputMissesGePluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << CONFIGURATION_CACHE_VERSIONS
    }

    void outputContainsBuildScanUrl(BuildResult result) {
        def message = "Publishing build scan...\n${mockScansServer.address}s/$PUBLIC_BUILD_SCAN_ID"
        assert result.output.contains(message)
        assert 1 == result.output.count(message)
    }

    void outputContainsGePluginApplicationViaInitScript(BuildResult result, GradleVersion gradleVersion) {
        def pluginApplicationLogMsgGradle4And5 = "Applying com.gradle.scan.plugin.BuildScanPlugin via init script"
        def pluginApplicationLogMsgGradle6AndHigher = "Applying com.gradle.enterprise.gradleplugin.GradleEnterprisePlugin via init script"
        if (gradleVersion < GRADLE_6) {
            assert result.output.contains(pluginApplicationLogMsgGradle4And5)
            assert 1 == result.output.count(pluginApplicationLogMsgGradle4And5)
            assert !result.output.contains(pluginApplicationLogMsgGradle6AndHigher)
        } else {
            assert result.output.contains(pluginApplicationLogMsgGradle6AndHigher)
            assert 1 == result.output.count(pluginApplicationLogMsgGradle6AndHigher)
            assert !result.output.contains(pluginApplicationLogMsgGradle4And5)
        }
    }

    void outputMissesGePluginApplicationViaInitScript(BuildResult result) {
        def pluginApplicationLogMsgGradle4And5 = "Applying com.gradle.scan.plugin.BuildScanPlugin via init script"
        def pluginApplicationLogMsgGradle6AndHigher = "Applying com.gradle.enterprise.gradleplugin.GradleEnterprisePlugin via init script"
        assert !result.output.contains(pluginApplicationLogMsgGradle4And5)
        assert !result.output.contains(pluginApplicationLogMsgGradle6AndHigher)
    }

    void outputContainsCcudPluginApplicationViaInitScript(BuildResult result) {
        def pluginApplicationLogMsg = "Applying com.gradle.CommonCustomUserDataGradlePlugin via init script"
        assert result.output.contains(pluginApplicationLogMsg)
        assert 1 == result.output.count(pluginApplicationLogMsg)
    }

    void outputMissesCcudPluginApplicationViaInitScript(BuildResult result) {
        def pluginApplicationLogMsg = "Applying com.gradle.CommonCustomUserDataGradlePlugin via init script"
        assert !result.output.contains(pluginApplicationLogMsg)
    }

    void outputContainsGeConnectionInfo(BuildResult result, String geUrl, boolean geAllowUntrustedServer) {
        def geConnectionInfo = "Connection to Gradle Enterprise: $geUrl, allowUntrustedServer: $geAllowUntrustedServer"
        assert result.output.contains(geConnectionInfo)
        assert 1 == result.output.count(geConnectionInfo)
    }

    void outputContainsPluginRepositoryInfo(BuildResult result, String gradlePluginRepositoryUrl) {
        def repositoryInfo = "Gradle Enterprise plugins resolution: ${gradlePluginRepositoryUrl}"
        assert result.output.contains(repositoryInfo)
        assert 1 == result.output.count(repositoryInfo)
    }

    void outputEnforcesGeUrl(BuildResult result, String geUrl, boolean geAllowUntrustedServer) {
        def enforceUrl = "Enforcing Gradle Enterprise: $geUrl, allowUntrustedServer: $geAllowUntrustedServer"
        assert result.output.contains(enforceUrl)
        assert 1 == result.output.count(enforceUrl)
    }

    private BuildResult run(TestGradleVersion testGradleVersion, TestConfig config, List<String> args = ["help"]) {
        if (testKitSupportsEnvVars(testGradleVersion.gradleVersion)) {
            return run(args, initScript, testGradleVersion.gradleVersion, [], config.envVars)
        } else {
            return run(args, initScript, testGradleVersion.gradleVersion, config.jvmArgs, [:])
        }
    }

    private boolean testKitSupportsEnvVars(GradleVersion gradleVersion) {
        // TestKit supports env vars for Gradle 3.5+, except on M1 Mac where only 6.9+ is supported
        def isM1Mac = System.getProperty("os.arch") == "aarch64"
        if (isM1Mac) {
            return gradleVersion >= GRADLE_6_X.gradleVersion
        } else {
            return gradleVersion >= GRADLE_3_X.gradleVersion
        }
    }

    private TestConfig testConfig() {
        new TestConfig()
    }

    class TestConfig {
        String serverUrl = mockScansServer.address.toString()
        boolean enforceUrl = false
        String ccudPluginVersion = null
        String pluginRepositoryUrl = null

        TestConfig withCCUDPlugin(String version = CCUD_PLUGIN_VERSION) {
            ccudPluginVersion = version
            return this
        }

        TestConfig withServer(URI url, boolean enforceUrl = false) {
            serverUrl = url.toASCIIString()
            this.enforceUrl = enforceUrl
            return this
        }

        TestConfig withPluginRepository(URI pluginRepositoryUrl) {
            this.pluginRepositoryUrl = pluginRepositoryUrl
            return this
        }

        def getEnvVars() {
            Map<String, String> envVars = [
                GRADLE_ENTERPRISE_INJECTION_ENABLED: "true",
                GRADLE_ENTERPRISE_URL: serverUrl,
                GRADLE_ENTERPRISE_ALLOW_UNTRUSTED_SERVER: "true",
                GRADLE_ENTERPRISE_PLUGIN_VERSION: GE_PLUGIN_VERSION,
                GRADLE_ENTERPRISE_BUILD_SCAN_UPLOAD_IN_BACKGROUND: "true" // Need to upload in background since our Mock server doesn't cope with foreground upload
            ]
            if (enforceUrl) envVars.put("GRADLE_ENTERPRISE_ENFORCE_URL", "true")
            if (ccudPluginVersion != null) envVars.put("GRADLE_ENTERPRISE_CCUD_PLUGIN_VERSION", ccudPluginVersion)
            if (pluginRepositoryUrl != null) envVars.put("GRADLE_ENTERPRISE_PLUGIN_REPOSITORY_URL", pluginRepositoryUrl)

            return envVars
        }

        def getJvmArgs() {
            List<String> jvmArgs = [
                "-Dgradle-enterprise.injection-enabled=true",
                "-Dgradle-enterprise.url=$serverUrl",
                "-Dgradle-enterprise.allow-untrusted-server=true",
                "-Dgradle-enterprise.plugin.version=$GE_PLUGIN_VERSION",
                "-Dgradle-enterprise.build-scan.upload-in-background=true"
            ]

            if (enforceUrl) jvmArgs.add("-Dgradle-enterprise.enforce-url=true")
            if (ccudPluginVersion != null) jvmArgs.add("-Dgradle-enterprise.ccud-plugin.version=$ccudPluginVersion")
            if (pluginRepositoryUrl != null) jvmArgs.add("-Dgradle-enterprise.plugin-repository.url=$pluginRepositoryUrl")

            return jvmArgs.collect { it.toString() } // Convert from GStrings
        }
    }
}
