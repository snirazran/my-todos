import WidgetKit
import SwiftUI
import LiveActivitiesKit

@main
struct LiveActivitiesBundle: WidgetBundle {
    var body: some Widget {
        LiveActivities()
        DynamicActivityWidget()
    }
}
