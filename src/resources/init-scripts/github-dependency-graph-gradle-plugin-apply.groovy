buildscript {
  repositories {
    gradlePluginPortal()
  }
  dependencies {
    classpath "org.gradle:github-dependency-graph-gradle-plugin:0.0.3"
  }
}
apply plugin: org.gradle.github.GitHubDependencyGraphPlugin
