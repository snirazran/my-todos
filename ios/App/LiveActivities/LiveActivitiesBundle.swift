import WidgetKit
import SwiftUI

@main
struct LiveActivitiesBundle: WidgetBundle {
    var body: some Widget {
        FrogTimerLiveActivity()
        FrogTasksWidget()
        if #available(iOS 18.0, *) {
            FrogFocusControlWidget()
        }
    }
}
