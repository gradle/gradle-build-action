# Execute Gradle builds in GitHub Actions workflows

This GitHub Action can be used to configure Gradle and optionally execute a Gradle build on any platform supported by GitHub Actions.

## Use the action to setup Gradle

If you have an existing workflow invoking Gradle, you can add an initial "Setup Gradle" Step to benefit from caching, 
build-scan capture and other features of the gradle-build-action.

All subsequent Gradle invocations will benefit from this initial setup, via `init` scripts added to the Gradle User Home.

```yaml
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
    - uses: actions/setup-java@v2
      with:
        distribution: temurin
        java-version: 11
        
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v2
    
    - name: Execute Gradle build
      run: ./gradlew build
```

## Why use the `gradle-build-action`?

It is possible to directly invoke Gradle in your workflow, and the `actions/setup-java@v2` action provides a simple way to cache Gradle dependencies. 

However, the `gradle-build-action` offers a number of advantages over this approach:

- Easily [run the build with different versions of Gradle](#download-install-and-use-a-specific-gradle-version) using the `gradle-version` parameter. Gradle distributions are automatically downloaded and cached. 
- More sophisticated and more efficient caching of Gradle User Home between invocations, compared to `setup-java` and most custom configurations using `actions/cache`. [More details below](#caching).
- Detailed reporting of cache usage and cache configuration options allow you to [optimize the use of the GitHub actions cache](#optimizing-cache-effectiveness).
- [Automatic capture of build scan links](#build-scans) from the build, making these easier to locate for workflow run.

The `gradle-build-action` is designed to provide these benefits with minimal configuration. 
These features work both when Gradle is executed via the `gradle-build-action` and for any Gradle execution in subsequent steps.

When using `gradle-build-action` we recommend that you _not_ use `actions/cache` or `actions/setup-java@v2` to explicitly cache the Gradle User Home. Doing so may interfere with the caching provided by this action.

## Use a specific Gradle version

The `gradle-build-action` can download and install a specified Gradle version, adding this installed version to the PATH.
Downloaded Gradle versions are stored in the GitHub Actions cache, to avoid requiring downloading again later.

```yaml
 - uses: gradle/gradle-build-action@v2
   with:
     gradle-version: 6.5
```

The `gradle-version` parameter can be set to any valid Gradle version.

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
name: Test latest Gradle RC
on:
  schedule:
    - cron: 0 0 * * * # daily
jobs:
  gradle-rc:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-java@v2
      with:
        java-version: 11
    - uses: gradle/gradle-build-action@v2
      with:
        gradle-version: release-candidate
    - run: gradle build --dry-run # just test build configuration
```

## Gradle Execution

If the action is configured with an `arguments` input, then Gradle will execute a Gradle build with the arguments provided.

If no `arguments` are provided, the action will not execute Gradle, but will still cache Gradle state and configure build-scan capture for all subsequent Gradle executions.

```yaml
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
    - uses: actions/setup-java@v2
      with:
        java-version: 11
    
    - name: Setup and execute Gradle 'test' task
      uses: gradle/gradle-build-action@v2
      with:
        arguments: test
```

### Multiple Gradle executions in the same Job

It is possible to configure multiple Gradle executions to run sequentially in the same job. 
The initial Action step will perform the Gradle setup.

```yaml
- uses: gradle/gradle-build-action@v2
  with:
    arguments: assemble
- uses: gradle/gradle-build-action@v2
  with:
    arguments: check
```

### Gradle command-line arguments

The `arguments` input can used to pass arbitrary arguments to the `gradle` command line.
Arguments can be supplied in a single line, or as a multi-line input.

Here are some valid examples:
```yaml
arguments: build
arguments: check --scan
arguments: some arbitrary tasks
arguments: build -PgradleProperty=foo
arguments: |
    build
    --scan
    -PgradleProperty=foo
    -DsystemProperty=bar
```

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
    arguments: build
    build-root-directory: some/subdirectory
```

### Using a specific Gradle executable

The action will first look for a Gradle wrapper script in the root directory of your project. 
If not found, `gradle` will be executed from the PATH.
Use the `gradle-executable` input to execute using a specific Gradle installation.

```yaml
 - uses: gradle/gradle-build-action@v2
   with:
     arguments: build
     gradle-executable: /path/to/installed/gradle
```

This mechanism can also be used to target a Gradle wrapper script that is located in a non-default location.

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

### Cache keys

Distributions downloaded to satisfy a `gradle-version` parameter are stored outside of Gradle User Home and cached separately. The cache key is unique to the downloaded distribution and will not change over time.

The state of the Gradle User Home and configuration-cache are highly dependent on the Gradle execution, so the cache key is composed of the current commit hash and the GitHub actions job id.
As such, the cache key is likely to change on each subsequent run of GitHub actions. 
This allows the most recent state to always be available in the GitHub actions cache.

To reduce duplication between cache entries, certain artifacts are cached independently based on their identity.
Artifacts that are cached independently include downloaded dependencies, downloaded wrapper distributions and generated Gradle API jars.
For example, this means that all jobs executing a particular version of the Gradle wrapper will share common entries for wrapper distributions and for generated Gradle API jars.

### Using the caches read-only

In some circumstances, it makes sense for a Gradle invocation to read any existing cache entries but not to write changes back.
For example, you may want to write cache entries for builds on your `main` branch, but not for any PR build invocations.

You can enable read-only caching for any of the caches as follows:

```yaml
# Only write to the cache for builds on the 'main' branch.
# Builds on other branches will only read existing entries from the cache.
cache-read-only: ${{ github.ref != 'refs/heads/main' }}
```

### Gradle User Home cache tuning

As well as any wrapper distributions, the action will attempt to save and restore the `caches` and `notifications` directories from Gradle User Home.

The contents to be cached can be fine tuned by including and excluding certain paths with Gradle User Home.

```yaml
# Cache downloaded JDKs in addition to the default directories.
gradle-home-cache-includes: |
    caches
    notifications
    jdks
# Exclude the local build-cache from the directories cached.
gradle-home-cache-excludes: |
    caches/build-cache-1
```

You can specify any number of fixed paths or patterns to include or exclude. 
File pattern support is documented at https://docs.github.com/en/actions/learn-github-actions/workflow-syntax-for-github-actions#patterns-to-match-file-paths.

### Cache debugging and analysis

Gradle User Home state will be restored from the cache during the first `gradle-build-action` step for any workflow job. 
This state will be saved back to the cache at the end of the job, after all Gradle executions have completed.
A report of all cache entries restored and saved is printed to the action log when saving the cache entries. 
This report can provide valuable insignt into how much cache space is being used.

It is possible to enable additional debug logging for cache operations. You do via the `GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED` environment variable:

```yaml
env:
  GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED: true
```

Note that this setting will also prevent certain cache operations from running in parallel, further assisting with debugging.

### Optimizing cache effectiveness

Cache storage space for GitHub actions is limited, and writing new cache entries can trigger the deletion of exising entries.
Eviction of shared cache entries can reduce cache effectiveness, slowing down your `gradle-build-action` steps.

There are a number of actions you can take if your cache use is less effective due to entry eviction.

#### Only write to the cache from the default branch

GitHub cache entries are not shared between builds on different branches. This means that identical cache entries will be stored separately for different branches.
The exception to the is cache entries for the default (`master`/`main`) branch can be read by actions invoked for other branches.

An easy way to reduce cache usage when you run builds on many different branches is to only permit your default branch to write to the cache,
with all other branch builds using `cache-read-only`. See [Using the caches read-only](#using-the-caches-read-only) for more details.

Similarly, you could use `cache-read-only` for certain jobs in the workflow, and instead have these jobs reuse the cache content from upstream jobs.

#### Exclude content from Gradle User Home cache

Each build is different, and some builds produce more Gradle User Home content than others.
[Cache debugging ](#cache-debugging-and-analysis) can provide insight into which cache entries are the largest,
and you can selectively [exclude content using `gradle-home-cache-exclude`](#gradle-user-home-cache-tuning).

## Saving build outputs

By default, a GitHub Actions workflow using `gradle-build-action` will record the log output and any Build Scan links for your build,
but any output files generated by the build will not be saved.

To save selected files from your build execution, you can use the core [Upload-Artifact](https://github.com/actions/upload-artifact) action.
For example:

```yaml
jobs:   
  gradle:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout project sources
      uses: actions/checkout@v2
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v2
    - name: Run build with Gradle wrapper
      run: ./gradlew build --scan
    - name: Upload build reports
      uses: actions/upload-artifact@v3
      with:
        name: build-reports
        path: build/reports/
```

## Build scans

If your build publishes a [build scan](https://gradle.com/build-scans/) the `gradle-build-action` action will:
- Add a notice with the link to the GitHub Actions user interface
- For each step that executes Gradle, adds the link to the published build scan as a Step output named `build-scan-url`.

You can then use that link in subsequent actions of your workflow. For example:

```yaml
# .github/workflows/gradle-build-pr.yml
name: Run Gradle on PRs
on: pull_request
jobs:
  gradle:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout project sources
      uses: actions/checkout@v2
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v2
    - name: Run build with Gradle wrapper
      id: gradle
      run: ./gradlew build --scan
    - name: "Add build scan URL as PR comment"
      uses: actions/github-script@v5
      if: github.event_name == 'pull_request' && failure()
      with:
        github-token: ${{secrets.GITHUB_TOKEN}}
        script: |
          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: '❌ ${{ github.workflow }} failed: ${{ steps.gradle.outputs.build-scan-url }}'
          })
```
