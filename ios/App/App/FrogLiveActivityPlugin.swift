import Foundation
import UIKit
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
        CAPPluginMethod(name: "setApiOrigin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setControlToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
    ]

    @available(iOS 16.2, *)
    private var current: Activity<FrogTimerAttributes>? {
        get { _current as? Activity<FrogTimerAttributes> }
        set { _current = newValue }
    }
    private var _current: Any?

    // All activity operations run through this serial chain so concurrent
    // show()/end() calls can never race into creating duplicate activities.
    // Each op awaits the previous one before running.
    private var opChain: Task<Void, Never>?

    private func enqueue(_ work: @escaping () async -> Void) {
        let previous = opChain
        opChain = Task {
            await previous?.value
            await work()
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        guard let data = call.getObject("data") else {
            call.reject("Missing data")
            return
        }
        let state = Self.state(from: data)

        // Keep the AlarmKit finish alarm in step with the island: running →
        // scheduled at endTime; paused/finished → cancelled (APNs alert covers
        // the killed-app case; AlarmKit covers Silent/Focus while alive).
        if state.paused || state.finished == true || state.endTime <= 0 {
            FrogAlarmKit.cancel()
        } else {
            FrogAlarmKit.sync(
                endTimeMs: state.endTime,
                phase: state.label.lowercased().contains("break") ? "break" : "focus",
                soundId: state.sound
            )
        }

        enqueue {
            do {
                let content = ActivityContent(state: state, staleDate: self.staleDate(state))

                // Reconcile to exactly one activity. Reuse our own, else adopt an
                // existing live one, else create. Then end any extras so the set
                // never grows (which would churn the push token).
                var activity = self.current
                if activity == nil
                    || !(activity!.activityState == .active || activity!.activityState == .stale) {
                    activity = Activity<FrogTimerAttributes>.activities.first {
                        $0.activityState == .active || $0.activityState == .stale
                    }
                }

                if let activity {
                    self.current = activity
                    self.observe(activity)
                    if state.finished == true {
                        let sound: AlertConfiguration.AlertSound
                        if let file = Self.alertSound(for: state.sound) {
                            sound = .named(file)
                        } else {
                            sound = .default
                        }
                        await activity.update(
                            content,
                            alertConfiguration: AlertConfiguration(
                                title: "Time's up",
                                body: LocalizedStringResource(stringLiteral: state.subtitle),
                                sound: sound
                            )
                        )
                    } else {
                        await activity.update(content)
                    }
                    for extra in Activity<FrogTimerAttributes>.activities where extra.id != activity.id {
                        await extra.end(nil, dismissalPolicy: .immediate)
                    }
                    call.resolve(["activityId": activity.id])
                } else {
                    guard UIApplication.shared.applicationState == .active else {
                        call.resolve(["skipped": true, "reason": "notForeground"])
                        return
                    }
                    let created = try Activity.request(
                        attributes: FrogTimerAttributes(),
                        content: content,
                        pushType: .token
                    )
                    self.current = created
                    self.observe(created)
                    call.resolve(["activityId": created.id])
                }
            } catch {
                call.reject("startActivity failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        FrogAlarmKit.cancel()
        enqueue {
            for activity in Activity<FrogTimerAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            self.current = nil
            self.observeTask?.cancel()
            self.observeTask = nil
            self.observedId = nil
            call.resolve()
        }
    }

    @objc func setApiOrigin(_ call: CAPPluginCall) {
        if let origin = call.getString("origin"), !origin.isEmpty {
            UserDefaults(suiteName: "group.io.frog.tasks.liveactivities")?
                .set(origin, forKey: "frogApiOrigin")
        }
        call.resolve()
    }

    // The stable per-install identity (FCM token) the Live Activity button intent
    // uses to authenticate /control. Unlike the activity push token it doesn't
    // change when the activity is recreated, so buttons keep working.
    @objc func setControlToken(_ call: CAPPluginCall) {
        if let token = call.getString("token"), !token.isEmpty {
            UserDefaults(suiteName: "group.io.frog.tasks.liveactivities")?
                .set(token, forKey: "frogControlToken")
        }
        call.resolve()
    }

    @objc func getState(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["active": false])
            return
        }
        guard let activity = Self.activeActivity(preferred: current) else {
            call.resolve(["active": false])
            return
        }
        let state = activity.content.state
        call.resolve([
            "active": true,
            "activityId": activity.id,
            "color": state.color,
            "label": state.label,
            "subtitle": state.subtitle,
            "endTime": state.endTime,
            "timeText": state.timeText,
            "timeFont": state.timeFont,
            "ringValue": state.ringValue,
            "ringTotal": state.ringTotal,
            "ringStart": state.ringStart,
            "ringEnd": state.ringEnd,
            "paused": state.paused,
            "finished": state.finished ?? false,
        ])
    }

    @objc func registerPushToStart(_ call: CAPPluginCall) {
        if #available(iOS 17.2, *) {
            if let tokenData = Activity<FrogTimerAttributes>.pushToStartToken {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                Self.storeToken(token, key: "frogPushToStartToken")
                self.notifyListeners("pushToStartToken", data: ["token": token])
            }
            Task {
                for await tokenData in Activity<FrogTimerAttributes>.pushToStartTokenUpdates {
                    let token = tokenData.map { String(format: "%02x", $0) }.joined()
                    Self.storeToken(token, key: "frogPushToStartToken")
                    self.notifyListeners("pushToStartToken", data: ["token": token])
                }
            }
        }
        call.resolve()
    }

    private var observeTask: Task<Void, Never>?
    private var observedId: String?

    @available(iOS 16.2, *)
    private func observe(_ activity: Activity<FrogTimerAttributes>) {
        // Only one observer per activity — re-observing the same one would stack
        // duplicate pushToken listeners.
        if observedId == activity.id { return }
        observeTask?.cancel()
        observedId = activity.id
        observeTask = Task {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                Self.storeToken(token, key: "frogActivityPushToken")
                self.notifyListeners("pushToken", data: ["activityId": activity.id, "token": token])
            }
        }
    }

    // Mirror the push tokens into the shared App Group so the Live Activity
    // button intent (which runs even when the app is closed) can authenticate
    // its control calls to the server.
    private static func storeToken(_ token: String, key: String) {
        UserDefaults(suiteName: "group.io.frog.tasks.liveactivities")?.set(token, forKey: key)
    }

    private static var activityObservationStarted = false
    private static var activityObservationTask: Task<Void, Never>?
    private static var observedUploadIds = Set<String>()

    static func startActivityObservation() {
        if activityObservationStarted { return }
        activityObservationStarted = true
        activityObservationTask = Task {
            if #available(iOS 16.2, *) {
                await observeActivities()
            }
        }
    }

    @available(iOS 16.2, *)
    private static func observeActivities() async {
        for activity in Activity<FrogTimerAttributes>.activities {
            observeTokenForUpload(activity)
        }
        for await activity in Activity<FrogTimerAttributes>.activityUpdates {
            observeTokenForUpload(activity)
        }
    }

    @available(iOS 16.2, *)
    private static func observeTokenForUpload(_ activity: Activity<FrogTimerAttributes>) {
        if observedUploadIds.contains(activity.id) { return }
        observedUploadIds.insert(activity.id)
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                storeToken(token, key: "frogActivityPushToken")
                uploadActivityToken(activityId: activity.id, token: token)
            }
        }
    }

    private static func uploadActivityToken(activityId: String, token: String) {
        let suite = UserDefaults(suiteName: "group.io.frog.tasks.liveactivities")
        let auth =
            suite?.string(forKey: "frogControlToken")
            ?? suite?.string(forKey: "frogPushToStartToken")
        let origin = suite?.string(forKey: "frogApiOrigin") ?? "https://frogress.com"
        guard let auth, let url = URL(string: "\(origin)/api/frogodoro/live-activity") else { return }
        ProcessInfo.processInfo.performExpiringActivity(withReason: "FrogActivityTokenUpload") { expired in
            guard !expired else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "PUT"
            request.timeoutInterval = 8
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: [
                "activityId": activityId,
                "pushToken": token,
                "authToken": auth,
                "clientNow": Int(Date().timeIntervalSince1970 * 1000),
            ])
            let semaphore = DispatchSemaphore(value: 0)
            URLSession.shared.dataTask(with: request) { _, response, error in
                if let http = response as? HTTPURLResponse {
                    NSLog("FrogActivityToken: PUT -> %d", http.statusCode)
                } else if let error {
                    NSLog("FrogActivityToken: PUT failed: %@", error.localizedDescription)
                }
                semaphore.signal()
            }.resume()
            semaphore.wait()
        }
    }

    @available(iOS 16.2, *)
    private static func activeActivity(
        preferred: Activity<FrogTimerAttributes>?
    ) -> Activity<FrogTimerAttributes>? {
        if let preferred,
           preferred.activityState == .active || preferred.activityState == .stale {
            return preferred
        }
        return Activity<FrogTimerAttributes>.activities.first {
            $0.activityState == .active || $0.activityState == .stale
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
            paused: data["paused"] as? Bool ?? false,
            finished: data["finished"] as? Bool ?? false,
            fliesCaught: double("fliesCaught"),
            fliesPotential: double("fliesPotential"),
            deepFocus: data["deepFocus"] as? Bool ?? false,
            sound: data["sound"] as? String ?? "",
            confirmPause: false
        )
    }

    // Maps a timer sound id to its bundled .caf (Library/Sounds); nil = default.
    static func alertSound(for soundId: String?) -> String? {
        guard let soundId, !soundId.isEmpty, soundId != "none" else { return nil }
        let known = ["frog", "classic", "dreamscape", "lofi", "stardust"]
        return known.contains(soundId) ? "\(soundId).caf" : nil
    }
}
