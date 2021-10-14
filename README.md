# Execute Gradle builds in GitHub Actions workflows

This GitHub Action can be used to execute a Gradle build on any platform supported by GitHub Actions.

**Note:** The following documentation is for `gradle/gradle-build-action@v2`, currently in Beta release.
You can view the documentation for the latest stable release (v1.5.1) [on the GitHub Marketplace](https://github.com/marketplace/actions/gradle-build-action?version=v1.5.1). 

## Usage

The following workflow will run `./gradlew build` on ubuntu, macos and windows. 
The only prerequisite is to have Java installed: you define the version of Java you need to run the build using the `actions/setup-java` action.

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
    - uses: gradle/gradle-build-action@v2
      with:
        arguments: build
```

It is possible to configure multiple Gradle executions to run sequentially in the same job. 
Each invocation will start its run with the filesystem state remaining from the previous execution.

```yaml
- uses: gradle/gradle-build-action@v2
  with:
    arguments: assemble
- uses: gradle/gradle-build-action@v2
  with:
    arguments: check
```

## Gradle Execution

### Command-line arguments

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

If you need to pass environment variables, use the GitHub Actions workflow syntax:

```yaml
- uses: gradle/gradle-build-action@v2
  env:
    CI: true
  with:
    arguments: build
```

### Gradle build located in a subdirectory

By default, the action will execute Gradle in the root directory of your project. 
Use the `build-root-directory` input to target a Gradle build in a subdirectory.

```yaml
- uses: gradle/gradle-build-action@v2
  with:
    build-root-directory: some/subdirectory
```

### Using a specific Gradle executable

The action will first look for a Gradle wrapper script in the root directory of your project. 
If not found, `gradle` will be executed from the PATH.
Use the `gradle-executable` input to execute using a specific Gradle installation.

```yaml
 - uses: gradle/gradle-build-action@v2
   with:
     gradle-executable: /path/to/installed/gradle
```

This mechanism can also be used to target a Gradle wrapper script that is located in a non-default location.

### Download, install and use a specific Gradle version

The `gradle-build-action` is able to download and install a specific Gradle version to execute.

```yaml
 - uses: gradle/gradle-build-action@v2
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

This can be handy to automatically verify your build works with the latest release candidate of Gradle:

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
    - uses: gradle/gradle-build-action@v2
      with:
        gradle-version: release-candidate
        arguments: build --dry-run # just test build configuration
```

## Caching

By default, this action aims to cache any and all reusable state that may be speed up a subsequent build invocation. 

The state that is cached includes:
- Any distributions downloaded to satisfy a `gradle-version` parameter ;
- A subset of the Gradle User Home directory, including downloaded dependencies, wrapper distributions, and the local build cache ;
- Any [configuration-cache](https://docs.gradle.org/nightly/userguide/configuration_cache.html) data stored in the project `.gradle` directory.

To reduce the space required for caching, this action makes a best effort to reduce duplication in cache entries.

Caching is enabled by default. You can disable caching for the action as follows:
```yaml
cache-disabled: true
```

At this time it is not possible to fine-tune the caching performed by this action. 
If you have a legitimate use case for fine-grained caching or restricting which files are cached, please raise an issue.

### Cache keys

For cached distributions, the cache key is unique to the downloaded distribution. This will not change over time.

The state of the Gradle User Home and configuration-cache are highly dependent on the Gradle execution, so the cache key is composed of the current commit hash and the GitHub actions job id.
As such, the cache key is likely to change on each subsequent run of GitHub actions. 
This allows the most recent state to always be available in the GitHub actions cache.

To reduce duplication between cache entries, certain artifacts are cached independently based on their identity.
Artifacts that are cached independently include downloaded dependencies, downloaded wrapper distributions and generated Gradle API jars.
For example, this means that all jobs executing a particular version of the Gradle wrapper will share common entries for wrapper distributions and for generated Gradle API jars.

### Using the caches read-only

Cache storage space is limited for GitHub actions, and writing new cache entries can trigger the deletion of exising entries.
In some circumstances, it makes sense for a Gradle invocation to read any existing cache entries but not to write changes back.
For example, you may want to write cache entries for builds on your `main` branch, but not for any PR build invocations.

You can enable read-only caching for any of the caches as follows:

```yaml
cache-read-only: true
```

### Cache debugging

It is possible to enable additional debug logging for cache operations. You do via the `CACHE_DEBUG_ENABLED` environment variable:

```yaml
env:
  CACHE_DEBUG_ENABLED: true
```

## Build scans

If your build publishes a [build scan](https://gradle.com/build-scans/) the `gradle-build-action` action will:
- Add a notice with the link to the GitHub Actions user interface
- Emit the link to the published build scan as an output named `build-scan-url`.

You can then use that link in subsequent actions of your workflow. For example:

```yaml
# .github/workflows/gradle-build-pr.yml
name: Run Gradle on PRs
on: pull_request
jobs:
  gradle:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-java@v1
      with:
        java-version: 11
    - uses: gradle/gradle-build-action@v2
      id: gradle
      with:
        arguments: build
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
