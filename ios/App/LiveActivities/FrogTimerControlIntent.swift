import AppIntents
import ActivityKit
import Foundation

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
        // Apply the change to the island instantly, then return so the button
        // releases immediately (the system keeps the button pending until
        // perform() returns). The server sync runs detached so it doesn't add
        // round-trip latency to the tap.
        await applyLocally()
        let act = action
        Task { await Self.postToServer(action: act) }
        return .result()
    }

    private func applyLocally() async {
        guard let activity = Activity<FrogTimerAttributes>.activities.first else { return }
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

    private static func postToServer(action: String) async {
        let suite = UserDefaults(suiteName: "group.io.frog.tasks.liveactivities")
        // Prefer the stable control (FCM) token; fall back to the volatile push
        // tokens only if it isn't set yet.
        let token =
            suite?.string(forKey: "frogControlToken")
            ?? suite?.string(forKey: "frogActivityPushToken")
            ?? suite?.string(forKey: "frogPushToStartToken")
        let origin = suite?.string(forKey: "frogApiOrigin") ?? "https://frogress.com"

        guard
            let token,
            let url = URL(string: "\(origin)/api/frogodoro/control")
        else {
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(
            withJSONObject: ["action": action, "token": token]
        )

        _ = try? await URLSession.shared.data(for: request)
    }

    private static func mmss(_ seconds: Double) -> String {
        let total = Int(max(0, seconds.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
