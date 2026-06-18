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
    var lineWidth: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(hex: state.color).opacity(0.25), lineWidth: lineWidth)
            if state.paused || state.endTime <= 0 {
                Circle()
                    .trim(from: 0, to: ringFraction(state))
                    .stroke(
                        Color(hex: state.color),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
            } else {
                let start = Date(timeIntervalSince1970: state.ringStart / 1000)
                let end = Date(timeIntervalSince1970: state.ringEnd / 1000)
                ProgressView(timerInterval: start...end, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.circular)
                .tint(Color(hex: state.color))
            }
        }
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
                    RingView(state: state, lineWidth: 5)
                        .frame(width: 34, height: 34)
                        .padding(.horizontal, 12)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(state.label)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: state.color))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimeView(state: state, font: .system(size: 26, weight: .light))
                        .frame(maxWidth: 90, alignment: .trailing)
                }
            } compactLeading: {
                RingView(state: state, lineWidth: 2.5)
                    .frame(width: 20, height: 20)
            } compactTrailing: {
                TimeView(state: state, font: .system(size: 14))
                    .frame(width: 54, alignment: .trailing)
            } minimal: {
                RingView(state: state, lineWidth: 2.5)
                    .frame(width: 20, height: 20)
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
            RingView(state: state, lineWidth: 4)
                .frame(width: 36, height: 36)
        }
    }
}
