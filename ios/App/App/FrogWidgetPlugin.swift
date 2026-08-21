import Capacitor
import Foundation
import WidgetKit

/**
 Bridge between the webview and the home screen widget. The webview pushes a
 snapshot of today; the widget pushes back anything the user did while the app
 was closed. See FrogWidgetStore for the contract.

 iOS has no equivalent of Android's requestPinAppWidget, so `requestPin` always
 reports false and the web layer falls back to walking the user through the
 widget gallery by hand.
 */
@objc(FrogWidgetPlugin)
public class FrogWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FrogWidgetPlugin"
    public let jsName = "FrogWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPinState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPin", returnType: CAPPluginReturnPromise),
    ]

    @objc func setState(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload") else {
            call.reject("payload is required")
            return
        }
        FrogWidgetStore.setState(payload)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        FrogWidgetStore.clearState()
        call.resolve()
    }

    @objc func drainQueue(_ call: CAPPluginCall) {
        call.resolve(["actions": FrogWidgetStore.drainQueue()])
    }

    @objc func getPinState(_ call: CAPPluginCall) {
        // WidgetCenter can tell us whether the user has actually placed one,
        // which is what decides whether the in-app ask is still worth showing.
        WidgetCenter.shared.getCurrentConfigurations { result in
            var state = "available"
            if case let .success(widgets) = result {
                let placed = widgets.contains { $0.kind == FrogWidgetStore.kind }
                if placed { state = "pinned" }
            }
            call.resolve(["state": state])
        }
    }

    @objc func requestPin(_ call: CAPPluginCall) {
        call.resolve(["requested": false])
    }
}
