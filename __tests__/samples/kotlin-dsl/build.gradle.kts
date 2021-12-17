plugins {
    `java-library`
}

repositories {
    mavenCentral()
}

dependencies {
    api("org.apache.commons:commons-math3:3.6.1")
    implementation("com.google.guava:guava:30.1.1-jre")

    testImplementation("org.junit.jupiter:junit-jupiter:5.7.2")
}

tasks.test {
    useJUnitPlatform()
}

tasks.named("test").configure {
    // Use an environment variable to bypass config-cache checks
    if (System.getenv("VERIFY_CACHED_CONFIGURATION") != null) {
        throw RuntimeException("Configuration was not cached: unexpected configuration of test task")
    }
    doLast {
        if (System.getProperties().containsKey("verifyCachedBuild")) {
            throw RuntimeException("Build was not cached: unexpected execution of test task")
        }
    }
}
