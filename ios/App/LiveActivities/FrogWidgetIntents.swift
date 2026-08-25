import AppIntents
import Foundation

// The widget's two controls.
//
// Must be a member of BOTH the App and LiveActivities targets. An intent that
// sets openAppWhenRun performs in the *app's* process, so if the type only
// exists in the extension the system has nothing to run and the app never comes
// forward — which is exactly how the add button fails when this file is only in
// one target.

/// Ticking a row without opening the app. The intent only writes to the shared
/// container and queues the change; the webview replays it through the normal
/// task endpoints next time it runs, so fly caps, the ledger, quest counters
/// and undo all stay on their usual path.
///
/// Annotated rather than left bare because the App target still deploys to
/// iOS 15, where AppIntent does not exist at all.
@available(iOS 17.0, *)
struct ToggleFrogTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete task"
    static var description = IntentDescription("Ticks a task off today's list.")
    /// Stays on the home screen — the whole point of the row being a button.
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Task ID")
    var taskId: String

    @Parameter(title: "Done")
    var done: Bool

    init() {}

    init(taskId: String, done: Bool) {
        self.taskId = taskId
        self.done = done
    }

    func perform() async throws -> some IntentResult {
        FrogWidgetStore.applyLocalToggle(taskId: taskId, done: done)
        FrogWidgetStore.queueToggle(taskId: taskId, done: done)
        return .result()
    }
}

/// The add button — the one control on the widget that is *meant* to leave the
/// home screen. It flags the request and opens the app, which puts up a native
/// composer with the keyboard already raised. Deliberately not the webview's
/// own sheet: WKWebView ignores focus() unless it can inherit a touch made
/// inside the webview, and a launch from the home screen has none.
@available(iOS 17.0, *)
struct FrogQuickAddIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a task"
    static var description = IntentDescription("Opens Frogress ready to add a task.")
    static var openAppWhenRun: Bool = true

    init() {}

    func perform() async throws -> some IntentResult {
        FrogWidgetStore.requestQuickAdd()
        return .result()
    }
}
