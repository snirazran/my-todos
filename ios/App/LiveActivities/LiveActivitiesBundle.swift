import WidgetKit
import SwiftUI

@main
struct LiveActivitiesBundle: WidgetBundle {
    var body: some Widget {
        FrogTimerLiveActivity()
        if #available(iOS 18.0, *) {
            FrogFocusControlWidget()
        }
    }
}
