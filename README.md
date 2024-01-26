# Execute Gradle builds in GitHub Actions workflows

This GitHub Action can be used to configure Gradle and optionally execute a Gradle build on any platform supported by GitHub Actions.

Note that as of `v3` this action has been superceded by `gradle/actions/setup-gradle`.
Any workflow that uses `gradle/gradle-build-action@v3` will transparently delegate to `gradle/actions/setup-gradle@v3`.

See the [`setup-gradle documentation](https://github.com/gradle/actions/tree/main/setup-gradle) for more details. 
