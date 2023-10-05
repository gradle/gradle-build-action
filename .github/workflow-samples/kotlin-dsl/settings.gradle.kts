plugins {
    id("com.gradle.enterprise") version "3.15.1"
    id("com.gradle.common-custom-user-data-gradle-plugin") version "1.11.2"
}

gradleEnterprise {
    buildScan {
        termsOfServiceUrl = "https://gradle.com/terms-of-service"
        termsOfServiceAgree = "yes"
        publishAlways()
        isUploadInBackground = false
    }
}

rootProject.name = "kotlin-dsl"

