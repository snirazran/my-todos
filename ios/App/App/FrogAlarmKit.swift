import Foundation

#if canImport(AlarmKit)
import AlarmKit
import ActivityKit
import AppIntents
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
        enqueue {
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
                // Stopping the alarm acknowledges the session. Not "done"
                // outright: this alarm is armed for one phase's end and the
                // session may have moved on by the time it rings, so the intent
                // decides whether there is anything to acknowledge.
                let stopIntent = FrogTimerControlIntent(action: "alarmStop")
                if let soundId, !soundId.isEmpty, soundId != "none" {
                    configuration = AlarmManager.AlarmConfiguration(
                        schedule: .fixed(date),
                        attributes: attributes,
                        stopIntent: stopIntent,
                        sound: .named("\(soundId).caf")
                    )
                } else {
                    configuration = AlarmManager.AlarmConfiguration(
                        schedule: .fixed(date),
                        attributes: attributes,
                        stopIntent: stopIntent
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
        enqueue { await cancelExisting() }
        #endif
    }

    #if canImport(AlarmKit)
    // Every alarm operation runs through this serial chain. Unserialised, a
    // cancel could overtake a sync that was still parked on requestAuthorization
    // and then schedule its alarm *after* the cancel had already run — leaving a
    // live alarm for a session that had been stopped. Two syncs racing did the
    // same thing to each other, the loser's id being overwritten in the shared
    // defaults. Either way the alarm outlived every reference to it and fired
    // later with nothing behind it.
    private static var opChain: Task<Void, Never>?

    private static func enqueue(_ work: @escaping () async -> Void) {
        let previous = opChain
        opChain = Task {
            await previous?.value
            await work()
        }
    }

    @available(iOS 26.0, *)
    private static func cancelExisting() async {
        UserDefaults(suiteName: suiteName)?.removeObject(forKey: alarmIdKey)
        // Cancel every alarm this app owns, not just the tracked id. AlarmKit
        // alarms outlive the app process and there is no cancel-all, so one we
        // lost track of could never be reached again. Only ever one is wanted at
        // a time, which makes sweeping both safe and self-healing for strays
        // already armed on the device.
        do {
            for alarm in try AlarmManager.shared.alarms {
                // Per-alarm catch: one failure must not abandon the rest of the
                // sweep, or a single stuck alarm keeps every other stray armed.
                do {
                    try AlarmManager.shared.cancel(id: alarm.id)
                } catch {
                    NSLog("FrogAlarmKit: cancel %@ failed: %@",
                          alarm.id.uuidString, error.localizedDescription)
                }
            }
        } catch {
            NSLog("FrogAlarmKit: listing alarms failed: %@", error.localizedDescription)
        }
    }
    #endif
}
