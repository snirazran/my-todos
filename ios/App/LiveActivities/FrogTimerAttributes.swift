import ActivityKit
import Foundation

// Shared between the App target (FrogLiveActivityPlugin) and the LiveActivities
// widget extension. The ContentState mirrors the web's `LiveActivityData`
// (src/lib/liveActivityData.ts) field-for-field so the same JSON the server
// already builds can drive a local update, a remote APNs update, and a remote
// push-to-start — no per-surface translation.
@available(iOS 16.1, *)
struct FrogTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var color: String
        var label: String
        var subtitle: String
        var endTime: Double      // epoch ms; 0 when paused
        var timeText: String     // "MM:SS" shown when paused
        var timeFont: Double
        var ringValue: Double    // seconds remaining
        var ringTotal: Double    // seconds in the phase
        var ringStart: Double    // epoch ms (run start) for the live ring
        var ringEnd: Double       // epoch ms (run end) for the live ring
        var paused: Bool
        var finished: Bool?      // phase ended, alarm ringing, awaiting Done
    }
}
