package com.gradle.gradlebuildaction

import org.gradle.testkit.runner.BuildResult
import org.gradle.util.GradleVersion

import static org.junit.Assume.assumeTrue

class TestDevelocityInjection extends BaseInitScriptTest {
    static final List<TestGradleVersion> CCUD_COMPATIBLE_VERSIONS = ALL_VERSIONS - [GRADLE_3_X]

    def initScript = 'gradle-build-action.inject-develocity.init.gradle'

    private static final GradleVersion GRADLE_6 = GradleVersion.version('6.0')

    def "does not apply Develocity plugins when not requested"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def result = run([], initScript, testGradleVersion.gradleVersion)

        then:
        outputMissesDevelocityPluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "does not override Develocity plugin when already defined in project"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginApplication(testGradleVersion.gradleVersion)

        when:
        def result = run(testGradleVersion, testConfig())

        then:
        outputMissesDevelocityPluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "applies Develocity plugin via init script when not defined in project"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def result = run(testGradleVersion, testConfig())

        then:
        outputContainsDevelocityPluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "applies Develocity and CCUD plugins via init script when not defined in project"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def result = run(testGradleVersion, testConfig().withCCUDPlugin())

        then:
        outputContainsDevelocityPluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << CCUD_COMPATIBLE_VERSIONS
    }

    def "applies CCUD plugin via init script where Develocity plugin already applied"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginApplication(testGradleVersion.gradleVersion)

        when:
        def result = run(testGradleVersion, testConfig().withCCUDPlugin())

        then:
        outputMissesDevelocityPluginApplicationViaInitScript(result)
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
        outputMissesDevelocityPluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << CCUD_COMPATIBLE_VERSIONS
    }

    def "ignores Develocity URL and allowUntrustedServer when Develocity plugin is not applied by the init script"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginApplication(testGradleVersion.gradleVersion)

        when:
        def config = testConfig().withServer(URI.create('https://develocity-server.invalid'))
        def result = run(testGradleVersion, config)

        then:
        outputMissesDevelocityPluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "configures Develocity URL and allowUntrustedServer when Develocity plugin is applied by the init script"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def config = testConfig().withServer(mockScansServer.address)
        def result = run(testGradleVersion, config)

        then:
        outputContainsDevelocityPluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsDevelocityConnectionInfo(result, mockScansServer.address.toString(), true)
        outputMissesCcudPluginApplicationViaInitScript(result)
        outputContainsPluginRepositoryInfo(result, 'https://plugins.gradle.org/m2')

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "enforces Develocity URL and allowUntrustedServer in project if enforce url parameter is enabled"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        given:
        declareGePluginApplication(testGradleVersion.gradleVersion, URI.create('https://develocity-server.invalid'))

        when:
        def config = testConfig().withServer(mockScansServer.address, true)
        def result = run(testGradleVersion, config)

        then:
        outputMissesDevelocityPluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)

        and:
        outputEnforcesDevelocityUrl(result, mockScansServer.address.toString(), true)

        and:
        outputContainsBuildScanUrl(result)

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "can configure alternative repository for plugins when Develocity plugin is applied by the init script"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def config = testConfig().withPluginRepository(new URI('https://plugins.grdev.net/m2'))
        def result = run(testGradleVersion, config)

        then:
        outputContainsDevelocityPluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsDevelocityConnectionInfo(result, mockScansServer.address.toString(), true)
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
        outputMissesDevelocityPluginApplicationViaInitScript(result)
        outputMissesCcudPluginApplicationViaInitScript(result)
        result.output.contains('Common Custom User Data Gradle plugin must be at least 1.7. Configured version is 1.6.6.')

        where:
        testGradleVersion << ALL_VERSIONS
    }

    def "can configure Develocity via CCUD system property overrides when CCUD plugin is inject via init script"() {
        assumeTrue testGradleVersion.compatibleWithCurrentJvm

        when:
        def config = testConfig().withCCUDPlugin().withServer(URI.create('https://develocity-server.invalid'))
        def result = run(testGradleVersion, config, ["help", "-Dgradle.enterprise.url=${mockScansServer.address}".toString()])

        then:
        outputContainsDevelocityPluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
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
        outputContainsDevelocityPluginApplicationViaInitScript(result, testGradleVersion.gradleVersion)
        outputContainsCcudPluginApplicationViaInitScript(result)

        and:
        outputContainsBuildScanUrl(result)

        when:
        result = run(testGradleVersion, config, ["help", "--configuration-cache"])

        then:
        outputMissesDevelocityPluginApplicationViaInitScript(result)
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

    void outputContainsDevelocityPluginApplicationViaInitScript(BuildResult result, GradleVersion gradleVersion) {
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

    void outputMissesDevelocityPluginApplicationViaInitScript(BuildResult result) {
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

    void outputContainsDevelocityConnectionInfo(BuildResult result, String geUrl, boolean geAllowUntrustedServer) {
        def geConnectionInfo = "Connection to Develocity: $geUrl, allowUntrustedServer: $geAllowUntrustedServer"
        assert result.output.contains(geConnectionInfo)
        assert 1 == result.output.count(geConnectionInfo)
    }

    void outputContainsPluginRepositoryInfo(BuildResult result, String gradlePluginRepositoryUrl) {
        def repositoryInfo = "Develocity plugins resolution: ${gradlePluginRepositoryUrl}"
        assert result.output.contains(repositoryInfo)
        assert 1 == result.output.count(repositoryInfo)
    }

    void outputEnforcesDevelocityUrl(BuildResult result, String geUrl, boolean geAllowUntrustedServer) {
        def enforceUrl = "Enforcing Develocity: $geUrl, allowUntrustedServer: $geAllowUntrustedServer"
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
                DEVELOCITY_INJECTION_ENABLED: "true",
                DEVELOCITY_URL: serverUrl,
                DEVELOCITY_ALLOW_UNTRUSTED_SERVER: "true",
                DEVELOCITY_PLUGIN_VERSION: DEVELOCITY_PLUGIN_VERSION,
                DEVELOCITY_BUILD_SCAN_UPLOAD_IN_BACKGROUND: "true" // Need to upload in background since our Mock server doesn't cope with foreground upload
            ]
            if (enforceUrl) envVars.put("DEVELOCITY_ENFORCE_URL", "true")
            if (ccudPluginVersion != null) envVars.put("DEVELOCITY_CCUD_PLUGIN_VERSION", ccudPluginVersion)
            if (pluginRepositoryUrl != null) envVars.put("GRADLE_PLUGIN_REPOSITORY_URL", pluginRepositoryUrl)

            return envVars
        }

        def getJvmArgs() {
            List<String> jvmArgs = [
                "-Ddevelocity.injection-enabled=true",
                "-Ddevelocity.url=$serverUrl",
                "-Ddevelocity.allow-untrusted-server=true",
                "-Ddevelocity.plugin.version=$DEVELOCITY_PLUGIN_VERSION",
                "-Ddevelocity.build-scan.upload-in-background=true"
            ]

            if (enforceUrl) jvmArgs.add("-Ddevelocity.enforce-url=true")
            if (ccudPluginVersion != null) jvmArgs.add("-Ddevelocity.ccud-plugin.version=$ccudPluginVersion")
            if (pluginRepositoryUrl != null) jvmArgs.add("-Dgradle.plugin-repository.url=$pluginRepositoryUrl")

            return jvmArgs.collect { it.toString() } // Convert from GStrings
        }
    }
}
