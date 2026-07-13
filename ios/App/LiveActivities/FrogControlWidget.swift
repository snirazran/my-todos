import SwiftUI
import WidgetKit
import AppIntents

// Control Center / Lock Screen / Action button control (iOS 18+): one tap
// opens Frogress ready to start a focus session.
//
// NOTE: add this file to the LiveActivities target in Xcode and register
// FrogFocusControlWidget in LiveActivitiesBundle.
@available(iOS 18.0, *)
struct FrogFocusOpenIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Focusing"
    static var isDiscoverable: Bool = false
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        return .result()
    }
}

@available(iOS 18.0, *)
struct FrogFocusControlWidget: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "io.frog.tasks.focuscontrol") {
            ControlWidgetButton(action: FrogFocusOpenIntent()) {
                Label("Focus", systemImage: "timer")
            }
        }
        .displayName("Start Focusing")
        .description("Open Frogress and start a focus session.")
    }
}
