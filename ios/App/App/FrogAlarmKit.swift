import Foundation

#if canImport(AlarmKit)
import AlarmKit
import ActivityKit
import SwiftUI

@available(iOS 26.0, *)
private struct FrogAlarmMetadata: AlarmMetadata {}
#endif

// AlarmKit hybrid (iOS 26+): alongside the custom Live Activity island, an
// alert-only system alarm fires at the phase's end — full-screen, breaks
// through Silent and Focus, loops until dismissed, and uses the user's chosen
// .caf sound. The island stays ours; AlarmKit only owns the ringing moment.
//
// Local-only by nature: every surface that changes the timer while this app
// process is alive (plugin show/end, island button intents) must re-sync the
// alarm. Cross-device changes while the app is killed are covered by the APNs
// alert path instead.
//
// NOTE: add this file to BOTH the App and LiveActivities targets in Xcode
// (the button intents run it too), and add NSAlarmKitUsageDescription to
// Info.plist.
enum FrogAlarmKit {
    private static let alarmIdKey = "frogAlarmKitId"
    private static let suiteName = "group.io.frog.tasks.liveactivities"

    /// Schedule (or move) the finish alarm to `endTime` (epoch ms). Passing a
    /// past/zero time cancels instead.
    static func sync(endTimeMs: Double, phase: String, soundId: String?) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else { return }
        Task {
            await cancelExisting()
            guard endTimeMs > Date().timeIntervalSince1970 * 1000 + 1000 else { return }

            let manager = AlarmManager.shared
            do {
                let state = try await manager.requestAuthorization()
                guard state == .authorized else { return }

                let title: LocalizedStringResource =
                    phase == "break" ? "Break finished" : "Focus finished"
                let alert = AlarmPresentation.Alert(
                    title: title,
                    stopButton: AlarmButton(
                        text: "Done",
                        textColor: .white,
                        systemImageName: "checkmark"
                    )
                )
                let attributes = AlarmAttributes<FrogAlarmMetadata>(
                    presentation: AlarmPresentation(alert: alert),
                    tintColor: Color(red: 0x16 / 255, green: 0xa3 / 255, blue: 0x4a / 255)
                )
                let date = Date(timeIntervalSince1970: endTimeMs / 1000)
                let configuration: AlarmManager.AlarmConfiguration<FrogAlarmMetadata>
                if let soundId, !soundId.isEmpty, soundId != "none" {
                    configuration = AlarmManager.AlarmConfiguration(
                        schedule: .fixed(date),
                        attributes: attributes,
                        sound: .named("\(soundId).caf")
                    )
                } else {
                    configuration = AlarmManager.AlarmConfiguration(
                        schedule: .fixed(date),
                        attributes: attributes
                    )
                }

                let id = UUID()
                _ = try await manager.schedule(id: id, configuration: configuration)
                UserDefaults(suiteName: suiteName)?.set(id.uuidString, forKey: alarmIdKey)
                NSLog("FrogAlarmKit: scheduled %@ at %@", id.uuidString, "\(date)")
            } catch {
                NSLog("FrogAlarmKit: schedule failed: %@", error.localizedDescription)
            }
        }
        #endif
    }

    static func cancel() {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else { return }
        Task { await cancelExisting() }
        #endif
    }

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private static func cancelExisting() async {
        let suite = UserDefaults(suiteName: suiteName)
        guard
            let raw = suite?.string(forKey: alarmIdKey),
            let id = UUID(uuidString: raw)
        else { return }
        suite?.removeObject(forKey: alarmIdKey)
        do {
            try AlarmManager.shared.cancel(id: id)
        } catch {
            NSLog("FrogAlarmKit: cancel failed: %@", error.localizedDescription)
        }
    }
    #endif
}
