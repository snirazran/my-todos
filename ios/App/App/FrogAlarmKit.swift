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
    private static let alarmEndKey = "frogAlarmKitEndTime"
    private static let suiteName = "group.io.frog.tasks.liveactivities"
    // How long after an alarm's fire time a dismissal still reads as
    // acknowledging that session. Mirrors the server's ringing expiry.
    private static let ackWindowMs: Double = 15 * 60 * 1000

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
                let alertSound: AlertConfiguration.AlertSound
                if let soundId, !soundId.isEmpty, soundId != "none" {
                    alertSound = .named("\(soundId).caf")
                } else {
                    alertSound = .default
                }
                // Stopping the alarm IS finishing the session: without this the
                // dismissal is AlarmKit-local, the server keeps the phase in its
                // finished state, and the island/web keep asking for Done.
                let configuration = AlarmManager.AlarmConfiguration(
                    schedule: .fixed(date),
                    attributes: attributes,
                    stopIntent: FrogTimerControlIntent(action: "done"),
                    sound: alertSound
                )

                let id = UUID()
                _ = try await manager.schedule(id: id, configuration: configuration)
                let suite = UserDefaults(suiteName: suiteName)
                suite?.set(id.uuidString, forKey: alarmIdKey)
                suite?.set(endTimeMs, forKey: alarmEndKey)
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

    // AlarmKit's stopIntent is not delivered on every dismissal path — it fires
    // for the alert's stop button, but Apple's own FAQ cases (dismissing by
    // using the phone while it rings, swiping the banner up) are reported not to
    // fire it. So also watch the alarm list: our alarm vanishing when we didn't
    // cancel it means the user dismissed it, which acknowledges the session just
    // the same. Only covers the app being alive; the server's ringing expiry is
    // the backstop when it isn't.
    static func startObservation() {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else { return }
        if observationStarted { return }
        observationStarted = true
        Task { await observeDismissals() }
        #endif
    }

    #if canImport(AlarmKit)
    private static var observationStarted = false

    @available(iOS 26.0, *)
    private static func observeDismissals() async {
        // The first emission is just the current list, which on a cold launch
        // can legitimately lack an alarm dismissed while the app was dead.
        // Acting on it could end a session the user has since restarted, so the
        // snapshot only reconciles our stored id.
        var isSnapshot = true
        for await alarms in AlarmManager.shared.alarmUpdates {
            let suite = UserDefaults(suiteName: suiteName)
            guard
                let raw = suite?.string(forKey: alarmIdKey),
                let id = UUID(uuidString: raw)
            else {
                isSnapshot = false
                continue
            }
            if alarms.contains(where: { $0.id == id }) {
                isSnapshot = false
                continue
            }

            // cancelExisting() clears the key before cancelling, so reaching
            // here with the key still set means this wasn't us.
            let endMs = suite?.double(forKey: alarmEndKey) ?? 0
            suite?.removeObject(forKey: alarmIdKey)
            suite?.removeObject(forKey: alarmEndKey)

            let wasSnapshot = isSnapshot
            isSnapshot = false
            if wasSnapshot { continue }

            // Only an alarm that had actually started ringing, recently enough
            // that the session can still be the one on screen.
            let nowMs = Date().timeIntervalSince1970 * 1000
            guard endMs > 0, nowMs >= endMs, nowMs - endMs <= ackWindowMs else { continue }

            NSLog("FrogAlarmKit: alarm dismissed outside stopIntent — acknowledging session")
            _ = try? await FrogTimerControlIntent(action: "done").perform()
        }
    }

    @available(iOS 26.0, *)
    private static func cancelExisting() async {
        let suite = UserDefaults(suiteName: suiteName)
        guard
            let raw = suite?.string(forKey: alarmIdKey),
            let id = UUID(uuidString: raw)
        else { return }
        suite?.removeObject(forKey: alarmIdKey)
        suite?.removeObject(forKey: alarmEndKey)
        do {
            try AlarmManager.shared.cancel(id: id)
        } catch {
            NSLog("FrogAlarmKit: cancel failed: %@", error.localizedDescription)
        }
    }
    #endif
}
