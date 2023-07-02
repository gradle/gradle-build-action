buildscript {
  dependencies {
    classpath files("github-dependency-graph-gradle-plugin-0.0.3.jar")
  }
}
apply plugin: org.gradle.github.GitHubDependencyGraphPlugin
