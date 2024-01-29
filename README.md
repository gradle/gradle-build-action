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
> See the [setup-gradle documentation](https://github.com/gradle/actions/tree/main/setup-gradle) for up-to-date documentation for `gradle/actons/setup-gradle`. 

# Execute Gradle builds in GitHub Actions workflows

This GitHub Action can be used to configure Gradle and optionally execute a Gradle build on any platform supported by GitHub Actions.

## Why use the `gradle-build-action`?

It is possible to directly invoke Gradle in your workflow, and the `actions/setup-java@v4` action provides a simple way to cache Gradle dependencies. 

However, the `gradle-build-action` offers a number of advantages over this approach:

- Easily [configure your workflow to use a specific version of Gradle](#choose-a-specific-gradle-version) using the `gradle-version` parameter. Gradle distributions are automatically downloaded and cached. 
- More sophisticated and more efficient caching of Gradle User Home between invocations, compared to `setup-java` and most custom configurations using `actions/cache`. [More details below](#caching-build-state-between-jobs).
- Detailed reporting of cache usage and cache configuration options allow you to [optimize the use of the GitHub actions cache](#optimizing-cache-effectiveness).
- [Generate and Submit a GitHub Dependency Graph](#github-dependency-graph-support) for your project, enabling Dependabot security alerts.
- [Automatic capture of Build Scan® links](#build-reporting) from the build, making these easier to locate for workflow run.

The `gradle-build-action` is designed to provide these benefits with minimal configuration. 
These features work both when Gradle is executed via the `gradle-build-action` and for any Gradle execution in subsequent steps.

## Use the action to setup Gradle

The recommended way to use the `gradle-build-action` is in an initial "Setup Gradle" step, with subsequent steps invoking Gradle directly with a `run` step. This makes the action minimally invasive, and allows a workflow to configure and execute a Gradle execution in any way.

The `gradle-build-action` works by configuring environment variables and by adding a set of Gradle init-scripts to the Gradle User Home. These will apply to all Gradle executions on the runner, no matter how Gradle is invoked. 
This means that if you have an existing workflow that executes Gradle with a `run` step, you can add an initial "Setup Gradle" Step to benefit from caching, build-scan capture and other features of the gradle-build-action.


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
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        distribution: temurin
        java-version: 11
        
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v2
    
    - name: Execute Gradle build
      run: ./gradlew build
```

## Choose a specific Gradle version

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

The actual Gradle version used is available as an action output: `gradle-version`.

```yaml
name: Test latest Gradle RC
on:
  schedule:
    - cron: 0 0 * * * # daily
jobs:
  gradle-rc:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        distribution: temurin
        java-version: 11
    - uses: gradle/gradle-build-action@v2
      id: setup-gradle
      with:
        gradle-version: release-candidate
    - run: gradle build --dry-run # just test build configuration
    - run: echo "The release-candidate version was ${{ steps.setup-gradle.outputs.gradle-version }}"
```

## Caching build state between Jobs

The `gradle-build-action` will use the GitHub Actions cache to save and restore reusable state that may be speed up a subsequent build invocation. This includes most content that is downloaded from the internet as part of a build, as well as expensive to create content like compiled build scripts, transformed Jar files, etc.

The state that is cached includes:
- Any distributions downloaded to satisfy a `gradle-version` parameter ;
- A subset of the Gradle User Home directory, including downloaded dependencies, wrapper distributions, and the local build cache ;

To reduce the space required for caching, this action makes a best effort to reduce duplication in cache entries.

State will be restored from the cache during the first `gradle-build-action` step for any workflow job, and cache entries will be written back to the cache at the end of the job, after all Gradle executions have completed.

### Disabling caching

Caching is enabled by default. You can disable caching for the action as follows:
```yaml
cache-disabled: true
```

### Using the cache read-only

By default, the `gradle-build-action` will only write to the cache from Jobs on the default (`main`/`master`) branch.
Jobs on other branches will read entries from the cache but will not write updated entries. 
See [Optimizing cache effectiveness](#select-which-branches-should-write-to-the-cache) for a more detailed explanation.

In some circumstances it makes sense to change this default, and to configure a workflow Job to read existing cache entries but not to write changes back.

You can configure read-only caching for the `gradle-build-action` as follows:

```yaml
cache-read-only: true
```

You can also configure read-only caching only for certain branches:

```yaml
# Only write to the cache for builds on the 'main' and 'release' branches. (Default is 'main' only.)
# Builds on other branches will only read existing entries from the cache.
cache-read-only: ${{ github.ref != 'refs/heads/main' && github.ref != 'refs/heads/release' }}
```

### Using the cache write-only

In certain circumstances it may be desirable to start with a clean Gradle User Home state, but to save that state at the end of a workflow Job:

```yaml
cache-write-only: true
```

### Overwriting an existing Gradle User Home

When the action detects that the Gradle User Home caches directory already exists (`~/.gradle/caches`), then by default it will not overwrite the existing content of this directory.
This can occur when a prior action initializes this directory, or when using a self-hosted runner that retains this directory between uses.

In this case the Job Summary will display a message like: 
> Caching for gradle-build-action was disabled due to pre-existing Gradle User Home

If you want override the default and have the `gradle-build-action` caches overwrite existing content in the Gradle User Home, you can set the `cache-overwrite-existing` parameter to 'true':

```yaml
cache-overwrite-existing: true
```

### Saving configuration-cache data

When Gradle is executed with the [configuration-cache](https://docs.gradle.org/current/userguide/configuration_cache.html) enabled, the configuration-cache data is stored
in the project directory, at `<project-dir>/.gradle/configuration-cache`. Due to the way the configuration-cache works, [this file may contain stored credentials and other
secrets](https://docs.gradle.org/release-nightly/userguide/configuration_cache.html#config_cache:secrets), and this data needs to be encrypted in order to be safely stored in the GitHub Actions cache.

In order to benefit from configuration caching in your GitHub Actions workflow, you must:
- Execute your build with Gradle 8.6 or newer. This can be achieved directly, or via the Gradle Wrapper.
- Enable the configuration cache for your build.
- Generate a [valid Gradle encryption key](https://docs.gradle.org/8.6-rc-1/userguide/configuration_cache.html#config_cache:secrets:configuring_encryption_key) and save it as a [GitHub Actions secret](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).
- Provide the secret key via the `cache-encryption-key` action parameter.

```yaml
jobs:
  gradle-with-configuration-cache:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: gradle/gradle-build-action@v3
      with:
        gradle-version: 8.6-rc-1
        cache-encryption-key: ${{ secrets.GradleEncryptionKey }}
    - run: gradle build --configuration-cache
```

### Incompatibility with other caching mechanisms

When using `gradle-build-action` we recommend that you avoid using other mechanisms to save and restore the Gradle User Home. 

Specifically:
- Avoid using `actions/cache` configured to cache the Gradle User Home, [as described in this example](https://github.com/actions/cache/blob/main/examples.md#java---gradle).
- Avoid using `actions/setup-java` with the `cache: gradle` option, [as described here](https://github.com/actions/setup-java#caching-gradle-dependencies).

Using either of these mechanisms may interfere with the caching provided by this action. If you choose to use a different mechanism to save and restore the Gradle User Home, you should disable the caching provided by this action, as described above.

### Cache debugging and analysis

A report of all cache entries restored and saved is printed to the Job Summary when saving the cache entries. 
This report can provide valuable insight into how much cache space is being used.

It is possible to enable additional debug logging for cache operations. You do via the `GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED` environment variable:

```yaml
env:
  GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED: true
```

Note that this setting will also prevent certain cache operations from running in parallel, further assisting with debugging.

## How Gradle User Home caching works

### Properties of the GitHub Actions cache

The GitHub Actions cache has some properties that present problems for efficient caching of the Gradle User Home.
- Immutable entries: once a cache entry is written for a key, it cannot be overwritten or changed.
- Branch scope: cache entries written for a Git branch are not visible from actions running against different branches. Entries written for the default branch are visible to all. https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#restrictions-for-accessing-a-cache
- Restore keys: if no exact match is found, a set of partial keys can be provided that will match by cache key prefix. https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#matching-a-cache-key

Each of these properties has influenced the design and implementation of the caching in `gradle-build-action`, as described below.

### Which content is cached

Using experiments and observations, we have attempted to identify which Gradle User Home content is worth saving and restoring between build invocations. We considered both the respective size of the content and the impact this content has on build times. As well as the obvious candidates like downloaded dependencies, we saw that compiled build scripts, transformed Jar files and other content can also have a significant impact.

In the end, we opted to save and restore as much content as is practical, including:
- `caches/<version>/generated-gradle-jars`: These files are generated on first use of a particular Gradle version, and are expensive to recreate
- `caches/<version>/kotlin-dsl` and `caches/<version>/scripts`: These are the compiled build scripts. The Kotlin ones in particular can benefit from caching.
- `caches/modules-2`: The downloaded dependencies
- `caches/transforms-3`: The results of artifact transforms
- `caches/jars-9`: Jar files that have been processed/instrumented by Gradle
- `caches/build-cache-1`: The local build cache

In certain cases a particular section of Gradle User Home will be too large to make caching effective. In these cases, particular subdirectories can be excluded from caching. See [Exclude content from Gradle User Home cache](#exclude-content-from-gradle-user-home-cache).

### Cache keys

The actual content of the Gradle User Home after a build is the result of many factors, including:
- Core Gradle build files (`settings.gradle[.kts]`, `build.gradle[.kts]`, `gradle.properties`)
- Associated Gradle configuration files (`gradle-wrapper.properties`, `dependencies.toml`, etc)
- The entire content of `buildSrc` or any included builds that provide plugins.
- The entire content of the repository, in the case of the local build cache.
- The actual build command that was invoked, including system properties and environment variables.

For this reason, it's very difficult to create a cache key that will deterministically map to a saved Gradle User Home state. So instead of trying to reliably hash all of these inputs to generate a cache key, the Gradle User Home cache key is based on the currently executing Job and the current commit hash for the repository.

The Gradle User Home cache key is composed of:
- The current operating system (`RUNNER_OS`)
- The Job id
- A hash of the Job matrix parameters and the workflow name
- The git SHA for the latest commit

Specifically, the cache key is: `${cache-protocol}-gradle|${runner-os}|${job-id}[${hash-of-job-matrix-and-workflow-name}]-${git-sha}`

As such, the cache key is likely to change on each subsequent run of GitHub actions. 
This allows the most recent state to always be available in the GitHub actions cache.

### Finding a matching cache entry

In most cases, no exact match will exist for the cache key. Instead, the Gradle User Home will be restored for the closest matching cache entry, using a set of "restore keys". The entries will be matched with the following precedence:
- An exact match on OS, job id, workflow name, matrix and Git SHA
- The most recent entry saved for the same OS, job id, workflow name and matrix values
- The most recent entry saved for the same OS and job id
- The most recent entry saved for the same OS

Due to branch scoping of cache entries, the above match will be first performed for entries from the same branch, and then for the default ('main') branch.

After the Job is complete, the current Gradle User Home state will be collected and written as a new cache entry with the complete cache key. Old entries will be expunged from the GitHub Actions cache on a least-recently-used basis.

Note that while effective, this mechanism is not inherently efficient. It requires the entire Gradle User Home directory to be stored separately for each branch, for every OS+Job+Matrix combination. In addition, a new cache entry to be written on every GitHub Actions run. 

This inefficiency is effectively mitigated by [Deduplication of Gradle User Home cache entries](#deduplication-of-gradle-user-home-cache-entries), and can be further optimized for a workflow using the techniques described in [Optimizing cache effectiveness](#optimizing-cache-effectiveness).

### Deduplication of Gradle User Home cache entries

To reduce duplication between cache entries, certain artifacts in Gradle User Home are extracted and cached independently based on their identity. This allows each Gradle User Home cache entry to be relatively small, sharing common elements between them without duplication.

Artifacts that are cached independently include:
- Downloaded dependencies
- Downloaded wrapper distributions
- Generated Gradle API jars
- Downloaded Java Toolchains

For example, this means that all jobs executing a particular version of the Gradle wrapper will share a single common entry for this wrapper distribution and one for each of the generated Gradle API jars.

### Stopping the Gradle daemon

By default, the action will stop all running Gradle daemons in the post-action step, prior to saving the Gradle User Home state. 
This allows for any Gradle User Home cleanup to occur, and avoid file-locking issues on Windows.

If caching is disabled or the cache is in read-only mode, the daemon will not be stopped and will continue running after the job is completed.

## Optimizing cache effectiveness

Cache storage space for GitHub actions is limited, and writing new cache entries can trigger the deletion of existing entries.
Eviction of shared cache entries can reduce cache effectiveness, slowing down your `gradle-build-action` steps.

There are a number of actions you can take if your cache use is less effective due to entry eviction.

At the end of a Job, the `gradle-build-action` will write a summary of the Gradle builds executed, together with a detailed report of the cache entries that were read and written during the Job. This report can provide valuable insights that may help to determine the right way to optimize the cache usage for your workflow.

### Select which jobs should write to the cache

Consider a workflow that first runs a Job "compile-and-unit-test" to compile the code and run some basic unit tests, which is followed by a matrix of parallel "integration-test" jobs that each run a set of integration tests for the repository. Each "integration test" Job requires all of the dependencies required by "compile-and-unit-test", and possibly one or 2 additional dependencies.

By default, a new cache entry will be written on completion of each integration test job. If no additional dependencies were downloaded then this cache entry will share the "dependencies" entry with the "compile-and-unit-test" job, but if a single dependency was downloaded then an entire new "dependencies" entry would be written. (The `gradle-build-action` does not _yet_ support a layered cache that could do this more efficiently). If each of these "integration-test" entries with their different "dependencies" entries is too large, then it could result in other important entries being evicted from the GitHub Actions cache.

There are some techniques that can be used to avoid/mitigate this issue:
- Configure the "integration-test" jobs with `cache-read-only: true`, meaning that the Job will use the entry written by the "compile-and-unit-test" job. This will avoid the overhead of cache entries for each of these jobs, at the expense of re-downloading any additional dependencies required by "integration-test".
- Add an additional step to the "compile-and-unit-test" job which downloads all dependencies required by the integration-test jobs but does not execute the tests. This will allow the "dependencies" entry for "compile-and-unit-test" to be shared among all cache entries for "integration-test". The resulting "integration-test" entries should be much smaller, reducing the potential for eviction.
- Combine the above 2 techniques, so that no cache entry is written by "integration-test" jobs, but all required dependencies are already present from the restored "compile-and-unit-test" entry.

### Select which branches should write to the cache

GitHub cache entries are not shared between builds on different branches. 
Workflow runs can restore caches created in either the current branch or the default branch (usually main).
This means that each branch will have it's own Gradle User Home cache scope, and will not benefit from cache entries written for other (non-default) branches.

By default, the `gradle-build-action` will only _write_ to the cache for builds run on the default (`master`/`main`) branch. 
Jobs run on other branches will only read from the cache. In most cases, this is the desired behavior. 
This is because Jobs run on other branches will benefit from the cache Gradle User Home from `main`, 
without writing private cache entries that which could lead to evicting these shared entries.

If you have other long-lived development branches that would benefit from writing to the cache, 
you can configure this by disabling the `cache-read-only` action parameter for these branches. 
See [Using the cache read-only](#using-the-cache-read-only) for more details.

Note there are some cases where writing cache entries is typically unhelpful (these are disabled by default):
- For `pull_request` triggered runs, the cache scope is limited to the merge ref (`refs/pull/.../merge`) and can only be restored by re-runs of the same pull request.
- For `merge_group` triggered runs, the cache scope is limited to a temporary branch with a special prefix created to validate pull request changes, and won't be available on subsequent Merge Queue executions.

  
### Exclude content from Gradle User Home cache

As well as any wrapper distributions, the action will attempt to save and restore the `caches` and `notifications` directories from Gradle User Home.

Each build is different, and some builds produce more Gradle User Home content than others.
[Cache debugging ](#cache-debugging-and-analysis) can provide insight into which cache entries are the largest,
and the contents to be cached can be fine tuned by including and excluding certain paths within Gradle User Home.

```yaml
# Cache downloaded JDKs in addition to the default directories.
gradle-home-cache-includes: |
    caches
    notifications
    jdks
# Exclude the local build-cache and keyrings from the directories cached.
gradle-home-cache-excludes: |
    caches/build-cache-1
    caches/keyrings
```

You can specify any number of fixed paths or patterns to include or exclude. 
File pattern support is documented at https://docs.github.com/en/actions/learn-github-actions/workflow-syntax-for-github-actions#patterns-to-match-file-paths.

### Remove unused files from Gradle User Home before saving to cache

The Gradle User Home directory has a tendency to grow over time. When you switch to a new Gradle wrapper version or upgrade a dependency version
the old files are not automatically and immediately removed. While this can make sense in a local environment, in a GitHub Actions environment
it can lead to ever-larger Gradle User Home cache entries being saved and restored.

In order to avoid this situation, the `gradle-build-action` supports the `gradle-home-cache-cleanup` parameter. 
When enabled, this feature will attempt to delete any files in the Gradle User Home that were not used by Gradle during the GitHub Actions workflow, 
prior to saving the Gradle User Home to the GitHub Actions cache.

Gradle Home cache cleanup is considered experimental and is disabled by default.  You can enable this feature for the action as follows:
```yaml
gradle-home-cache-cleanup: true
```

## Build reporting

The `gradle-build-action` collects information about any Gradle executions that occur in a workflow, including the root project,
requested tasks, build outcome and any Build Scan link generated. Details of cache entries read and written are also collected.
These details are compiled into a Job Summary, which is visible in the GitHub Actions UI.

Generation of a Job Summary is enabled by default for all Jobs using the `gradle-build-action`. This feature can be configured
so that a Job Summary is never generated, or so that a Job Summary is only generated on build failure:
```yaml
add-job-summary: 'on-failure' # Valid values are 'always' (default), 'never', and 'on-failure'
```

### Adding Job Summary as a Pull Request comment

It is sometimes more convenient to view the results of a GitHub Actions Job directly from the Pull Request that triggered
the Job. For this purpose you can configure the action so that Job Summary data is added as a Pull Request comment.


```yaml
name: CI
on:
  pull_request:

permissions:
  pull-requests: write

jobs:
  run-gradle-build:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout project sources
      uses: actions/checkout@v4
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v3
      with:
        add-job-summary-as-pr-comment: on-failure # Valid values are 'never' (default), 'always', and 'on-failure'
    - run: ./gradlew build --scan
```

Note that in order to add a Pull Request comment, the workflow must be configured with the `pull-requests: write` permission.


### Build Scan® link as Step output

As well as reporting all [Build Scan](https://gradle.com/build-scans/) links in the Job Summary,
the `gradle-build-action` action makes this link available an an output of any Step that executes Gradle.

The output name is `build-scan-url`. You can then use the build scan link in subsequent actions of your workflow. 

### Saving arbitrary build outputs

By default, a GitHub Actions workflow using `gradle-build-action` will record the log output and any Build Scan 
links for your build, but any output files generated by the build will not be saved.

To save selected files from your build execution, you can use the core [Upload-Artifact](https://github.com/actions/upload-artifact) action.
For example:

```yaml
jobs:   
  gradle:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout project sources
      uses: actions/checkout@v4
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v2
    - name: Run build with Gradle wrapper
      run: ./gradlew build --scan
    - name: Upload build reports
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: build-reports
        path: build/reports/
```

### Use of custom init-scripts in Gradle User Home

Note that the action collects information about Gradle invocations via an [Initialization Script](https://docs.gradle.org/current/userguide/init_scripts.html#sec:using_an_init_script)
located at `USER_HOME/.gradle/init.d/gradle-build-action.build-result-capture.init.gradle`.

If you are adding any custom init scripts to the `USER_HOME/.gradle/init.d` directory, it may be necessary to ensure these files are applied prior to `gradle-build-action.build-result-capture.init.gradle`.
Since Gradle applies init scripts in alphabetical order, one way to ensure this is via file naming.

## Support for GitHub Enterprise Server (GHES)

You can use the `gradle-build-action` on GitHub Enterprise Server, and benefit from the improved integration with Gradle. Depending on the version of GHES you are running, certain features may be limited:
- Build Scan links are captured and displayed in the GitHub Actions UI
- Easily run your build with different versions of Gradle
- Save/restore of Gradle User Home (requires GHES v3.5+ : GitHub Actions cache was introduced in GHES 3.5)
- Support for GitHub Actions Job Summary (requires GHES 3.6+ : GitHub Actions Job Summary support was introduced in GHES 3.6). In earlier versions of GHES the build-results summary and caching report will be written to the workflow log, as part of the post-action step.

# GitHub Dependency Graph support

> [!IMPORTANT]
> The simplest (and recommended) way to generate a dependency graph is via a separate workflow 
> using `gradle/actions/dependency-submission`. This action will attempt to detect all dependencies used by your build
> without building and testing the project itself.
>
> See the [dependency-submission documentation](https://github.com/gradle/actions/blob/main/dependency-submission/README.md) for up-to-date documentation.

For documentation on directly generating a dependency graph from a Gradle execution, see the
[setup-gradle docs](https://github.com/gradle/actions/blob/main/setup-gradle/README.md#github-dependency-graph-support) on this topic.

# Develocity plugin injection

The `gradle-build-action` provides support for injecting and configuring the Develocity Gradle plugin into any Gradle build, without any modification to the project sources.
This is achieved via an init-script installed into Gradle User Home, which is enabled and parameterized via environment variables.

The same auto-injection behavior is available for the Common Custom User Data Gradle plugin, which enriches any build scans published with additional useful information.

## Enabling Develocity injection

In order to enable Develocity injection for your build, you must provide the required configuration via environment variables. 

Here's a minimal example:

```yaml
name: Run build with Develocity injection
  
env:
  DEVELOCITY_INJECTION_ENABLED: true
  DEVELOCITY_URL: https://develocity.your-server.com
  DEVELOCITY_PLUGIN_VERSION: 3.16.2

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v2
    - name: Run a Gradle build with Develocity injection enabled
      run: ./gradlew build
```

This configuration will automatically apply `v3.16.2` of the [Develocity Gradle plugin](https://docs.gradle.com/enterprise/gradle-plugin/), and publish build scans to https://develocity.your-server.com.

This example assumes that the `develocity.your-server.com` server allows anonymous publishing of build scans.
In the likely scenario that your Develocity server requires authentication, you will also need to configure an addition environment variable
with a valid [Develocity access key](https://docs.gradle.com/enterprise/gradle-plugin/#via_environment_variable).

## Configuring Develocity injection

The `init-script` supports a number of additional configuration parameters that you may fine useful. All configuration options (required and optional) are detailed below:

| Variable                          | Required | Description |
|-----------------------------------| --- | --- |
| DEVELOCITY_INJECTION_ENABLED      | :white_check_mark: | enables Develocity injection |
| DEVELOCITY_URL                    | :white_check_mark: | the URL of the Develocity server |
| DEVELOCITY_ALLOW_UNTRUSTED_SERVER | | allow communication with an untrusted server; set to _true_ if your Develocity instance is using a self-signed certificate |
| DEVELOCITY_ENFORCE_URL            | | enforce the configured Develocity URL over a URL configured in the project's build; set to _true_ to enforce publication of build scans to the configured Develocity URL |
| DEVELOCITY_PLUGIN_VERSION         | :white_check_mark: | the version of the [Develocity Gradle plugin](https://docs.gradle.com/enterprise/gradle-plugin/) to apply |
| DEVELOCITY_CCUD_PLUGIN_VERSION    |  | the version of the [Common Custom User Data Gradle plugin](https://github.com/gradle/common-custom-user-data-gradle-plugin) to apply, if any |
| GRADLE_PLUGIN_REPOSITORY_URL      |  | the URL of the repository to use when resolving the Develocity and CCUD plugins; the Gradle Plugin Portal is used by default |

## Publishing to scans.gradle.com

Develocity injection is designed to enable publishing of build scans to a Develocity instance,
but is also useful for publishing to the public Build Scans instance (https://scans.gradle.com).

To publish to https://scans.gradle.com, you must specify in your workflow that you accept the [Gradle Terms of Service](https://gradle.com/terms-of-service).

```yaml
name: Run build and publish Build Scan

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Gradle to publish build scans
      uses: gradle/gradle-build-action@v2
      with:
        build-scan-publish: true
        build-scan-terms-of-service-url: "https://gradle.com/terms-of-service"
        build-scan-terms-of-service-agree: "yes"

    - name: Run a Gradle build - a build scan will be published automatically
      run: ./gradlew build
```

