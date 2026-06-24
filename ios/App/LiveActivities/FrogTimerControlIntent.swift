import AppIntents
import ActivityKit
import Foundation
import UserNotifications

// Powers the Live Activity buttons (Pause / Resume / Stop / Done). Interactive
// Live Activity buttons require iOS 17+. perform() runs in the app's process
// (even if the app is closed): it updates the activity locally for instant
// feedback, then POSTs the action to the server (auth via the push token the
// plugin stashed in the App Group) so every other surface stays in sync.
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
        // Update the island locally and return immediately so the button releases
        // instantly (awaiting the network here keeps the button stuck in its
        // pending state — that's what made it feel dead). The server POST runs
        // under performExpiringActivity, which keeps the process alive past
        // perform()'s return so the request still lands when the app is
        // backgrounded/suspended (a plain detached Task is killed on re-suspend).
        let perfStart = Date()
        NSLog("FrogControl: perform start action=%@", action)
        await applyLocally()
        NSLog("FrogControl: applyLocally done action=%@ dt=%.0fms", action, Date().timeIntervalSince(perfStart) * 1000)
        let activityId = Activity<FrogTimerAttributes>.activities.first?.id
        let controlSeq = Self.nextControlSeq()
        Self.postToServer(action: action, controlSeq: controlSeq, activityId: activityId)
        return .result()
    }

    private func applyLocally() async {
        if action == "pause" || action == "stop" || action == "done" {
            UNUserNotificationCenter.current().removePendingNotificationRequests(
                withIdentifiers: ["880001", "880002"]
            )
        }
        guard let activity = Activity<FrogTimerAttributes>.activities.first else {
            NSLog("FrogControl: applyLocally no activity (count=%d) action=%@",
                  Activity<FrogTimerAttributes>.activities.count, action)
            return
        }
        NSLog("FrogControl: applyLocally found activity=%@ action=%@", activity.id, action)
        let s = activity.content.state
        let nowMs = Date().timeIntervalSince1970 * 1000

        switch action {
        case "pause":
            var ns = s
            let remaining = s.ringEnd > 0 ? max(0, (s.ringEnd - nowMs) / 1000) : s.ringValue
            ns.paused = true
            ns.finished = false
            ns.endTime = 0
            ns.ringStart = 0
            ns.ringEnd = 0
            ns.ringValue = remaining
            ns.timeText = Self.mmss(remaining)
            await activity.update(ActivityContent(state: ns, staleDate: nil))
        case "resume":
            var ns = s
            let end = nowMs + ns.ringValue * 1000
            ns.paused = false
            ns.finished = false
            ns.endTime = end
            ns.ringStart = end - ns.ringTotal * 1000
            ns.ringEnd = end
            await activity.update(
                ActivityContent(state: ns, staleDate: Date(timeIntervalSince1970: end / 1000))
            )
        case "stop", "done":
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

        // performExpiringActivity keeps the process from being suspended while the
        // request is in flight, but does NOT block perform() from returning — so
        // the button stays responsive and the POST still completes in the
        // background. The semaphore holds the assertion open until the request
        // finishes (or the OS signals expiry).
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

            let semaphore = DispatchSemaphore(value: 0)
            URLSession.shared.dataTask(with: request) { _, response, error in
                if let http = response as? HTTPURLResponse {
                    NSLog("FrogControl: POST %@ -> %d", action, http.statusCode)
                } else if let error {
                    NSLog("FrogControl: POST %@ failed: %@", action, error.localizedDescription)
                }
                semaphore.signal()
            }.resume()
            semaphore.wait()
        }
    }

    private static func mmss(_ seconds: Double) -> String {
        let total = Int(max(0, seconds.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
