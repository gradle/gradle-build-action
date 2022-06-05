import org.gradle.tooling.events.*
import org.gradle.tooling.events.task.*
import org.gradle.util.GradleVersion

// Can't use settingsEvaluated since this script is applied inside a settingsEvaluated handler
// But projectsEvaluated is good enough, since the build service won't catch configuration failures anyway
projectsEvaluated {
    def projectTracker = gradle.sharedServices.registerIfAbsent("gradle-build-action-buildResultsRecorder", BuildResultsRecorder, { spec ->
        spec.getParameters().getRootProject().set(gradle.rootProject.name);
        spec.getParameters().getRequestedTasks().set(gradle.startParameter.taskNames.join(" "));
    })

    gradle.services.get(BuildEventsListenerRegistry).onTaskCompletion(projectTracker)
}

abstract class BuildResultsRecorder implements BuildService<BuildResultsRecorder.Params>, OperationCompletionListener, AutoCloseable {
    private boolean buildFailed = false
    interface Params extends BuildServiceParameters {
        Property<String> getRootProject();
        Property<String> getRequestedTasks();
    }

    public void onFinish(FinishEvent finishEvent) {
        if (finishEvent instanceof TaskFinishEvent && finishEvent.result instanceof TaskFailureResult) {
            buildFailed = true
        }
    }

    @Override
    public void close() {
        def buildResults = [
            rootProject: getParameters().getRootProject().get(), 
            requestedTasks: getParameters().getRequestedTasks().get(), 
            gradleVersion: GradleVersion.current().version, 
            buildFailed: buildFailed,
            buildScanUri: null
        ]

        def buildResultsDir = new File(System.getenv("RUNNER_TEMP"), ".build-results")
        buildResultsDir.mkdirs()
        def buildResultsFile = new File(buildResultsDir, System.getenv("GITHUB_ACTION") + System.currentTimeMillis() + ".json")
        buildResultsFile << groovy.json.JsonOutput.toJson(buildResults)
    }
}