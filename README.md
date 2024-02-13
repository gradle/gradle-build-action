> [!IMPORTANT]
> As of `v3` this action has been superceded by `gradle/actions/setup-gradle`.
> Any workflow that uses `gradle/gradle-build-action@v3` will transparently delegate to `gradle/actions/setup-gradle@v3`.
>
> Users are encouraged to update their workflows, replacing:
> ```
> uses: gradle/gradle-build-action@v3
> ```
>
> with
> ```
> uses: gradle/actions/setup-gradle@v3
> ```
>
> See the [setup-gradle documentation](https://github.com/gradle/actions/tree/main/setup-gradle) for up-to-date documentation for `gradle/actions/setup-gradle`. 

# Execute Gradle builds in GitHub Actions workflows

This GitHub Action can be used to configure Gradle and optionally execute a Gradle build on any platform supported by GitHub Actions.

## Example usage

```yaml
name: Build

on: [ push ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout sources
      uses: actions/checkout@v4
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v3
    - name: Build with Gradle
      run: ./gradlew build
```

As of `v3`, the `gradle/gradle-build-action` action delegates to `gradle/actions/setup-gradle` with the same version.
Configuration and usage of these actions is identical for releases with the same version number.

See the [full setup-gradle documentation](https://github.com/gradle/actions/tree/main/setup-gradle) for more advanced usage scenarios. 
