# Execute Gradle builds in GitHub Actions workflows

This GitHub Action can be used to execute a Gradle build on any platform supported by GitHub Actions.

## Usage

The following workflow will run `./gradlew build` using the wrapper from the repository on ubuntu, macos and windows. The only prerequisite is to have Java installed: you define the version of Java you need to run the build using the `actions/setup-java` action.

```yaml
# .github/workflows/gradle-build-pr.yml
name: Run Gradle on PRs
on: pull_request
jobs:
  gradle:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-java@v1
      with:
        java-version: 11
    - uses: gradle/gradle-build-action@v1
      with:
        arguments: build
```

## Gradle arguments

The `arguments` input can used to pass arbitrary arguments to the `gradle` command line.

Here are some valid examples:
```yaml
arguments: build
arguments: check --scan
arguments: some arbitrary tasks
arguments: build -PgradleProperty=foo
arguments: build -DsystemProperty=bar
....
```

See `gradle --help` for more information.

If you need to pass environment variables, simply use the GitHub Actions workflow syntax:

```yaml
- uses: gradle/gradle-build-action@v1
  env:
    CI: true
```

## Run a build from a different directory

```yaml
- uses: gradle/gradle-build-action@v1
  with:
    build-root-directory: some/subdirectory
```

## Use a specific `gradle` executable

```yaml
 - uses: gradle/gradle-build-action@v1
   with:
     gradle-executable: path/to/gradle
```

## Use a Gradle wrapper from a different directory
 
```yaml
 - uses: gradle/gradle-build-action@v1
   with:
     gradle-executable: path/to/gradlew
 ```

## Setup and use a declared Gradle version

```yaml
 - uses: gradle/gradle-build-action@v1
   with:
     gradle-version: 6.5
```

`gradle-version` can be set to any valid Gradle version.

Moreover, you can use the following aliases:

| Alias | Selects |
| --- |---|
| `wrapper`           | The Gradle wrapper's version (default, useful for matrix builds) |
| `current`           | The current [stable release](https://gradle.org/install/) |
| `release-candidate` | The current [release candidate](https://gradle.org/release-candidate/) if any, otherwise fallback to `current` |
| `nightly`           | The latest [nightly](https://gradle.org/nightly/), fails if none. |
| `release-nightly`   | The latest [release nightly](https://gradle.org/release-nightly/), fails if none.      |

This can be handy to, for example, automatically test your build with the next Gradle version once a release candidate is out:

```yaml
# .github/workflows/test-gradle-rc.yml
name: Test latest Gradle RC
on:
  schedule:
    - cron: 0 0 * * * # daily
jobs:
  gradle-rc:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-java@v1
      with:
        java-version: 11
    - uses: gradle/gradle-build-action@v1
      with:
        gradle-version: release-candidate
        arguments: build --dry-run # just test build configuration
```

## Caching

This action provides 3 levels of caching to help speed up your GitHub Actions:

- `distributions` caches any distributions downloaded to satisfy a `gradle-version` parameter ;
- `gradle-user-home` caches downloaded dependencies, wrapper distributions, and other stuff from the Gradle User home directory ;
- `project-dot-gradle` caches stored [configuration-cache](https://docs.gradle.org/nightly/userguide/configuration_cache.html) state, saving time configuring the build.

Each of these are enabled by default. To save caching space, you can disable any of them as follows:

```yaml
distributions-cache-enabled: true
gradle-user-home-cache-enabled: true
project-dot-gradle-cache-enabled: true
```

The distributions cache uses a cache key that is unique to the downloaded distribution. This will not change over time.

The `gradle-user-home` and `project-dot-gradle` caches compute a cache key based on the current commit and the Gradle invocation.
As such, these are likely to change on each subsequent run of GitHub actions, allowing the most recent state to always be available in the GitHub actions cache.

By default, this action aims to cache any and all reusable state that may be speed up a subsequent build invocation. 

At this time it is not possible to fine-tune this caching. If you have a legitimate use case for fine-grained caching or restricting which files are cached, please raise an issue.

### Using the caches read-only

Cache storage space is limited for GitHub actions, and writing new cache entries can trigger the deletion of exising entries.
In some circumstances, it makes sense for a Gradle invocation to read any existing cache entries but not to write changes back.
For example, you may want to write cache entries for builds on your `main` branch, but not for any PR build invocations.

You can enable read-only caching for any of the caches asfollows:

```yaml
distributions-cache-enabled: read-only
gradle-user-home-cache-enabled: read-only
project-dot-gradle-cache-enabled: read-only
```

## Build scans

If your build publishes a [build scan](https://gradle.com/build-scans/) the `gradle-build-action` action will emit the link to the published build scan as an output named `build-scan-url`.

You can then use that link in subsequent actions of your workflow.

For example:

```yaml
# .github/workflows/gradle-build-pr.yml
name: Run Gradle on PRs
on: pull_request
jobs:
  gradle:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-java@v1
      with:
        java-version: 11
    - uses: gradle/gradle-build-action@v1
      with:
        arguments: build
      id: gradle
    - name: "Comment build scan url"
      uses: actions/github-script@v3
      if: github.event_name == 'pull_request' && failure()
      with:
        github-token: ${{secrets.GITHUB_TOKEN}}
        script: |
          github.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: '❌ ${{ github.workflow }} failed: ${{ steps.gradle.outputs.build-scan-url }}'
          })
```
