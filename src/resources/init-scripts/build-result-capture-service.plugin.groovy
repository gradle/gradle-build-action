import org.gradle.tooling.events.*
import org.gradle.tooling.events.task.*
import org.gradle.util.GradleVersion

// Can't use settingsEvaluated since this script is applied inside a settingsEvaluated handler
// But projectsEvaluated is good enough, since the build service won't catch configuration failures anyway
projectsEvaluated {
    def projectTracker = gradle.sharedServices.registerIfAbsent("gradle-build-action-buildResultsRecorder", BuildResultsRecorder, { spec ->
        spec.getParameters().getRootProjectName().set(gradle.rootProject.name)
        spec.getParameters().getRootProjectDir().set(gradle.rootProject.rootDir.absolutePath)
        spec.getParameters().getRequestedTasks().set(gradle.startParameter.taskNames.join(" "))
        spec.getParameters().getGradleHomeDir().set(gradle.gradleHomeDir.absolutePath)
        spec.getParameters().getInvocationId().set(gradle.ext.invocationId)
    })

    gradle.services.get(BuildEventsListenerRegistry).onTaskCompletion(projectTracker)
}

abstract class BuildResultsRecorder implements BuildService<BuildResultsRecorder.Params>, OperationCompletionListener, AutoCloseable {
    private boolean buildFailed = false
    interface Params extends BuildServiceParameters {
        Property<String> getRootProjectName()
        Property<String> getRootProjectDir()
        Property<String> getRequestedTasks()
        Property<String> getGradleHomeDir()
        Property<String> getInvocationId()
    }

    public void onFinish(FinishEvent finishEvent) {
        if (finishEvent instanceof TaskFinishEvent && finishEvent.result instanceof TaskFailureResult) {
            buildFailed = true
        }
    }

    @Override
    public void close() {
        def buildResults = [
            rootProjectName: getParameters().getRootProjectName().get(),
            rootProjectDir: getParameters().getRootProjectDir().get(),
            requestedTasks: getParameters().getRequestedTasks().get(),
            gradleVersion: GradleVersion.current().version,
            gradleHomeDir: getParameters().getGradleHomeDir().get(),
            buildFailed: buildFailed,
            buildScanUri: null,
            buildScanFailed: false
        ]

        def runnerTempDir = System.getenv("RUNNER_TEMP")
        def githubActionStep = System.getenv("GITHUB_ACTION")
        if (!runnerTempDir || !githubActionStep) {
            return
        }
        
        def buildResultsDir = new File(runnerTempDir, ".build-results")
        buildResultsDir.mkdirs()
        def buildResultsFile = new File(buildResultsDir, githubActionStep + getParameters().getInvocationId().get() + ".json")
        if (!buildResultsFile.exists()) {
            buildResultsFile << groovy.json.JsonOutput.toJson(buildResults)
        }
    }
}
