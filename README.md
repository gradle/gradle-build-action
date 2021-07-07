# Execute Gradle commands in GitHub Actions workflows

This GitHub Action can be used to run arbitrary Gradle commands on any platform supported by GitHub Actions.

You might also be interested by the related [Gradle Plugin](https://github.com/eskatos/gradle-github-actions-plugin) that allows your build to easily get GitHub Actions environment and tag Gradle Build Scans accordingly.

## Usage

The following workflow will run `./gradlew build` using the wrapper from the repository on ubuntu, macos and windows. The only prerequisite is to have Java installed, you can define the version you need to run the build using the `actions/setup-java` action.

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
    - uses: eskatos/gradle-command-action@v1
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
- uses: eskatos/gradle-command-action@v1
  env:
    CI: true
```

## Run a build from a different directory

```yaml
- uses: eskatos/gradle-command-action@v1
  with:
    build-root-directory: some/subdirectory
```

## Use a specific `gradle` executable

```yaml
 - uses: eskatos/gradle-command-action@v1
   with:
     gradle-executable: path/to/gradle
```

## Use a Gradle wrapper from a different directory
 
```yaml
 - uses: eskatos/gradle-command-action@v1
   with:
     gradle-executable: path/to/gradlew
 ```

 NOTE: The `wrapper-directory` input has been deprecated. Use `gradle-executable` instead.

## Setup and use a declared Gradle version

```yaml
 - uses: eskatos/gradle-command-action@v1
   with:
     gradle-version: 6.5
```

`gradle-version` can be set to any valid Gradle version.

Moreover, you can use the following aliases:

| Alias | Selects |
| --- |---|
| `wrapper`      | The Gradle wrapper's version (default, useful for matrix builds) |
| `current`      | The current [stable release](https://gradle.org/install/) |
| `rc`      | The current [release candidate](https://gradle.org/release-candidate/) if any, otherwise fallback to `current` |
| `nightly` | The latest [nightly](https://gradle.org/nightly/), fails if none. |
| `release-nightly` | The latest [release nightly](https://gradle.org/release-nightly/), fails if none.      |

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
    - uses: eskatos/gradle-command-action@v1
      with:
        gradle-version: rc
        arguments: build --dry-run # just test build configuration
```

## Caching

This action provides 3 levels of caching to help speed up your GitHub Actions:

- `distributions` caches any downloaded Gradle zips, including any downloaded [wrapper](https://docs.gradle.org/current/userguide/gradle_wrapper.html) versions, saving time downloading Gradle distributions ;
- `dependencies` caches the [dependencies](https://docs.gradle.org/current/userguide/dependency_resolution.html#sub:cache_copy), saving time downloading dependencies ;
- `configuration` caches the [build configuration](https://docs.gradle.org/nightly/userguide/configuration_cache.html), saving time configuring the build.

Only the first one, caching downloaded distributions, is enabled by default.
Future versions of this action will enable all caching by default.

You can control which level is enabled as follows:

```yaml
distributions-cache-enabled: true
dependencies-cache-enabled: true
configuration-cache-enabled: true
```

NOTE: The `wrapper-cache-enabled` flag has been deprecated, replaced by `distributions-cache-enabled` which enables caching for all downloaded distributions, including Gradle wrapper downloads.

The distributions cache is simple and can't be configured further.

The dependencies and configuration cache will compute a cache key in a best effort manner.
Keep reading to learn how to better control how they work.

### Configuring the dependencies and configuration caches

Both the dependencies and configuration caches use the same default configuration:

They use the following inputs to calculate the cache key:

```text
**/*.gradle
**/*.gradle.kts
**/gradle.properties
gradle/**
```

This is a good enough approximation.
They restore cached state even if there isn't an exact match.

If the defaults don't suit your needs you can override them with the following inputs:

```yaml
dependencies-cache-key: |
  **/gradle.properties
  gradle/dependency-locks/**
dependencies-cache-exact: true
configuration-cache-key: |
  **/gradle.properties
  gradle/dependency-locks/**
configuration-cache-exact: true
```

Coming up with a good cache key isn't trivial and depends on your build.
The above example isn't realistic.
Stick to the defaults unless you know what you are doing.

If you happen to use Gradle [dependency locking](https://docs.gradle.org/current/userguide/dependency_locking.html) you can make the dependencies cache more precise with the following configuration:

```yaml
dependencies-cache-enabled: true
dependencies-cache-key: gradle/dependency-locks/**
dependencies-cache-exact: true
```

## Build scans

If your build publishes a [build scan](https://gradle.com/build-scans/) the `gradle-command-action` action will emit the link to the published build scan as an output named `build-scan-url`.

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
    - uses: eskatos/gradle-command-action@v1
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
