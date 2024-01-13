buildscript {
  def getInputParam = { String name ->
      def envVarName = name.toUpperCase().replace('.', '_').replace('-', '_')
      return System.getProperty(name) ?: System.getenv(envVarName)
  }
  def pluginRepositoryUrl = getInputParam('gradle.plugin-repository.url') ?: 'https://plugins.gradle.org/m2'

  repositories {
    maven { url pluginRepositoryUrl }
  }
  dependencies {
    classpath "org.gradle:github-dependency-graph-gradle-plugin:1.1.1"
  }
}
apply plugin: org.gradle.github.GitHubDependencyGraphPlugin
