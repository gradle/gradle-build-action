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

## Use a Gradle wrapper from a different directory
 
```yaml
 - uses: eskatos/gradle-command-action@v1
   with:
     wrapper-directory: path/to/wrapper-directory
 ```

## Use a specific `gradle` executable

```yaml
 - uses: eskatos/gradle-command-action@v1
   with:
     gradle-executable: path/to/gradle
```

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

# Build scans

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
    - uses: example/action-that-comments-on-the-pr@v0
      if: failure()
      with:
        comment: Build failed ${{ steps.gradle.outputs.build-scan-url }}
```
