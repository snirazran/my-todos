import AppIntents

// Siri / Spotlight / Action-button entry point: "Start a focus timer in
// Frogress" opens the app on the home screen, where the timer sheet is one
// tap away (starting a session requires picking a task, so the app opens
// rather than starting blind).
//
// NOTE: add this file to the App target in Xcode.
@available(iOS 16.4, *)
struct OpenFocusTimerIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a Focus Timer"
    static var description = IntentDescription(
        "Opens Frogress so you can start a focus session and let your frog hunt."
    )
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        return .result()
    }
}

@available(iOS 16.4, *)
struct FrogAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenFocusTimerIntent(),
            phrases: [
                "Start a focus timer in \(.applicationName)",
                "Focus with \(.applicationName)",
                "Start focusing in \(.applicationName)",
            ],
            shortTitle: "Focus",
            systemImageName: "timer"
        )
    }
}
