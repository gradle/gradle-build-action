# Execute Gradle builds in GitHub Actions workflows

This GitHub Action can be used to configure Gradle and optionally execute a Gradle build on any platform supported by GitHub Actions.

## Why use the `gradle-build-action`?

It is possible to directly invoke Gradle in your workflow, and the `actions/setup-java@v3` action provides a simple way to cache Gradle dependencies. 

However, the `gradle-build-action` offers a number of advantages over this approach:

- Easily [configure your workflow to use a specific version of Gradle](#use-a-specific-gradle-version) using the `gradle-version` parameter. Gradle distributions are automatically downloaded and cached. 
- More sophisticated and more efficient caching of Gradle User Home between invocations, compared to `setup-java` and most custom configurations using `actions/cache`. [More details below](#caching).
- Detailed reporting of cache usage and cache configuration options allow you to [optimize the use of the GitHub actions cache](#optimizing-cache-effectiveness).
- [Automatic capture of Build Scan® links](#build-scans) from the build, making these easier to locate for workflow run.

The `gradle-build-action` is designed to provide these benefits with minimal configuration. 
These features work both when Gradle is executed via the `gradle-build-action` and for any Gradle execution in subsequent steps.

## Use the action to setup Gradle

The recommended way to use the `gradle-build-action` is in an initial "Setup Gradle" step, with subsquent steps invoking Gradle directly with a `run` step. This makes the action minimally invasive, and allows a workflow to configure and execute a Gradle execution in any way.

Most of the functionality of the `gradle-build-action` is applied via Gradle init-scripts, and so will apply to all subsequent Gradle executions on the runner, no matter how Gradle is invoked. This means that if you have an existing workflow that executes Gradle with a `run` step, you can add an initial "Setup Gradle" Step to benefit from caching, build-scan capture and other features of the gradle-build-action.


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
See [Optimizing cache effectiveness](#optimizing-cache-effectiveness) for a more detailed explanation.

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

### Incompatibility with other caching mechanisms

When using `gradle-build-action` we recommend that you avoid using other mechanisms to save and restore the Gradle User Home. 

Specifically:
- Avoid using `actions/cache` configured to cache the Gradle User Home, [as described in this example](https://github.com/actions/cache/blob/main/examples.md#java---gradle).
- Avoid using `actions/setup-java` with the `cache: gradle` option, [as described here](https://github.com/actions/setup-java#caching-gradle-dependencies).

Using either of these mechanisms may interfere with the caching provided by this action. If you choose to use a different mechanism to save and restore the Gradle User Home, you should disable the caching provided by this action, as described above.

### Cache debugging and analysis

A report of all cache entries restored and saved is printed to the Job Summary when saving the cache entries. 
This report can provide valuable insignt into how much cache space is being used.

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
- Core Gradle build files (`settngs.gradle[.kts]`, `build.gradle[.kts]`, `gradle.properties`)
- Associated Gradle configuration files (`gradle-wrapper.properties`, `dependencies.toml`, etc)
- The entire content of `buildSrc` or any included builds that provide plugins.
- The entire content of the repository, in the case of the local build cache.
- The actual build command that was invoked, including system properties and environment variables.

For this reason, it's very difficult to create a cache key that will deterministically map to a saved Gradle User Home state. So instead of trying to reliably hash all of these inputs to generate a cache key, the Gradle User Home cache key is based on the currently executing Job and the current commit hash for the repository.

The Gradle User Home cache key is composed of:
- The current operating system (`RUNNER_OS`)
- The workflow name and Job ID
- A hash of the Job matrix parameters
- The git SHA for the latest commit

Specifically, the cache key is: `${cache-protocol}-gradle|${runner-os}|${workflow-name}-${job-id}[${hash-of-job-matrix}]-${git-sha}`

As such, the cache key is likely to change on each subsequent run of GitHub actions. 
This allows the most recent state to always be available in the GitHub actions cache.

### Finding a matching cache entry

In most cases, no exact match will exist for the cache key. Instead, the Gradle User Home will be restored for the closest matching cache entry, using a set of "restore keys". The entries will be matched with the following precedence:
- An exact match on OS, workflow, job, matrix and Git SHA
- The most recent entry saved for the same OS, workflow, job and matrix values
- The most recent entry saved for the same OS, workflow and job
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

## Use the action to invoke Gradle

If the `gradle-build-action` is configured with an `arguments` input, then Gradle will execute a Gradle build with the arguments provided. NOTE: We recommend using the `gradle-build-action` as a "Setup Gradle" step as described above, with Gradle being invoked via a regular `run` command.

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

## Enable Dependency Graph generation for a workflow
 
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

The `contents: write` permission is not required to generate the dependency graph, but is required in order to submit the graph via the GitHub API.

The above configuration will work for workflows that run as a result of commits to a repository branch, but not when a workflow is triggered by a PR from a repository fork.
For a configuration that supports this setup, see [Dependency Graphs for pull request workflows](#dependency-graphs-for-pull-request-workflows).

## Limiting the scope of the dependency graph

At times it is helpful to limit the dependencies reported to GitHub, in order to security alerts for dependencies that don't form a critical part of your product.
For example, a vulnerability in the tool you use to generate documentation is unlikely to be as important as a vulnerability in one of your runtime dependencies.

There are a number of techniques you can employ to limit the scope of the generated dependency graph:
- [Don't generate a dependency graph for all Gradle executions](#choosing-which-gradle-invocations-will-generate-a-dependency-graph)
- [For a Gradle execution, filter which Gradle projects and configurations will contribute dependencies](#filtering-which-gradle-configurations-contribute-to-the-dependency-graph)
- [Use a separate workflow that only resolves the required dependencies]()

[!NOTE]
Ideally, all dependencies involved in building and testing a project will be extracted and reported in a dependency graph. 
These dependencies would be assigned to different scopes (eg development, runtime, testing) and the GitHub UI would make it easy to opt-in to security alerts for different dependency scopes.
However, this functionality does not yet exist.

### Choosing which Gradle invocations will generate a dependency graph

Once you enable the dependency graph support for a workflow job (via the `dependency-graph` parameter), dependencies will be collected and reported for all subsequent Gradle invocations.
If you have a Gradle build step that you want to exclude from dependency graph generation, you can set the `GITHUB_DEPENDENCY_GRAPH_ENABLED` environment variable to `false`.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Gradle to generate and submit dependency graphs
      uses: gradle/gradle-build-action@v2
      with:
        dependency-graph: generate-and-submit
    - name: Build the app, generating a graph of dependencies required
      run: ./gradlew :my-app:assemble
    - name: Run all checks, disabling dependency graph generation
      run: ./gradlew check
      env:
        GITHUB_DEPENDENCY_GRAPH_ENABLED: false
```

### Filtering which Gradle Configurations contribute to the dependency graph

If you do not want the dependency graph to include every dependency configuration in every project in your build, you can limit the
dependency extraction to a subset of these.

To restrict which Gradle subprojects contribute to the report, specify which projects to include via a regular expression.
You can provide this value via the `DEPENDENCY_GRAPH_INCLUDE_PROJECTS` environment variable or system property.

To restrict which Gradle configurations contribute to the report, you can filter configurations by name using a regular expression.
You can provide this value via the `DEPENDENCY_GRAPH_INCLUDE_CONFIGURATIONS` environment variable or system property.

For example, if you want to exclude dependencies in the `buildSrc` project, and only report on dependencies from the `runtimeClasspath` configuration,
you would use the following configuration:

```yaml
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
        DEPENDENCY_GRAPH_INCLUDE_PROJECTS: "^:(?!buildSrc).*"
        DEPENDENCY_GRAPH_INCLUDE_CONFIGURATIONS: runtimeClasspath
```

### Use a dedicated workflow for dependency graph generation

Instead of generating a dependency graph from your existing CI workflow, it's possible to create a separate dedicated workflow (or Job) that is solely intended for generating a dependency graph.
Such a workflow will still need to execute Gradle, but can do so in a way that is targeted at resolving exactly the dependencies required.

For example, the following workflow will report only those dependencies that are part of the `runtimeClasspath` or the `my-app` project. 

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Gradle to generate and submit dependency graphs
      uses: gradle/gradle-build-action@v2
      with:
        dependency-graph: generate-and-submit
    - name: Extract the 'runtimeClasspath' dependencies for 'my-app'
      run: ./gradlew :my-app:dependencies --configuration runtimeClasspath
```

Note that the above example will also include `buildSrc` dependencies, since these are resolved as part of running the `dependencies` task.
If this isn't desirable, you will still need to use the filtering mechanism described above.

## Dependency Graphs for pull request workflows

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

## Gradle version compatibility

The plugin should be compatible with all versions of Gradle >= 5.0, and has been tested against 
Gradle versions "5.6.4", "6.9.4", "7.0.2", "7.6.2", "8.0.2" and the current Gradle release.

The plugin is compatible with running Gradle with the configuration-cache enabled. However, this support is
limited to Gradle "8.1.0" and later:
- With Gradle "8.0", the build should run successfully, but an empty dependency graph will be generated.
- With Gradle <= "7.6.4", the plugin will cause the build to fail with configuration-cache enabled.

To use this plugin with versions of Gradle older than "8.1.0", you'll need to invoke Gradle with the
configuration-cache disabled.

