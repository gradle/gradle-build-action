plugins {
    `java-library`
}

repositories {
    mavenCentral()
}

dependencies {
    api("org.apache.commons:commons-math3:3.6.1")
    implementation("com.google.guava:guava:31.1-jre")

    testImplementation("org.junit.jupiter:junit-jupiter:5.9.2")
}

tasks.test {
    useJUnitPlatform()
}

tasks.named("test").configure {
    // Write marker file so we can detect if task was configured
    file("task-configured.txt").writeText("true")

    doLast {
        if (System.getProperties().containsKey("verifyCachedBuild")) {
            throw RuntimeException("Build was not cached: unexpected execution of test task")
        }
    }
}
