import UIKit
import Capacitor

// App-local Capacitor plugins aren't auto-discovered the way pod plugins are,
// so the FrogLiveActivity plugin is registered explicitly here (the iOS
// equivalent of Android's registerPlugin(FrogTimerPlugin.class) in MainActivity).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FrogLiveActivityPlugin())
    }
}
