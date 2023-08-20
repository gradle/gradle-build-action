buildscript {
  repositories {
    maven { url "https://plugins.gradle.org/m2/" }
  }
  dependencies {
    classpath "org.gradle:github-dependency-graph-gradle-plugin:0.2.0"
  }
}
apply plugin: org.gradle.github.GitHubDependencyGraphPlugin
