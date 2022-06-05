
/*
 * Capture the build root directory for each executed Gradle build.
 * This is used to save/restore configuration-cache files, so:
 * - The implementation only makes sense if it's config-cache compatible
 * - We only need to support Gradle 7+
 */

import org.gradle.tooling.events.*

settingsEvaluated { settings ->
    def rootDir = settings.rootDir.absolutePath
    def rootListLocation = new File(System.getenv("RUNNER_TEMP"), "project-roots.txt").absolutePath

    def projectTracker = gradle.sharedServices.registerIfAbsent("gradle-build-action-projectRootTracker", ProjectTracker, { spec ->
        spec.getParameters().getRootDir().set(rootDir);
        spec.getParameters().getRootListLocation().set(rootListLocation);
    })

    gradle.services.get(BuildEventsListenerRegistry).onTaskCompletion(projectTracker)
}

abstract class ProjectTracker implements BuildService<ProjectTracker.Params>, OperationCompletionListener, AutoCloseable {
    interface Params extends BuildServiceParameters {
        Property<String> getRootDir();
        Property<String> getRootListLocation();
    }

    public void onFinish(FinishEvent finishEvent) {}

    @Override
    public void close() {
        def rootDir = getParameters().getRootDir().get()
        def rootDirEntry = rootDir + '\n'
        def rootListFile = new File(getParameters().getRootListLocation().get())
        if (!rootListFile.exists() || !rootListFile.text.contains(rootDirEntry)) {
            rootListFile << rootDirEntry
        }
    }
}