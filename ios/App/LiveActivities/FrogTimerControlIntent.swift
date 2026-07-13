import AppIntents
import ActivityKit
import Foundation
import UserNotifications

// Powers the Live Activity buttons (Pause / Resume / Stop / Done / +5).
// Interactive Live Activity buttons require iOS 17+. perform() runs in the
// app's process (even if the app is closed): it updates the activity locally
// for instant feedback, then POSTs the action to the server (auth via the
// push token the plugin stashed in the App Group) so every other surface
// stays in sync.
//
// Deep-focus guard: while the +1 pledge is live, the first Pause tap arms a
// 3-second "tap again" state on the island instead of pausing — pausing
// forfeits the bonus fly, and that must never happen on a mis-tap.
//
// Must be a member of BOTH the App and LiveActivities targets.
@available(iOS 17.0, *)
struct FrogTimerControlIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Frogodoro Timer Control"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Action")
    var action: String

    init() {}
    init(action: String) { self.action = action }

    func perform() async throws -> some IntentResult {
        NSLog("FrogControl: perform start action=%@", action)

        // Deep-focus two-tap arm: swallow the first pause tap.
        if action == "pause", let activity = Self.currentActivity() {
            let s = activity.content.state
            if s.deepFocus == true && s.confirmPause != true && !s.paused {
                var armed = s
                armed.confirmPause = true
                await activity.update(ActivityContent(state: armed, staleDate: nil))
                Self.scheduleConfirmPauseRevert(activityId: activity.id)
                return .result()
            }
        }

        await applyLocally()
        let activityId = Self.currentActivity()?.id
        let controlSeq = Self.nextControlSeq()
        Self.postToServer(action: action, controlSeq: controlSeq, activityId: activityId)
        return .result()
    }

    // The set of live activities can contain a doomed duplicate mid-reconcile;
    // always prefer an active/stale one (mirrors the plugin's selection).
    static func currentActivity() -> Activity<FrogTimerAttributes>? {
        let all = Activity<FrogTimerAttributes>.activities
        return all.first { $0.activityState == .active || $0.activityState == .stale }
            ?? all.first
    }

    // Best-effort: clear the armed state if the user doesn't confirm within 3s.
    // performExpiringActivity keeps the process alive long enough.
    private static func scheduleConfirmPauseRevert(activityId: String) {
        ProcessInfo.processInfo.performExpiringActivity(withReason: "FrogConfirmPauseRevert") { expired in
            guard !expired else { return }
            Thread.sleep(forTimeInterval: 3.0)
            let semaphore = DispatchSemaphore(value: 0)
            Task {
                if let activity = currentActivity(),
                   activity.id == activityId,
                   activity.content.state.confirmPause == true {
                    var s = activity.content.state
                    s.confirmPause = false
                    await activity.update(ActivityContent(state: s, staleDate: nil))
                }
                semaphore.signal()
            }
            semaphore.wait()
        }
    }

    private func applyLocally() async {
        if action == "pause" || action == "stop" || action == "done" {
            UNUserNotificationCenter.current().removePendingNotificationRequests(
                withIdentifiers: ["880001", "880002"]
            )
        }
        guard let activity = Self.currentActivity() else {
            NSLog("FrogControl: applyLocally no activity (count=%d) action=%@",
                  Activity<FrogTimerAttributes>.activities.count, action)
            return
        }
        NSLog("FrogControl: applyLocally found activity=%@ action=%@", activity.id, action)
        let s = activity.content.state
        let nowMs = Date().timeIntervalSince1970 * 1000

        switch action {
        case "pause":
            FrogAlarmKit.cancel()
            var ns = s
            let remaining = s.ringEnd > 0 ? max(0, (s.ringEnd - nowMs) / 1000) : s.ringValue
            ns.paused = true
            ns.finished = false
            ns.confirmPause = false
            // Pausing breaks the pledge — drop the +1 badge immediately.
            ns.deepFocus = false
            ns.endTime = 0
            ns.ringStart = 0
            ns.ringEnd = 0
            ns.ringValue = remaining
            ns.timeText = Self.mmss(remaining)
            await activity.update(ActivityContent(state: ns, staleDate: nil))
        case "resume":
            var ns = s
            let end = nowMs + ns.ringValue * 1000
            FrogAlarmKit.sync(
                endTimeMs: end,
                phase: s.label.lowercased().contains("break") ? "break" : "focus",
                soundId: s.sound
            )
            ns.paused = false
            ns.finished = false
            ns.confirmPause = false
            ns.endTime = end
            ns.ringStart = end - ns.ringTotal * 1000
            ns.ringEnd = end
            await activity.update(
                ActivityContent(state: ns, staleDate: Date(timeIntervalSince1970: end / 1000))
            )
        case "more5":
            // 5 more minutes of focus, alarm silenced, island back to running.
            var ns = s
            let total: Double = 5 * 60
            let end = nowMs + total * 1000
            FrogAlarmKit.sync(endTimeMs: end, phase: "focus", soundId: s.sound)
            ns.paused = false
            ns.finished = false
            ns.confirmPause = false
            ns.label = "Focus"
            ns.subtitle = ""
            ns.endTime = end
            ns.ringValue = total
            ns.ringTotal = total
            ns.ringStart = nowMs
            ns.ringEnd = end
            await activity.update(
                ActivityContent(state: ns, staleDate: Date(timeIntervalSince1970: end / 1000))
            )
        case "stop", "done":
            FrogAlarmKit.cancel()
            await activity.end(nil, dismissalPolicy: .immediate)
        default:
            break
        }
    }

    private static func nextControlSeq() -> Int {
        let suite = UserDefaults(suiteName: "group.io.frog.tasks.liveactivities")
        let next = suite?.integer(forKey: "frogControlSeq") ?? 0
        let value = next + 1
        suite?.set(value, forKey: "frogControlSeq")
        return value
    }

    private static func postToServer(action: String, controlSeq: Int, activityId: String?) {
        let suite = UserDefaults(suiteName: "group.io.frog.tasks.liveactivities")
        // Prefer the stable control (FCM) token; fall back to the volatile push
        // tokens only if it isn't set yet.
        let token =
            suite?.string(forKey: "frogControlToken")
            ?? suite?.string(forKey: "frogActivityPushToken")
            ?? suite?.string(forKey: "frogPushToStartToken")
        let origin = suite?.string(forKey: "frogApiOrigin") ?? "https://frogress.com"

        NSLog("FrogControl: action=%@ seq=%d origin=%@ hasToken=%@", action, controlSeq, origin, token != nil ? "yes" : "no")

        guard
            let token,
            let url = URL(string: "\(origin)/api/frogodoro/control")
        else {
            NSLog("FrogControl: aborting — missing token or invalid origin")
            return
        }

        // performExpiringActivity keeps the process from being suspended while
        // the request is in flight, but does NOT block perform() from returning.
        // Up to 3 attempts with short backoff — a dropped pause POST otherwise
        // leaves the server running while the island shows paused.
        ProcessInfo.processInfo.performExpiringActivity(withReason: "FrogTimerControl") { expired in
            guard !expired else {
                NSLog("FrogControl: expiring activity ended before POST completed")
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 8
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var payload: [String: Any] = ["action": action, "token": token, "controlSeq": controlSeq]
            if let activityId { payload["activityId"] = activityId }
            request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

            for attempt in 1...3 {
                let semaphore = DispatchSemaphore(value: 0)
                var succeeded = false
                URLSession.shared.dataTask(with: request) { _, response, error in
                    if let http = response as? HTTPURLResponse {
                        NSLog("FrogControl: POST %@ attempt %d -> %d", action, attempt, http.statusCode)
                        succeeded = (200..<300).contains(http.statusCode)
                    } else if let error {
                        NSLog("FrogControl: POST %@ attempt %d failed: %@", action, attempt, error.localizedDescription)
                    }
                    semaphore.signal()
                }.resume()
                semaphore.wait()
                if succeeded { return }
                if attempt < 3 { Thread.sleep(forTimeInterval: Double(attempt) * 1.5) }
            }
        }
    }

    private static func mmss(_ seconds: Double) -> String {
        let total = Int(max(0, seconds.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
