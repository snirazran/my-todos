import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

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
private func resolvedState(
    _ context: ActivityViewContext<FrogTimerAttributes>
) -> FrogTimerAttributes.ContentState {
    var s = context.state
    if context.isStale && s.finished != true {
        let phaseLabel = s.label
        s.finished = true
        s.paused = true
        s.endTime = 0
        s.timeText = "0:00"
        s.label = "Time's up"
        if s.subtitle.isEmpty || s.subtitle == "Paused" {
            s.subtitle = phaseLabel.isEmpty ? "Session done" : "\(phaseLabel) done"
        }
    }
    return s
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

            if state.finished == true {
                Image(systemName: "bell.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: size * 0.34, height: size * 0.34)
                    .foregroundColor(tint)
            } else if state.paused {
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

@available(iOS 17.0, *)
private struct TimerControlButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.13 : 1)
            .brightness(configuration.isPressed ? 0.08 : 0)
            .animation(
                .interactiveSpring(response: 0.16, dampingFraction: 0.62, blendDuration: 0.02),
                value: configuration.isPressed
            )
    }
}

@available(iOS 17.0, *)
private struct CircleControlButton: View {
    let systemImage: String
    let action: String
    var fg: Color
    var bg: Color

    var body: some View {
        Button(intent: FrogTimerControlIntent(action: action)) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .bold))
                .contentTransition(.identity)
                .foregroundColor(fg)
                .frame(width: 44, height: 44)
                .background(Circle().fill(bg))
                .contentShape(Circle())
                .transaction { transaction in
                    transaction.animation = nil
                }
        }
        .buttonStyle(TimerControlButtonStyle())
    }
}

@available(iOS 17.0, *)
private struct DoneButton: View {
    var tint: Color

    var body: some View {
        Button(intent: FrogTimerControlIntent(action: "done")) {
            Label("Done", systemImage: "checkmark")
                .font(.system(size: 16, weight: .bold))
                .contentTransition(.identity)
                .foregroundColor(.white)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 18)
                .frame(height: 44)
                .background(Capsule().fill(tint))
                .contentShape(Capsule())
                .transaction { transaction in
                    transaction.animation = nil
                }
        }
        .buttonStyle(TimerControlButtonStyle())
    }
}

// The "ringing" finished header: a bell + label, shown left of the Done button.
@available(iOS 16.1, *)
private func finishedHeader(_ state: FrogTimerAttributes.ContentState) -> some View {
    let tint = Color(hex: state.color)
    return HStack(spacing: 10) {
        Image(systemName: "bell.fill")
            .font(.system(size: 17, weight: .semibold))
            .foregroundColor(tint)
            .fixedSize()
        VStack(alignment: .leading, spacing: 1) {
            Text("Time's up")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(tint)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Text(state.subtitle)
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.62))
                .lineLimit(1)
        }
    }
}

// Circular icon buttons for the Dynamic Island (matches Apple's timer/alarm).
@available(iOS 16.1, *)
@ViewBuilder
private func islandControls(_ state: FrogTimerAttributes.ContentState) -> some View {
    if #available(iOS 17.0, *) {
        let tint = Color(hex: state.color)
        HStack(spacing: 8) {
            if state.finished == true {
                CircleControlButton(systemImage: "checkmark", action: "done", fg: tint, bg: tint.opacity(0.3))
            } else {
                CircleControlButton(
                    systemImage: state.paused ? "play.fill" : "pause.fill",
                    action: state.paused ? "resume" : "pause",
                    fg: tint,
                    bg: tint.opacity(0.3)
                )
                CircleControlButton(systemImage: "xmark", action: "stop", fg: .white, bg: .white.opacity(0.2))
            }
        }
        .transaction { transaction in
            transaction.animation = nil
        }
    }
}

@available(iOS 16.1, *)
struct FrogTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FrogTimerAttributes.self) { context in
            let state = resolvedState(context)
            lockScreen(state)
                .padding(16)
                .activityBackgroundTint(Color.black.opacity(0.35))
                .activitySystemActionForegroundColor(Color(hex: state.color))
        } dynamicIsland: { context in
            let state = resolvedState(context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if state.finished == true {
                        finishedHeader(state)
                            .frame(maxHeight: .infinity, alignment: .center)
                    } else {
                        islandControls(state)
                            .frame(maxHeight: .infinity, alignment: .center)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    if state.finished != true {
                        Text(state.label)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(Color(hex: state.color))
                            .lineLimit(1)
                            .frame(maxHeight: .infinity, alignment: .center)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if state.finished == true {
                        if #available(iOS 17.0, *) {
                            DoneButton(tint: Color(hex: state.color))
                                .frame(maxHeight: .infinity, alignment: .center)
                        }
                    } else {
                        TimeView(state: state, font: .system(size: 24, weight: .medium))
                            .multilineTextAlignment(.trailing)
                            .frame(width: 82, alignment: .trailing)
                            .frame(maxHeight: .infinity, alignment: .center)
                    }
                }
            } compactLeading: {
                RingView(state: state, size: 20, lineWidth: 2.5)
            } compactTrailing: {
                TimeView(state: state, font: .system(size: 14))
                    .frame(width: 50, alignment: .trailing)
            } minimal: {
                RingView(state: state, size: 20, lineWidth: 2.5)
            }
            .keylineTint(Color(hex: state.color))
        }
    }

    @ViewBuilder
    private func lockScreen(_ state: FrogTimerAttributes.ContentState) -> some View {
        if state.finished == true {
            HStack(spacing: 12) {
                finishedHeader(state)
                Spacer(minLength: 8)
                if #available(iOS 17.0, *) {
                    DoneButton(tint: Color(hex: state.color))
                }
            }
        } else {
            HStack(spacing: 12) {
                islandControls(state)
                Spacer(minLength: 8)
                Text(state.label)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(Color(hex: state.color))
                    .lineLimit(1)
                TimeView(state: state, font: .system(size: 40, weight: .bold))
                    .multilineTextAlignment(.trailing)
                    .frame(width: 120, alignment: .trailing)
            }
        }
    }
}
