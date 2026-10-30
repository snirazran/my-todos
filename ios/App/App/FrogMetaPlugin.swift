import Capacitor
import FBSDKCoreKit
import Foundation
import UIKit

@objc(FrogMetaPlugin)
public class FrogMetaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FrogMetaPlugin"
    public let jsName = "FrogMeta"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "activate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAnonymousId", returnType: CAPPluginReturnPromise),
    ]

    static var isConfigured: Bool {
        let appId = Bundle.main.object(forInfoDictionaryKey: "FacebookAppID") as? String ?? ""
        let token = Bundle.main.object(forInfoDictionaryKey: "FacebookClientToken") as? String ?? ""
        return !appId.isEmpty && !token.isEmpty
    }

    static func start(
        _ application: UIApplication,
        launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) {
        guard isConfigured else { return }
        _ = ApplicationDelegate.shared.application(
            application,
            didFinishLaunchingWithOptions: launchOptions
        )
    }

    @objc func activate(_ call: CAPPluginCall) {
        guard Self.isConfigured else {
            call.resolve(["active": false])
            return
        }
        DispatchQueue.main.async {
            AppEvents.shared.activateApp()
            call.resolve(["active": true])
        }
    }

    @objc func logEvent(_ call: CAPPluginCall) {
        guard Self.isConfigured else {
            call.resolve(["logged": false])
            return
        }
        guard let name = call.getString("name"), !name.isEmpty else {
            call.reject("name is required")
            return
        }
        var parameters: [AppEvents.ParameterName: Any] = [:]
        for (key, value) in call.getObject("params") ?? [:] {
            if value is String || value is NSNumber {
                parameters[AppEvents.ParameterName(key)] = value
            }
        }
        DispatchQueue.main.async {
            AppEvents.shared.logEvent(AppEvents.Name(name), parameters: parameters)
            call.resolve(["logged": true])
        }
    }

    @objc func getAnonymousId(_ call: CAPPluginCall) {
        guard Self.isConfigured else {
            call.resolve([:])
            return
        }
        call.resolve(["id": AppEvents.shared.anonymousID])
    }
}
