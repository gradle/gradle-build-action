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
