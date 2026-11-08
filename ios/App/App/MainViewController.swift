import UIKit
import Capacitor

// App-local Capacitor plugins aren't auto-discovered the way pod plugins are,
// so the FrogLiveActivity plugin is registered explicitly here (the iOS
// equivalent of Android's registerPlugin(FrogTimerPlugin.class) in MainActivity).
class MainViewController: CAPBridgeViewController, UIScrollViewDelegate {
    private let statusTapCatcher = UIScrollView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FrogLiveActivityPlugin())
        bridge?.registerPluginInstance(FrogWidgetPlugin())
        bridge?.registerPluginInstance(FrogMetaPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.scrollsToTop = false
        statusTapCatcher.contentSize = CGSize(width: 1, height: 2)
        statusTapCatcher.contentOffset = CGPoint(x: 0, y: 1)
        statusTapCatcher.scrollsToTop = true
        statusTapCatcher.isUserInteractionEnabled = false
        statusTapCatcher.delegate = self
        view.insertSubview(statusTapCatcher, at: 0)
    }

    func scrollViewShouldScrollToTop(_ scrollView: UIScrollView) -> Bool {
        if scrollView === statusTapCatcher {
            bridge?.triggerWindowJSEvent(eventName: "statusTap")
        }
        return false
    }
}
