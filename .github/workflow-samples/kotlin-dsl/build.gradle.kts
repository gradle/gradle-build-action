plugins {
    `java-library`
}

repositories {
    mavenCentral()
}

dependencies {
    api("org.apache.commons:commons-math3:3.6.1")
    implementation("com.google.guava:guava:31.1-jre")

    testImplementation("org.junit.jupiter:junit-jupiter:5.9.1")
}

tasks.test {
    useJUnitPlatform()
}

tasks.named("test").configure {
    // Echo an output value so we can detect configuration-cache usage
    println("::set-output name=task_configured::yes")

    doLast {
        if (System.getProperties().containsKey("verifyCachedBuild")) {
            throw RuntimeException("Build was not cached: unexpected execution of test task")
        }
    }
}
