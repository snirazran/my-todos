import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.1, *)
private extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        let r = Double((value & 0xFF0000) >> 16) / 255
        let g = Double((value & 0x00FF00) >> 8) / 255
        let b = Double(value & 0x0000FF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

@available(iOS 16.1, *)
private func endDate(_ state: FrogTimerAttributes.ContentState) -> Date {
    Date(timeIntervalSince1970: state.endTime / 1000)
}

@available(iOS 16.1, *)
private func ringFraction(_ state: FrogTimerAttributes.ContentState) -> Double {
    guard state.ringTotal > 0 else { return 0 }
    return min(1, max(0, state.ringValue / state.ringTotal))
}

@available(iOS 16.1, *)
private struct TimeView: View {
    let state: FrogTimerAttributes.ContentState
    var font: Font

    var body: some View {
        Group {
            if state.paused || state.endTime <= 0 {
                Text(state.timeText)
            } else {
                Text(timerInterval: Date()...endDate(state), countsDown: true)
            }
        }
        .font(font)
        .monospacedDigit()
        .foregroundColor(Color(hex: state.color))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

@available(iOS 16.1, *)
private struct RingView: View {
    let state: FrogTimerAttributes.ContentState
    var size: CGFloat
    var lineWidth: CGFloat

    var body: some View {
        let tint = Color(hex: state.color)
        let running = !state.paused && state.endTime > 0 && state.ringEnd > state.ringStart
        ZStack {
            // Both states use the same scaled circular ProgressView so the ring
            // size + thickness are identical: a self-ticking timer while running,
            // a fixed-fraction ring while paused. (System renders at ~20pt, so
            // scale up to the target size.)
            Group {
                if running {
                    let start = Date(timeIntervalSince1970: state.ringStart / 1000)
                    let end = Date(timeIntervalSince1970: state.ringEnd / 1000)
                    ProgressView(timerInterval: start...end, countsDown: true) {
                        EmptyView()
                    } currentValueLabel: {
                        EmptyView()
                    }
                    .progressViewStyle(.circular)
                    .tint(tint)
                } else {
                    ProgressView(value: ringFraction(state), total: 1.0)
                        .progressViewStyle(.circular)
                        .tint(tint.opacity(state.paused ? 0.6 : 1))
                }
            }
            .scaleEffect(size / 20.0)
            .frame(width: size, height: size)

            if state.paused {
                Image(systemName: "pause.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: size * 0.32, height: size * 0.32)
                    .foregroundColor(tint.opacity(0.9))
            }
        }
        .frame(width: size, height: size)
    }
}

@available(iOS 16.1, *)
struct FrogTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FrogTimerAttributes.self) { context in
            lockScreen(context.state)
                .padding(16)
                .activityBackgroundTint(Color.black.opacity(0.35))
                .activitySystemActionForegroundColor(Color(hex: context.state.color))
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    RingView(state: state, size: 34, lineWidth: 5)
                        .padding(.horizontal, 12)
                        .frame(maxHeight: .infinity, alignment: .center)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(state.label)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: state.color))
                        .lineLimit(1)
                        .frame(maxHeight: .infinity, alignment: .center)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimeView(state: state, font: .system(size: 26, weight: .light))
                        .frame(maxWidth: 90, alignment: .trailing)
                        .frame(maxHeight: .infinity, alignment: .center)
                }
            } compactLeading: {
                RingView(state: state, size: 20, lineWidth: 2.5)
            } compactTrailing: {
                TimeView(state: state, font: .system(size: 14))
                    .frame(width: 54, alignment: .trailing)
            } minimal: {
                RingView(state: state, size: 20, lineWidth: 2.5)
            }
            .keylineTint(Color(hex: state.color))
        }
    }

    @ViewBuilder
    private func lockScreen(_ state: FrogTimerAttributes.ContentState) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                TimeView(state: state, font: .system(size: 40, weight: .bold))
                HStack(spacing: 6) {
                    Text(state.label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Color(hex: state.color))
                    Text(state.subtitle)
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.56))
                        .lineLimit(1)
                }
            }
            Spacer()
            RingView(state: state, size: 34, lineWidth: 4)
                .padding(.trailing, 12)
        }
    }
}
