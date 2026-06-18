import Foundation
import Capacitor
import ActivityKit

// Native Live Activity controller for the Frogodoro timer. Replaces the
// capacitor-live-activities plugin for the timer island so we can (a) update
// run<->pause in place and (b) register a push-to-start token, which lets the
// server create the island via APNs even when the app is closed.
//
// Token plumbing stays in JS: this plugin emits `pushToken` (per-activity update
// token) and `pushToStartToken` events; the web layer POSTs them to the server
// with the user's session cookie (see src/lib/liveTimer.ts).
@objc(FrogLiveActivityPlugin)
public class FrogLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FrogLiveActivityPlugin"
    public let jsName = "FrogLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerPushToStart", returnType: CAPPluginReturnPromise),
    ]

    @available(iOS 16.2, *)
    private var current: Activity<FrogTimerAttributes>? {
        get { _current as? Activity<FrogTimerAttributes> }
        set { _current = newValue }
    }
    private var _current: Any?

    @objc func show(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        guard let data = call.getObject("data") else {
            call.reject("Missing data")
            return
        }
        let state = Self.state(from: data)

        Task {
            do {
                if let activity = self.activeActivity() {
                    await activity.update(
                        ActivityContent(state: state, staleDate: self.staleDate(state))
                    )
                    call.resolve(["activityId": activity.id])
                } else {
                    let activity = try Activity.request(
                        attributes: FrogTimerAttributes(),
                        content: ActivityContent(state: state, staleDate: self.staleDate(state)),
                        pushType: .token
                    )
                    self.current = activity
                    self.observe(activity)
                    call.resolve(["activityId": activity.id])
                }
            } catch {
                call.reject("startActivity failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Task {
            for activity in Activity<FrogTimerAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            self.current = nil
            call.resolve()
        }
    }

    @objc func registerPushToStart(_ call: CAPPluginCall) {
        if #available(iOS 17.2, *) {
            Task {
                for await tokenData in Activity<FrogTimerAttributes>.pushToStartTokenUpdates {
                    let token = tokenData.map { String(format: "%02x", $0) }.joined()
                    self.notifyListeners("pushToStartToken", data: ["token": token])
                }
            }
        }
        call.resolve()
    }

    @available(iOS 16.2, *)
    private func activeActivity() -> Activity<FrogTimerAttributes>? {
        if let current = self.current,
           current.activityState == .active || current.activityState == .stale {
            return current
        }
        let live = Activity<FrogTimerAttributes>.activities.first {
            $0.activityState == .active || $0.activityState == .stale
        }
        self.current = live
        return live
    }

    @available(iOS 16.2, *)
    private func observe(_ activity: Activity<FrogTimerAttributes>) {
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                self.notifyListeners("pushToken", data: ["activityId": activity.id, "token": token])
            }
        }
    }

    @available(iOS 16.2, *)
    private func staleDate(_ state: FrogTimerAttributes.ContentState) -> Date? {
        guard !state.paused, state.endTime > 0 else { return nil }
        return Date(timeIntervalSince1970: state.endTime / 1000)
    }

    @available(iOS 16.2, *)
    private static func state(from data: [String: Any]) -> FrogTimerAttributes.ContentState {
        func double(_ key: String) -> Double {
            if let n = data[key] as? Double { return n }
            if let n = data[key] as? Int { return Double(n) }
            if let n = data[key] as? NSNumber { return n.doubleValue }
            return 0
        }
        return FrogTimerAttributes.ContentState(
            color: data["color"] as? String ?? "#16a34a",
            label: data["label"] as? String ?? "",
            subtitle: data["subtitle"] as? String ?? "",
            endTime: double("endTime"),
            timeText: data["timeText"] as? String ?? "",
            timeFont: double("timeFont"),
            ringValue: double("ringValue"),
            ringTotal: double("ringTotal"),
            ringStart: double("ringStart"),
            ringEnd: double("ringEnd"),
            paused: data["paused"] as? Bool ?? false
        )
    }
}
