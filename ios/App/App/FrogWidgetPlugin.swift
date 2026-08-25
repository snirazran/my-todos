import Capacitor
import Foundation
import UIKit
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

    private var presentingQuickAdd = false

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        // Covers the cold launch, where the notification has already fired by
        // the time the plugin loads.
        presentQuickAddIfRequested()
    }

    @objc private func appDidBecomeActive() {
        presentQuickAddIfRequested()
    }

    /// Puts up the native composer if the widget's add button asked for one.
    /// The flag is consumed as it is read, so a second foreground does not
    /// reopen a composer the user already dismissed.
    private func presentQuickAddIfRequested() {
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.presentingQuickAdd else { return }
            guard FrogWidgetStore.takeQuickAddRequest() else { return }
            guard let host = self.bridge?.viewController else { return }

            let composer = FrogQuickAddViewController()
            composer.modalPresentationStyle = .overFullScreen
            composer.onFinish = { [weak self] text in
                self?.presentingQuickAdd = false
                guard let text else { return }
                FrogWidgetStore.queueAdd(text: text)
                FrogWidgetStore.applyLocalAdd(text: text)
                // The app never backgrounded, so the webview has no resume to
                // react to — tell it there is something to replay.
                self?.notifyListeners("widgetQueued", data: [:])
            }
            self.presentingQuickAdd = true
            host.present(composer, animated: false)
        }
    }

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
