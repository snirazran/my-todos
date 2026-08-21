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
// Defined in code rather than an asset catalog so the widget needs no extra
// resource files — and so both themes are always defined together.

private enum WidgetPalette {
    static func dynamic(light: (Double, Double, Double), dark: (Double, Double, Double)) -> Color {
        Color(UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
        })
    }

    static let text = dynamic(light: (0.07, 0.15, 0.11), dark: (0.91, 0.94, 0.91))
    static let muted = dynamic(light: (0.36, 0.46, 0.40), dark: (0.55, 0.65, 0.58))
    static let accent = dynamic(light: (0.12, 0.48, 0.27), dark: (0.39, 0.80, 0.56))
    static let streak = dynamic(light: (0.64, 0.38, 0.06), dark: (0.89, 0.66, 0.35))
    static let bgTop = dynamic(light: (0.89, 0.94, 0.90), dark: (0.11, 0.19, 0.15))
    static let bgBottom = dynamic(light: (0.74, 0.85, 0.78), dark: (0.05, 0.12, 0.09))
    static let frogSkin = dynamic(light: (0.25, 0.61, 0.39), dark: (0.29, 0.66, 0.44))
    static let frogSkinPale = dynamic(light: (0.43, 0.61, 0.49), dark: (0.40, 0.56, 0.46))
    static let frogLine = dynamic(light: (0.11, 0.36, 0.22), dark: (0.08, 0.28, 0.17))
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
    message: "Three left before dinner \u{1F340}",
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
// Both of these prefer an image from the extension's asset catalog and fall
// back to something drawn in code, so the widget ships and runs before any art
// exists. Add `WidgetBackdropSmall` / `WidgetBackdropMedium` /
// `WidgetBackdropLarge` (or one `WidgetBackdrop` for all three), plus
// `FrogHappy`, `FrogNeutral`, `FrogHungry` and `FrogAsleep`, to take over.
// Not `WidgetBackground` — the catalog already has a colorset by that name
// from Xcode's widget template.

private struct FrogWidgetBackground: View {
    @Environment(\.colorScheme) private var scheme
    let family: WidgetFamily

    /// Per-size art first, then a single catch-all, then the drawn gradient.
    /// The three families have very different shapes — square, 2:1 wide, and
    /// nearly square-tall — so one image cropped to fill all of them rarely
    /// looks right in more than one.
    private var candidates: [String] {
        switch family {
        case .systemSmall: return ["WidgetBackdropSmall", "WidgetBackdrop"]
        case .systemLarge: return ["WidgetBackdropLarge", "WidgetBackdrop"]
        default: return ["WidgetBackdropMedium", "WidgetBackdrop"]
        }
    }

    /// Existence check only. The image is then rendered *by name* so SwiftUI
    /// resolves the catalog's light/dark variant from the environment —
    /// UIImage(named:) picks whatever trait collection happens to be current,
    /// which in a widget is not dependable.
    private var artworkName: String? {
        candidates.first { UIImage(named: $0) != nil }
    }

    /// Knocks back busy art so text keeps its contrast, in whichever direction
    /// this theme needs. A fixed black wash would grey out the light plate.
    private var scrim: Color {
        scheme == .dark ? Color.black.opacity(0.15) : Color.white.opacity(0.10)
    }

    var body: some View {
        if let name = artworkName {
            Image(name)
                .resizable()
                .scaledToFill()
                .overlay(scrim)
        } else {
            LinearGradient(
                colors: [WidgetPalette.bgTop, WidgetPalette.bgBottom],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

private struct FrogView: View {
    let mood: String

    private var assetName: String {
        switch mood {
        case "happy": return "FrogHappy"
        case "hungry": return "FrogHungry"
        case "asleep": return "FrogAsleep"
        default: return "FrogNeutral"
        }
    }

    var body: some View {
        Group {
            if UIImage(named: assetName) != nil {
                accented(Image(assetName))
            } else {
                DrawnFrog(mood: mood)
            }
        }
        .accessibilityLabel("Your frog")
    }

    /// Without full-colour accenting the frog renders as a white silhouette once
    /// the user picks a tinted or clear Home Screen.
    @ViewBuilder
    private func accented(_ image: Image) -> some View {
        if #available(iOS 18.0, *) {
            image.resizable().widgetAccentedRenderingMode(.fullColor).scaledToFit()
        } else {
            image.resizable().scaledToFit()
        }
    }
}

private struct DrawnFrog: View {
    let mood: String

    private var skin: Color {
        mood == "hungry" || mood == "asleep"
            ? WidgetPalette.frogSkinPale
            : WidgetPalette.frogSkin
    }

    private var pupilHeight: CGFloat { mood == "asleep" ? 0.02 : 0.09 }

    var body: some View {
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height)
            let cx = geo.size.width / 2
            let cy = geo.size.height / 2

            ZStack {
                Circle().fill(skin)
                    .frame(width: s * 0.30)
                    .position(x: cx - s * 0.19, y: cy - s * 0.28)
                Circle().fill(skin)
                    .frame(width: s * 0.30)
                    .position(x: cx + s * 0.19, y: cy - s * 0.28)
                Ellipse().fill(skin)
                    .frame(width: s * 0.66, height: s * 0.56)
                    .position(x: cx, y: cy + s * 0.06)

                eye(s: s).position(x: cx - s * 0.19, y: cy - s * 0.28)
                eye(s: s).position(x: cx + s * 0.19, y: cy - s * 0.28)

                MouthShape(mood: mood)
                    .stroke(WidgetPalette.frogLine,
                            style: StrokeStyle(lineWidth: s * 0.042, lineCap: .round))
                    .frame(width: s * 0.32, height: s * 0.12)
                    .position(x: cx, y: cy + s * 0.16)
            }
        }
    }

    private func eye(s: CGFloat) -> some View {
        ZStack {
            Circle().fill(.white).frame(width: s * 0.17)
            Capsule().fill(Color(red: 0.07, green: 0.13, blue: 0.10))
                .frame(width: s * 0.08, height: s * pupilHeight)
        }
    }

}

/// Smiling curves up, hungry curves down, asleep and neutral sit flat.
private struct MouthShape: Shape {
    let mood: String

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let start = CGPoint(x: rect.minX, y: rect.midY)
        let end = CGPoint(x: rect.maxX, y: rect.midY)
        path.move(to: start)
        switch mood {
        case "happy":
            path.addQuadCurve(to: end, control: CGPoint(x: rect.midX, y: rect.maxY + rect.height))
        case "hungry":
            path.addQuadCurve(to: end, control: CGPoint(x: rect.midX, y: rect.minY - rect.height))
        default:
            path.addLine(to: end)
        }
        return path
    }
}

// MARK: - Pieces

private struct TaskRow: View {
    let task: WidgetTask
    /// systemSmall cannot host buttons or links, so rows there are display-only.
    let interactive: Bool
    /// Small is ~120pt of text width, where one line truncates almost every
    /// task. Wrapping to two reads better than an ellipsis after four words.
    let compact: Bool

    var body: some View {
        HStack(spacing: 8) {
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
                .font(.system(size: compact ? 12.5 : 14))
                .lineLimit(compact ? 2 : 1)
                .multilineTextAlignment(.leading)
                .strikethrough(task.done, color: WidgetPalette.muted)
                .foregroundStyle(task.done ? WidgetPalette.muted : WidgetPalette.text)
            Spacer(minLength: 0)
        }
        // The whole row is the tick target, not just the little box.
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
                    .foregroundStyle(.white)
                    .opacity(task.done ? 1 : 0)
            )
            .frame(width: compact ? 16 : 18, height: compact ? 16 : 18)
    }
}

private struct AddBarLabel: View {
    let compact: Bool

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "plus").font(.system(size: 11, weight: .black))
            Text(compact ? "Add" : "What's next?")
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
            if !compact { Spacer(minLength: 0) }
        }
        .foregroundStyle(WidgetPalette.accent)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 32)
        .background(
            Capsule()
                .fill(Color.white.opacity(0.35))
                .overlay(
                    Capsule().strokeBorder(
                        WidgetPalette.accent.opacity(0.55),
                        style: StrokeStyle(lineWidth: 1.5, dash: [5, 3])
                    )
                )
        )
        .accessibilityLabel("Add a task")
    }
}

private struct StreakBadge: View {
    let streak: Int

    var body: some View {
        if streak > 0 {
            HStack(spacing: 2) {
                Image(systemName: "flame.fill").font(.system(size: 10))
                Text("\(streak)").font(.system(size: 12, weight: .bold))
            }
            .foregroundStyle(WidgetPalette.streak)
            .accessibilityLabel("\(streak) day streak")
        }
    }
}

// MARK: - Widget view

/// "3/7" — the glance-value every good to-do widget leads with.
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
                Capsule().fill(WidgetPalette.muted.opacity(0.25))
                Capsule()
                    .fill(WidgetPalette.accent)
                    .frame(width: max(0, geo.size.width * fraction))
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

/// The rest of the list, acknowledged rather than silently dropped — without
/// this the widget just looks like it lost your tasks.
private struct OverflowRow: View {
    let count: Int

    var body: some View {
        Text("+\(count) more")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(WidgetPalette.muted)
    }
}

/// Mascot plus a line of copy — the Duolingo move. The frog is the reason you
/// look, the sentence is what makes looking worth something.
private struct SpeechStrip: View {
    @Environment(\.colorScheme) private var scheme
    let mood: String
    let message: String
    let frogWidth: CGFloat

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            FrogView(mood: mood)
                .frame(width: frogWidth, height: frogWidth * 0.64)

            if !message.isEmpty {
                Text(message)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(WidgetPalette.text)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(scheme == .dark
                                  ? Color.black.opacity(0.35)
                                  : Color.white.opacity(0.82))
                    )
                Spacer(minLength: 0)
            }
        }
    }
}

struct FrogWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FrogWidgetEntry

    private var isSmall: Bool { family == .systemSmall }

    /// What each family physically fits once header, add bar and — on large —
    /// the speech strip are taken out. Large was showing four rows into space
    /// that holds six.
    private var rowLimit: Int {
        switch family {
        case .systemSmall: return 1
        case .systemLarge: return 6
        default: return 3
        }
    }

    private var isLarge: Bool { family == .systemLarge }

    var body: some View {
        content
            .frogWidgetBackground(family)
            // Small widgets get exactly one tap target, so spend it on capture —
            // the behaviour the widget exists to produce.
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

    /// The frog art is a wide "peeking over a ledge" sprite, so it gets a wide
    /// box pinned to the bottom of the row area — that way it reads as perched
    /// on the add bar rather than floating in the middle of the widget.
    private var frogWidth: CGFloat { family == .systemLarge ? 104 : 72 }

    private var signedOutBody: some View {
        VStack(spacing: 8) {
            DrawnFrog(mood: "neutral").frame(width: 44, height: 44)
            Text("Sign in to see today's list.")
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
                .foregroundStyle(WidgetPalette.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func signedInBody(_ state: WidgetState) -> some View {
        let shown = min(rowLimit, state.tasks.count)
        let hidden = max(0, state.totalCount - shown)

        return VStack(alignment: .leading, spacing: isLarge ? 6 : 5) {
            header(state)

            // Large has the room for a progress bar, and progress is the thing
            // a to-do widget is actually being glanced at for.
            if isLarge {
                ProgressBar(done: state.doneCount, total: state.totalCount)
            }

            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    if state.tasks.isEmpty {
                        // The user with nothing on the list is exactly who this
                        // widget is for, so the empty state sells the add bar.
                        Text("Nothing yet. Feed the frog a task.")
                            .font(.system(size: 14))
                            .foregroundStyle(WidgetPalette.muted)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    } else {
                        ForEach(Array(state.tasks.prefix(rowLimit))) { task in
                            TaskRow(task: task, interactive: !isSmall, compact: isSmall)
                        }
                        if hidden > 0 && !isSmall { OverflowRow(count: hidden) }
                        Spacer(minLength: 0)
                    }
                }

                // On large the frog gets its own strip below; on medium it
                // tucks in beside the rows.
                if family == .systemMedium {
                    FrogView(mood: state.mood)
                        .frame(width: frogWidth, height: frogWidth * 0.64)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)

            if isSmall {
                FrogView(mood: state.mood)
                    .frame(width: frogWidth, height: frogWidth * 0.64)
                    .frame(maxWidth: .infinity, alignment: .center)
            }

            if isLarge {
                SpeechStrip(
                    mood: state.mood,
                    message: state.message ?? "",
                    frogWidth: frogWidth
                )
            }

            addBar.frame(height: 32)
        }
    }

    /// Large keeps a plain label because it has a speech strip of its own;
    /// the smaller families spend the header row on the frog's line instead,
    /// which costs no extra height.
    @ViewBuilder
    private func header(_ state: WidgetState) -> some View {
        HStack(spacing: 6) {
            if family == .systemMedium, let line = state.message, !line.isEmpty {
                Text(line)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(WidgetPalette.text)
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
            StreakBadge(streak: state.streak)
        }
    }

    @ViewBuilder
    private var addBar: some View {
        if isSmall {
            AddBarLabel(compact: true)
        } else {
            Link(destination: FrogLink.quickAdd) { AddBarLabel(compact: false) }
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
