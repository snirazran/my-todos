import AppIntents
import SwiftUI
import UIKit
import WidgetKit

// MARK: - Interactivity

/// Ticking a row without opening the app. The intent only writes to the shared
/// container and queues the change; the webview replays it through the normal
/// task endpoints next time it runs, so fly caps, the ledger, quest counters
/// and undo all stay on their usual path.
@available(iOS 17.0, *)
struct ToggleFrogTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete task"
    static var description = IntentDescription("Ticks a task off today's list.")

    @Parameter(title: "Task ID")
    var taskId: String

    @Parameter(title: "Done")
    var done: Bool

    init() {}

    init(taskId: String, done: Bool) {
        self.taskId = taskId
        self.done = done
    }

    func perform() async throws -> some IntentResult {
        FrogWidgetStore.applyLocalToggle(taskId: taskId, done: done)
        FrogWidgetStore.queueToggle(taskId: taskId, done: done)
        return .result()
    }
}

// MARK: - Links

private enum FrogLink {
    static let home = URL(string: "https://frogress.com/")!
    static let quickAdd = URL(string: "https://frogress.com/?quickadd=1")!
    static let login = URL(string: "https://frogress.com/login")!
}

// MARK: - Palette
//
// The artwork is a single dark forest-green field on every size, so the palette
// is fixed light-on-dark rather than following the system theme. An adaptive
// palette would put near-black text on near-black art for light-mode users.

private enum WidgetPalette {
    static let field = Color(red: 0.094, green: 0.251, blue: 0.157)   // #184028
    static let text = Color.white
    static let muted = Color(red: 0.659, green: 0.784, blue: 0.706)   // #A8C8B4
    static let accent = Color(red: 0.565, green: 0.847, blue: 0.439)  // #90D870, the mascot green
    static let streak = Color(red: 0.949, green: 0.757, blue: 0.306)  // #F2C14E
    static let alarm = Color(red: 0.973, green: 0.443, blue: 0.380)   // #F87161
    static let panel = Color.white.opacity(0.10)
}

// MARK: - Timeline

struct FrogWidgetEntry: TimelineEntry {
    let date: Date
    let state: WidgetState?
}

private let sampleState = WidgetState(
    v: 1,
    uid: "sample",
    guest: false,
    signedIn: true,
    day: "2026-08-21",
    streak: 12,
    mood: "happy",
    doneCount: 1,
    totalCount: 7,
    message: "2 left. Finish the plate?",
    urgency: "nudge",
    tasks: [
        WidgetTask(id: "1", text: "Email the landlord", done: true),
        WidgetTask(id: "2", text: "Gym — legs", done: false),
        WidgetTask(id: "3", text: "Book dentist", done: false),
        WidgetTask(id: "4", text: "Water the plants", done: false),
        WidgetTask(id: "5", text: "Reply to Maya", done: false),
        WidgetTask(id: "6", text: "Stretch for ten minutes", done: false),
        WidgetTask(id: "7", text: "Read a chapter", done: false),
    ],
    updatedAt: 0
)

struct FrogWidgetProvider: TimelineProvider {
    /// Synchronous and I/O free, per WidgetKit's placeholder contract.
    func placeholder(in context: Context) -> FrogWidgetEntry {
        FrogWidgetEntry(date: Date(), state: sampleState)
    }

    func getSnapshot(in context: Context, completion: @escaping (FrogWidgetEntry) -> Void) {
        let state = context.isPreview ? sampleState : FrogWidgetStore.readState()
        completion(FrogWidgetEntry(date: Date(), state: state))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FrogWidgetEntry>) -> Void) {
        let entry = FrogWidgetEntry(date: Date(), state: FrogWidgetStore.readState())
        // .after(midnight) rather than .atEnd: the only thing that goes stale on
        // its own is the day rollover. Everything else arrives as an explicit
        // reloadTimelines from the app, which keeps us well inside the daily
        // refresh budget we share with the Frogodoro Live Activity.
        let midnight = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 1),
            matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }
}

// MARK: - Art
//
// One illustration per size, frog included. Swap the images in
// Assets.xcassets (WidgetBackdropSmall / Medium / Large) to restyle the widget;
// no code change needed. Each one reserves flat empty field where the UI sits.

private struct FrogWidgetBackground: View {
    let family: WidgetFamily

    private var assetName: String {
        switch family {
        case .systemSmall: return "WidgetBackdropSmall"
        case .systemLarge: return "WidgetBackdropLarge"
        default: return "WidgetBackdropMedium"
        }
    }

    var body: some View {
        if UIImage(named: assetName) != nil {
            Image(assetName).resizable().scaledToFill()
        } else {
            WidgetPalette.field
        }
    }
}

// MARK: - Pieces

private struct TaskRow: View {
    let task: WidgetTask
    let interactive: Bool
    let compact: Bool

    var body: some View {
        Group {
            if #available(iOS 17.0, *), interactive {
                Button(intent: ToggleFrogTaskIntent(taskId: task.id, done: !task.done)) {
                    rowBody
                }
                .buttonStyle(.plain)
            } else {
                rowBody
            }
        }
        .accessibilityLabel(task.done
            ? "\(task.text), done. Tap to undo."
            : "\(task.text), not done. Tap to complete.")
    }

    private var rowBody: some View {
        HStack(spacing: 8) {
            checkbox
            Text(task.text)
                .font(.system(size: compact ? 13 : 14, weight: .medium))
                .lineLimit(compact ? 2 : 1)
                .strikethrough(task.done, color: WidgetPalette.muted)
                .foregroundStyle(task.done ? WidgetPalette.muted : WidgetPalette.text)
            Spacer(minLength: 0)
        }
        .frame(minHeight: compact ? 22 : 24, alignment: .top)
        .contentShape(Rectangle())
    }

    private var checkbox: some View {
        RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(task.done ? WidgetPalette.accent : Color.clear)
            .overlay(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .strokeBorder(task.done ? Color.clear : WidgetPalette.muted, lineWidth: 1.5)
            )
            .overlay(
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .black))
                    .foregroundStyle(WidgetPalette.field)
                    .opacity(task.done ? 1 : 0)
            )
            .frame(width: 17, height: 17)
    }
}

private struct AddBar: View {
    let compact: Bool
    /// An empty list needs a different ask than a half-finished one. Naming the
    /// actual next action beats a generic label.
    let empty: Bool

    private var label: String {
        if compact { return "Add" }
        return empty ? "Give me a task" : "What's next?"
    }

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "plus").font(.system(size: 11, weight: .black))
            Text(label)
                .font(.system(size: 13, weight: .bold))
                .lineLimit(1)
            if !compact { Spacer(minLength: 0) }
        }
        .foregroundStyle(WidgetPalette.field)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 30)
        .background(Capsule().fill(WidgetPalette.accent))
        .accessibilityLabel("Add a task")
    }
}

private struct StreakBadge: View {
    let streak: Int
    /// The streak turns alarm-coloured only when it is genuinely at risk, so
    /// the colour keeps meaning something. A permanently red flame is wallpaper.
    let atRisk: Bool

    var body: some View {
        if streak > 0 {
            HStack(spacing: 2) {
                Image(systemName: atRisk ? "flame.circle.fill" : "flame.fill")
                    .font(.system(size: atRisk ? 12 : 10))
                Text("\(streak)").font(.system(size: 12, weight: .bold))
            }
            .foregroundStyle(atRisk ? WidgetPalette.alarm : WidgetPalette.streak)
            .accessibilityLabel(atRisk
                ? "\(streak) day streak, at risk"
                : "\(streak) day streak")
        }
    }
}

private struct CountChip: View {
    let done: Int
    let total: Int

    var body: some View {
        Text("\(done)/\(total)")
            .font(.system(size: 11, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(WidgetPalette.muted)
            .accessibilityLabel("\(done) of \(total) done")
    }
}

private struct ProgressBar: View {
    let done: Int
    let total: Int

    private var fraction: Double {
        total <= 0 ? 0 : min(1, Double(done) / Double(total))
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(WidgetPalette.panel)
                Capsule().fill(WidgetPalette.accent)
                    .frame(width: max(0, geo.size.width * fraction))
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

private struct OverflowRow: View {
    let count: Int

    var body: some View {
        Text("+\(count) more")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(WidgetPalette.muted)
    }
}

/// The frog's line. It sits over flat field, not over the frog, so it needs no
/// bubble on large — only the smaller sizes borrow the header row for it.
private struct SpeechLine: View {
    let message: String
    let urgent: Bool

    var body: some View {
        Text(message)
            .font(.system(size: 13, weight: urgent ? .heavy : .semibold))
            .foregroundStyle(urgent ? WidgetPalette.alarm : WidgetPalette.text)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Widget view

struct FrogWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FrogWidgetEntry

    private var isSmall: Bool { family == .systemSmall }
    private var isLarge: Bool { family == .systemLarge }

    /// Rows each size fits once the header, the add bar, and the part of the
    /// artwork the frog occupies are all accounted for.
    private var rowLimit: Int {
        switch family {
        case .systemSmall: return 2
        case .systemLarge: return 6
        default: return 3
        }
    }

    /// Horizontal room the frog takes in the medium artwork — the add bar stops
    /// short of it rather than running underneath.
    private var frogInset: CGFloat { family == .systemMedium ? 104 : 0 }

    var body: some View {
        content
            .frogWidgetBackground(family)
            .widgetURL(signedIn ? (isSmall ? FrogLink.quickAdd : FrogLink.home) : FrogLink.login)
    }

    private var signedIn: Bool { entry.state?.signedIn ?? false }

    @ViewBuilder
    private var content: some View {
        if let state = entry.state, state.signedIn {
            signedInBody(state)
        } else {
            signedOutBody
        }
    }

    private var signedOutBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Frogress")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(WidgetPalette.muted)
            Text("Sign in to see today's list.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(WidgetPalette.text)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func signedInBody(_ state: WidgetState) -> some View {
        let shown = min(rowLimit, state.tasks.count)
        let hidden = max(0, state.totalCount - shown)
        let line = state.message ?? ""
        let urgent = state.urgency == "urgent"

        return VStack(alignment: .leading, spacing: isLarge ? 6 : 5) {
            header(state, line: line, urgent: urgent)

            if isLarge {
                ProgressBar(done: state.doneCount, total: state.totalCount)
                    .padding(.bottom, 2)
            }

            if state.tasks.isEmpty {
                Text("Nothing yet. Feed the frog a task.")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(WidgetPalette.muted)
                    .padding(.top, 2)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(state.tasks.prefix(rowLimit))) { task in
                        TaskRow(task: task, interactive: !isSmall, compact: isSmall)
                    }
                    if hidden > 0 && !isSmall { OverflowRow(count: hidden) }
                }
            }

            // On large the line gets its own row under the list; the smaller
            // sizes put it in the header, where it costs no extra height.
            if isLarge && !line.isEmpty {
                Spacer(minLength: 4)
                SpeechLine(message: line, urgent: urgent)
            }

            Spacer(minLength: 4)

            // Small spends its single tap target on capture (see widgetURL), so
            // it shows no button — the artwork's frog fills that space instead.
            if !isSmall {
                AddBar(compact: false, empty: state.tasks.isEmpty)
                    .padding(.trailing, frogInset)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func header(_ state: WidgetState, line: String, urgent: Bool) -> some View {
        HStack(spacing: 6) {
            if family == .systemMedium && !line.isEmpty {
                Text(line)
                    .font(.system(size: 11, weight: urgent ? .heavy : .bold))
                    .foregroundStyle(urgent ? WidgetPalette.alarm : WidgetPalette.text)
                    .lineLimit(1)
            } else {
                Text("TODAY")
                    .font(.system(size: 11, weight: .bold))
                    .kerning(0.5)
                    .foregroundStyle(WidgetPalette.muted)
            }
            Spacer(minLength: 4)
            if state.totalCount > 0 {
                CountChip(done: state.doneCount, total: state.totalCount)
            }
            StreakBadge(streak: state.streak, atRisk: urgent)
        }
    }
}

// MARK: - Widget

struct FrogTasksWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: FrogWidgetStore.kind, provider: FrogWidgetProvider()) { entry in
            FrogWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Today's tasks and your frog, with one tap to add whatever just came to mind.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

private extension View {
    /// containerBackground arrived in iOS 17 and is required there; on 16 the
    /// widget paints its own background instead.
    @ViewBuilder
    func frogWidgetBackground(_ family: WidgetFamily) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { FrogWidgetBackground(family: family) }
        } else {
            padding(12).background(FrogWidgetBackground(family: family))
        }
    }
}
