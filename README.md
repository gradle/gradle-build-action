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
    - uses: actions/checkout@v3
    - uses: actions/setup-java@v3
      with:
        distribution: temurin
        java-version: 11
        
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v2
    
    - name: Execute Gradle build
      run: ./gradlew build
```

## Why use the `gradle-build-action`?

It is possible to directly invoke Gradle in your workflow, and the `actions/setup-java@v3` action provides a simple way to cache Gradle dependencies. 

However, the `gradle-build-action` offers a number of advantages over this approach:

- Easily [run the build with different versions of Gradle](#use-a-specific-gradle-version) using the `gradle-version` parameter. Gradle distributions are automatically downloaded and cached. 
- More sophisticated and more efficient caching of Gradle User Home between invocations, compared to `setup-java` and most custom configurations using `actions/cache`. [More details below](#caching).
- Detailed reporting of cache usage and cache configuration options allow you to [optimize the use of the GitHub actions cache](#optimizing-cache-effectiveness).
- [Automatic capture of Build Scan® links](#build-scans) from the build, making these easier to locate for workflow run.

The `gradle-build-action` is designed to provide these benefits with minimal configuration. 
These features work both when Gradle is executed via the `gradle-build-action` and for any Gradle execution in subsequent steps.

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
    - uses: actions/checkout@v3
    - uses: actions/setup-java@v3
      with:
        distribution: temurin
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
    - uses: actions/checkout@v3
    - uses: actions/setup-java@v3
      with:
        distribution: temurin
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

The `arguments` input can be used to pass arbitrary arguments to the `gradle` command line.
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

To reduce the space required for caching, this action makes a best effort to reduce duplication in cache entries.

Caching is enabled by default. You can disable caching for the action as follows:
```yaml
cache-disabled: true
```

### Incompatibility with other caching mechanisms

When using `gradle-build-action` we recommend that you avoid using other mechanisms to save and restore the Gradle User Home. 

Specifically:
- Avoid using `actions/cache` configured to cache the Gradle User Home, [as described in this example](https://github.com/actions/cache/blob/main/examples.md#java---gradle).
- Avoid using `actions/setup-java` with the `cache: gradle` option, [as described here](https://github.com/actions/setup-java#caching-gradle-dependencies).

Using either of these mechanisms may interfere with the caching provided by this action. If you choose to use a different mechanism to save and restore the Gradle User Home, you should disable the caching provided by this action, as described above.

### Cache keys

Distributions downloaded to satisfy a `gradle-version` parameter are stored outside of Gradle User Home and cached separately. The cache key is unique to the downloaded distribution and will not change over time.

The state of the Gradle User Home is highly dependent on the Gradle execution, so the cache key is composed of the current commit hash and the GitHub actions job id.
As such, the cache key is likely to change on each subsequent run of GitHub actions. 
This allows the most recent state to always be available in the GitHub actions cache.

To reduce duplication between cache entries, certain artifacts are cached independently based on their identity.
Artifacts that are cached independently include downloaded dependencies, downloaded wrapper distributions and generated Gradle API jars.
For example, this means that all jobs executing a particular version of the Gradle wrapper will share common entries for wrapper distributions and for generated Gradle API jars.

### Using the caches read-only

By default, the `gradle-build-action` will only write to the cache from Jobs on the default (`main`/`master`) branch.
Jobs on other branches will read entries from the cache but will not write updated entries. 
See [Optimizing cache effectiveness](#optimizing-cache-effectiveness) for a more detailed explanation.

In some circumstances it makes sense to change this default, and to configure a workflow Job to read existing cache entries but not to write changes back.

You can configure read-only caching for the `gradle-build-action` as follows:

```yaml
# Only write to the cache for builds on the 'main' and 'release' branches. (Default is 'main' only.)
# Builds on other branches will only read existing entries from the cache.
cache-read-only: ${{ github.ref != 'refs/heads/main' && github.ref != 'refs/heads/release' }}
```

### Stopping the Gradle daemon

By default, the action will stop all running Gradle daemons in the post-action step, prior to saving the Gradle User Home state. 
This allows for any Gradle User Home cleanup to occur, and avoid file-locking issues on Windows.

If caching is unavailable or the cache is in read-only mode, the daemon will not be stopped and will continue running after the job is completed.

### Gradle User Home cache tuning

As well as any wrapper distributions, the action will attempt to save and restore the `caches` and `notifications` directories from Gradle User Home.

The contents to be cached can be fine tuned by including and excluding certain paths with Gradle User Home.

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

### Cache debugging and analysis

Gradle User Home state will be restored from the cache during the first `gradle-build-action` step for any workflow job. 
This state will be saved back to the cache at the end of the job, after all Gradle executions have completed.
A report of all cache entries restored and saved is printed to the Job Summary when saving the cache entries. 
This report can provide valuable insignt into how much cache space is being used.

It is possible to enable additional debug logging for cache operations. You do via the `GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED` environment variable:

```yaml
env:
  GRADLE_BUILD_ACTION_CACHE_DEBUG_ENABLED: true
```

Note that this setting will also prevent certain cache operations from running in parallel, further assisting with debugging.

### Optimizing cache effectiveness

Cache storage space for GitHub actions is limited, and writing new cache entries can trigger the deletion of existing entries.
Eviction of shared cache entries can reduce cache effectiveness, slowing down your `gradle-build-action` steps.

There are a number of actions you can take if your cache use is less effective due to entry eviction.

#### Select branches that should write to the cache

GitHub cache entries are not shared between builds on different branches. 
This means that each PR branch will have it's own Gradle User Home cache, and will not benefit from cache entries written by other PR branches.
An exception to this is that cache entries written in parent and upstream branches are visible to child branches, and cache entries for the default (`master`/`main`) branch can be read by actions invoked for any other branch.

By default, the `gradle-build-action` will only _write_ to the cache for builds run on the default (`master`/`main`) branch. 
Jobs run on other branches will only read from the cache. In most cases, this is the desired behaviour, 
because Jobs run against other branches will benefit from the cache Gradle User Home from `main`, 
without writing private cache entries that could lead to evicting shared entries.

If you have other long-lived development branches that would benefit from writing to the cache, 
you can configure these by overriding the `cache-read-only` action parameter. 
See [Using the caches read-only](#using-the-caches-read-only) for more details.

Similarly, you could use `cache-read-only` for certain jobs in the workflow, and instead have these jobs reuse the cache content from upstream jobs.

#### Exclude content from Gradle User Home cache

Each build is different, and some builds produce more Gradle User Home content than others.
[Cache debugging ](#cache-debugging-and-analysis) can provide insight into which cache entries are the largest,
and you can selectively [exclude content using `gradle-home-cache-exclude`](#gradle-user-home-cache-tuning).

#### Removing unused files from Gradle User Home before saving to cache

The Gradle User Home directory has a tendency to grow over time. When you switch to a new Gradle wrapper version or upgrade a dependency version
the old files are not automatically and immediately removed. While this can make sense in a local environment, in a GitHub Actions environment
it can lead to ever-larger Gradle User Home cache entries being saved and restored.

In order to avoid this situation, the `gradle-build-action` supports the `gradle-home-cache-cleanup` parameter. 
When enabled, this feature will attempt to delete any files in the Gradle User Home that were not used by Gradle during the GitHub Actions workflow, 
prior to saving the Gradle User Home to the GitHub Actions cache.

Gradle Home cache cleanup is disabled by default.  You can enable this feature for the action as follows:
```yaml
gradle-home-cache-cleanup: true
```

## Build reporting

The `gradle-build-action` collects information about any Gradle executions that occur in a workflow, and reports these via
a Job Summary, visible in the GitHub Actions UI. For each Gradle execution, details about the invocation are listed, together with
a link to any Build Scan® published.

Generation of a Job Summary is enabled by default. If this is not desired, it can be disable as follows:
```yaml
generate-job-summary: false
```

Note that the action collects information about Gradle invocations via an [Initialization Script](https://docs.gradle.org/current/userguide/init_scripts.html#sec:using_an_init_script)
located at `USER_HOME/.gradle/init.d/build-result-capture.init.gradle`.
If you are using init scripts for the [Gradle Enterprise Gradle Plugin](https://plugins.gradle.org/plugin/com.gradle.enterprise) like
[`scans-init.gradle` or `gradle-enterprise-init.gradle`](https://docs.gradle.com/enterprise/gradle-plugin/#scans_gradle_com),
you'll need to ensure these files are applied prior to `build-result-capture.init.gradle`.
Since Gradle applies init scripts in alphabetical order, one way to ensure this is via file naming.

### Build Scan® link as Step output

As well as reporting the [Build Scan](https://gradle.com/build-scans/) link in the Job Summary,
the `gradle-build-action` action makes this link available as a Step output named `build-scan-url`.

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
      uses: actions/checkout@v3
    - name: Setup Gradle
      uses: gradle/gradle-build-action@v2
    - name: Run build with Gradle wrapper
      id: gradle
      run: ./gradlew build --scan
    - name: "Add Build Scan URL as PR comment"
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

### Saving build outputs

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
      uses: actions/checkout@v3
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

## Support for GitHub Enterprise Server (GHES)

You can use the `gradle-build-action` on GitHub Enterprise Server, and benefit from the improved integration with Gradle. Depending on the version of GHES you are running, certain features may be limited:
- Build Scan links are captured and displayed in the GitHub Actions UI
- Easily run your build with different versions of Gradle
- Save/restore of Gradle User Home (requires GHES v3.5+ : GitHub Actions cache was introduced in GHES 3.5)
- Support for GitHub Actions Job Summary (requires GHES 3.6+ : GitHub Actions Job Summary support was introduced in GHES 3.6). In earlier versions of GHES the build-results summary and caching report will be written to the workflow log, as part of the post-action step.

# GitHub Dependency Graph support

The `gradle-build-action` has support for submitting a [GitHub Dependency Graph](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-the-dependency-graph) snapshot via the [GitHub Dependency Submission API](https://docs.github.com/en/rest/dependency-graph/dependency-submission?apiVersion=2022-11-28).

The dependency graph snapshot is generated via integration with the [GitHub Dependency Graph Gradle Plugin](https://plugins.gradle.org/plugin/org.gradle.github-dependency-graph-gradle-plugin), and saved as a workflow artifact. The generated snapshot files can be submitted either in the same job, or in a subsequent job (in the same or a dependent workflow).

The generated dependency graph snapshot reports all of the dependencies that were resolved during a bulid execution, and is used by GitHub to generate [Dependabot Alerts](https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts) for vulnerable dependencies, as well as to populate the [Dependency Graph insights view](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/exploring-the-dependencies-of-a-repository#viewing-the-dependency-graph).
 
You enable GitHub Dependency Graph support by setting the `dependency-graph` action parameter. Valid values are:

| Option | Behaviour |
| --- | --- |
| `disabled`            | Do not generate a dependency graph for any build invocations.<p>This is the default. |
| `generate`            | Generate a dependency graph snapshot for each build invocation, saving as a workflow artifact. |
| `generate-and-submit` | As per `generate`, but any generated dependency graph snapshots will be submitted at the end of the job. |
| `download-and-submit` | Download any previously saved dependency graph snapshots, submitting them via the Dependency Submission API. This can be useful to collect all snapshots in a matrix of builds and submit them in one step. |

Dependency Graph _submission_ (but not generation) requires the `contents: write` permission, which may need to be explicitly enabled in the workflow file.

Example of a simple workflow that generates and submits a dependency graph:
```yaml
name: Submit dependency graph
on:
  push:
  
permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Gradle to generate and submit dependency graphs
      uses: gradle/gradle-build-action@v2
      with:
        dependency-graph: generate-and-submit
    - name: Run a build, generating the dependency graph snapshot which will be submitted
      run: ./gradlew build
```

### Filtering which Gradle Configurations contribute to the dependency graph

If you do not want to include every dependency configuration in every project in your build, you can limit the
dependency extraction to a subset of these.

To restrict which Gradle subprojects contribute to the report, specify which projects to include via a regular expression.
You can provide this value via the `DEPENDENCY_GRAPH_INCLUDE_PROJECTS` environment variable or system property.

To restrict which Gradle configurations contribute to the report, you can filter configurations by name using a regular expression.
You can provide this value via the `DEPENDENCY_GRAPH_INCLUDE_CONFIGURATIONS` environment variable or system property.

Example of a simple workflow that limits the dependency graph to `runtimeClasspath` configuration and to exclude `buildSrc` dependencies:

```yaml
name: Submit dependency graph
on:
  push:
  
permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Gradle to generate and submit dependency graphs
      uses: gradle/gradle-build-action@v2
      with:
        dependency-graph: generate-and-submit
    - name: Run a build, generating the dependency graph from 'runtimeClasspath' configurations
      run: ./gradlew build
      env:
        DEPENDENCY_GRAPH_INCLUDE_CONFIGURATIONS: runtimeClasspath
        DEPENDENCY_GRAPH_INCLUDE_PROJECTS: "^:(?!buildSrc).*"
```

### Gradle version compatibility

The plugin should be compatible with all versions of Gradle >= 5.0, and has been tested against 
Gradle versions "5.6.4", "6.9.4", "7.0.2", "7.6.2", "8.0.2" and the current Gradle release.

The plugin is compatible with running Gradle with the configuration-cache enabled. However, this support is
limited to Gradle "8.1.0" and later:
- With Gradle "8.0", the build should run successfully, but an empty dependency graph will be generated.
- With Gradle <= "7.6.4", the plugin will cause the build to fail with configuration-cache enabled.

To use this plugin with versions of Gradle older than "8.1.0", you'll need to invoke Gradle with the
configuration-cache disabled.

### Dependency snapshots generated for pull requests

This `contents: write` permission is not available for any workflow that is triggered by a pull request submitted from a forked repository, since it would permit a malicious pull request to make repository changes. 

Because of this restriction, it is not possible to `generate-and-submit` a dependency graph generated for a pull-request that comes from a repository fork. In order to do so, 2 workflows will be required:
1. The first workflow runs directly against the pull request sources and will generate the dependency graph snapshot.
2. The second workflow is triggered on `workflow_run` of the first workflow, and will submit the previously saved dependency snapshots.

Note: when `download-and-submit` is used in a workflow triggered via [workflow_run](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_run), the action will download snapshots saved in the triggering workflow.

***Main workflow file***
```yaml
name: run-build-and-generate-dependency-snapshot

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Gradle to generate and submit dependency graphs
      uses: gradle/gradle-build-action@v2
      with:
        dependency-graph: generate # Only generate in this job
    - name: Run a build, generating the dependency graph snapshot which will be submitted
      run: ./gradlew build
```

***Dependent workflow file***
```yaml
name: submit-dependency-snapshot

on:
  workflow_run:
    workflows: ['run-build-and-generate-dependency-snapshot']
    types: [completed]

jobs:
  submit-snapshots:
    runs-on: ubuntu-latest
    steps:
      - name: Retrieve dependency graph artifact and submit
        uses: gradle/gradle-build-action@v2
      with:
        dependency-graph: download-and-submit
```

