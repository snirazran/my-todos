import UIKit
import Capacitor
import GoogleSignIn
import FirebaseCore
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Initialize Firebase so @capacitor-firebase/messaging can mint FCM tokens.
        FirebaseApp.configure()
        FrogLiveActivityPlugin.startActivityObservation()
        FrogAlarmKit.startObservation()
        installAlarmSounds()
        clearAppBadge(application)
        // Override point for customization after application launch.
        return true
    }

    /// Copies the bundled alarm .caf files (shipped inside Capacitor's web
    /// assets at public/alarms/ios) into Library/Sounds, where iOS looks up
    /// custom notification/Live Activity alert sounds by filename. Idempotent;
    /// re-copies when the bundled file size changes (asset update).
    private func installAlarmSounds() {
        DispatchQueue.global(qos: .utility).async {
            let fm = FileManager.default
            guard
                let library = fm.urls(for: .libraryDirectory, in: .userDomainMask).first,
                let sourceDir = Bundle.main.url(
                    forResource: "ios",
                    withExtension: nil,
                    subdirectory: "public/alarms"
                )
            else { return }
            let soundsDir = library.appendingPathComponent("Sounds", isDirectory: true)
            try? fm.createDirectory(at: soundsDir, withIntermediateDirectories: true)
            guard
                let files = try? fm.contentsOfDirectory(
                    at: sourceDir,
                    includingPropertiesForKeys: [.fileSizeKey]
                )
            else { return }
            for src in files where src.pathExtension == "caf" {
                let dst = soundsDir.appendingPathComponent(src.lastPathComponent)
                let srcSize = (try? src.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                let dstSize =
                    (try? dst.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? -1
                if srcSize == dstSize { continue }
                try? fm.removeItem(at: dst)
                try? fm.copyItem(at: src, to: dst)
            }
        }
    }

    /// Silent `timer_control` pushes let a change made on another device reach
    /// this phone's *local* alarms while no JS is running. Without it, stopping
    /// a timer from the web with this app killed leaves the phase-end
    /// notification and the AlarmKit alarm armed, and they ring anyway — a
    /// session that ended long ago suddenly going off.
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        guard (userInfo["type"] as? String) == "timer_control" else {
            completionHandler(.noData)
            return
        }
        // While the app is up the webview owns local alarms — it reconciles off
        // the live stream and would only fight this handler.
        guard application.applicationState != .active else {
            completionHandler(.noData)
            return
        }
        applyTimerControlPush(userInfo)
        completionHandler(.newData)
    }

    private func applyTimerControlPush(_ userInfo: [AnyHashable: Any]) {
        let suite = UserDefaults(suiteName: "group.io.frog.tasks.liveactivities")
        let action = userInfo["action"] as? String ?? ""

        // Mirrors the Android service: a push carrying an older revision than the
        // one already applied is a reordered delivery and must not undo newer
        // state. Stops carry no revision, so they are always honoured.
        let rev = AppDelegate.number(userInfo["rev"])
        if rev > 0 {
            let applied = suite?.double(forKey: "frogTimerControlRev") ?? 0
            if rev <= applied { return }
            suite?.set(rev, forKey: "frogTimerControlRev")
        }

        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["880001", "880002"])

        guard action == "start" || action == "resume" else {
            FrogAlarmKit.cancel()
            NSLog("FrogTimerPush: %@ — local alarms cancelled", action)
            return
        }

        let endTimeMs = AppDelegate.number(userInfo["endTime"])
        guard endTimeMs > Date().timeIntervalSince1970 * 1000 + 1000 else {
            FrogAlarmKit.cancel()
            return
        }

        let phase = (userInfo["phase"] as? String) == "break" ? "break" : "focus"
        let sound = userInfo["sound"] as? String

        FrogAlarmKit.sync(endTimeMs: endTimeMs, phase: phase, soundId: sound)
        AppDelegate.schedulePhaseEndNotification(endTimeMs: endTimeMs, phase: phase, sound: sound)
        NSLog("FrogTimerPush: %@ — local alarms re-armed for %.0f", action, endTimeMs)
    }

    private static func schedulePhaseEndNotification(
        endTimeMs: Double,
        phase: String,
        sound: String?
    ) {
        let content = UNMutableNotificationContent()
        if phase == "break" {
            content.title = "Break finished"
            content.body = "Ready to focus? Start again whenever you are."
        } else {
            content.title = "Focus timer finished"
            content.body = "Time for a break. You earned it!"
        }
        if let file = FrogLiveActivityPlugin.alertSound(for: sound) {
            content.sound = UNNotificationSound(named: UNNotificationSoundName(file))
        } else {
            content.sound = .default
        }
        content.userInfo = ["type": phase == "break" ? "break_complete" : "timer_complete",
                            "path": "/timer"]
        // Same category the JS-scheduled one uses, so swiping this away is also
        // reported as an explicit dismissal and acknowledges the session.
        content.categoryIdentifier = "FROG_TIMER_END"

        let interval = max(1, endTimeMs / 1000 - Date().timeIntervalSince1970)
        let request = UNNotificationRequest(
            identifier: "880001",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        )
        UNUserNotificationCenter.current().add(request)
    }

    private static func number(_ value: Any?) -> Double {
        if let n = value as? Double { return n }
        if let n = value as? Int { return Double(n) }
        if let n = value as? NSNumber { return n.doubleValue }
        if let s = value as? String { return Double(s) ?? 0 }
        return 0
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        clearAppBadge(application)
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        // Forward the URL to Google Sign-In if it can handle it
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func clearAppBadge(_ application: UIApplication) {
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(0)
        } else {
            application.applicationIconBadgeNumber = 0
        }
    }

}
