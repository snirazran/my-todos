import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Interactivity

/// Ticking a row without opening the app. The intent only writes to the shared
/// container and queues the change; the webview replays it through the normal
/// task endpoints next time it runs, so fly caps, the ledger, quest counters
/// and undo all stay on their usual path.
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

/// The add button — the one control on the widget that is *meant* to leave the
/// home screen. It records the request and opens the app; the webview drains
/// the queue on launch and raises its own quick-add sheet.
struct FrogQuickAddIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a task"
    static var description = IntentDescription("Opens Frogress ready to add a task.")
    static var openAppWhenRun: Bool = true

    init() {}

    func perform() async throws -> some IntentResult {
        FrogWidgetStore.queueQuickAdd()
        return .result()
    }
}

// MARK: - Palette
//
// Straight from the Figma widget sheet. Light is a white card; dark swaps to
// the mint field rather than going dark — the frog art is drawn on light
// ground, and a near-black card would leave it floating in a bright hole.

private enum Palette {
    static let card = Color("WidgetCard")
    static let track = Color("WidgetTrack")
    static let fill = Color(red: 0.588, green: 0.827, blue: 0.404)   // #96D367
    static let text = Color(red: 0.039, green: 0.039, blue: 0.039)   // #0A0A0A
    static let heading = Color.black
}

private enum Metrics {
    static let rowHeight: CGFloat = 21.5
    static let barHeight: CGFloat = 6
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
    day: "2026-08-25",
    doneCount: 2,
    totalCount: 26,
    art: "skater",
    word: WidgetWord(term: "Robustious", meaning: "rough, rude, or boisterous."),
    tasks: [
        WidgetTask(id: "1", text: "Pick up arts & crafts supplies", done: false),
        WidgetTask(id: "2", text: "Send cookie recipe to Rigo", done: false),
        WidgetTask(id: "3", text: "Book club prep", done: false),
        WidgetTask(id: "4", text: "Hike with Darla", done: false),
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
        // .after(midnight) rather than .atEnd: the only things that go stale on
        // their own are the day rollover and, with it, the art and the word.
        // Everything else arrives as an explicit reloadTimelines from the app,
        // which keeps us well inside the daily refresh budget we share with the
        // Frogodoro Live Activity.
        let midnight = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 1),
            matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }
}

// MARK: - Pieces

/// The frog of the day. Chosen webview-side so it turns over at the user's own
/// midnight and holds still for the rest of the day.
private struct FrogArt: View {
    let art: String

    private var assetName: String {
        switch art {
        case "astronaut": return "FrogArtAstronaut"
        case "laptop": return "FrogArtLaptop"
        default: return "FrogArtSkater"
        }
    }

    var body: some View {
        artwork.accessibilityHidden(true)
    }

    /// Keeps the illustration in colour when the home screen is tinted, rather
    /// than letting it flatten into a white slab.
    @ViewBuilder
    private var artwork: some View {
        if #available(iOS 18.0, *) {
            Image(assetName)
                .resizable()
                .widgetAccentedRenderingMode(.fullColor)
                .scaledToFit()
        } else {
            Image(assetName)
                .resizable()
                .scaledToFit()
        }
    }
}

private struct AddButton: View {
    let diameter: CGFloat

    var body: some View {
        Button(intent: FrogQuickAddIntent()) { circle }
            .buttonStyle(.plain)
            .accessibilityLabel("Add a task")
    }

    private var circle: some View {
        Image("WidgetPlus")
            .resizable()
            .frame(width: diameter, height: diameter)
            .contentShape(Circle())
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
                Capsule().fill(Palette.track)
                Capsule().fill(Palette.fill)
                    .frame(width: max(0, geo.size.width * fraction))
            }
        }
        .frame(height: Metrics.barHeight)
        .accessibilityHidden(true)
    }
}

/// A row of today's list. The fly is the target: tapping it feeds the frog and
/// leaves a tick behind.
private struct TaskRow: View {
    let task: WidgetTask

    var body: some View {
        Button(intent: ToggleFrogTaskIntent(taskId: task.id, done: !task.done)) {
            rowBody
        }
        .buttonStyle(.plain)
        .accessibilityLabel(task.done
            ? "\(task.text), done. Tap to undo."
            : "\(task.text), not done. Tap to complete.")
    }

    private var rowBody: some View {
        HStack(spacing: 10) {
            Image(task.done ? "WidgetCheckOn" : "WidgetCheckOff")
                .resizable()
                .frame(width: Metrics.rowHeight, height: Metrics.rowHeight)
            Text(task.text)
                .font(.system(size: 13, design: .rounded))
                .tracking(0.5)
                .lineLimit(1)
                .truncationMode(.tail)
                .strikethrough(task.done, color: Palette.text.opacity(0.45))
                .foregroundStyle(task.done ? Palette.text.opacity(0.45) : Palette.text)
            Spacer(minLength: 0)
        }
        .frame(height: Metrics.rowHeight)
        .contentShape(Rectangle())
    }
}

/// The count, sized to the space it has: large spells the whole sentence on one
/// line; medium sets its own label underneath, and small shows the figure alone.
private struct RemainingCount: View {
    let remaining: Int
    let inline: Bool

    private var number: some View {
        Text("\(remaining)")
            .font(.system(size: 30, weight: .bold, design: .rounded))
            .tracking(0.3)
            .foregroundStyle(Palette.heading)
    }

    var body: some View {
        Group {
            if inline {
                Text("\(remaining) tasks left")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .tracking(0.3)
                    .foregroundStyle(Palette.heading)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            } else {
                number
            }
        }
        .accessibilityLabel("\(remaining) tasks left")
    }
}

private struct WordOfTheDay: View {
    let word: WidgetWord

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(word.term)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .tracking(0.5)
            Text(word.meaning)
                .font(.system(size: 10, design: .rounded))
                .tracking(0.5)
        }
        .foregroundStyle(Palette.heading)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Word of the day: \(word.term), \(word.meaning)")
    }
}

private struct EmptyRows: View {
    var body: some View {
        Text("Nothing yet. Feed the frog a task.")
            .font(.system(size: 13, design: .rounded))
            .foregroundStyle(Palette.text.opacity(0.55))
            .lineLimit(2)
    }
}

private struct SignedOut: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Frogress")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(Palette.text.opacity(0.55))
            Text("Sign in to see today's list.")
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(Palette.heading)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Sizes

private struct SmallWidget: View {
    let state: WidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                RemainingCount(remaining: state.remaining, inline: false)
                Spacer(minLength: 0)
                AddButton(diameter: 23.58)
            }
            .frame(height: 15)

            ProgressBar(done: state.doneCount, total: state.totalCount)

            if state.tasks.isEmpty {
                EmptyRows()
                Spacer(minLength: 0)
            } else {
                SpacedRows(tasks: state.tasks, limit: 3)
            }
        }
    }
}

/// Rows spread over whatever height is left, the way the design distributes
/// them on the two smaller sizes.
private struct SpacedRows: View {
    let tasks: [WidgetTask]
    let limit: Int

    var body: some View {
        let shown = Array(tasks.prefix(limit))
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, task in
                TaskRow(task: task)
                if index < shown.count - 1 { Spacer(minLength: 4) }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct MediumWidget: View {
    let state: WidgetState

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Offsets cancel the card padding so the art bleeds to the corner,
            // exactly as it does on the sheet.
            FrogArt(art: state.art)
                .frame(width: 113, height: 82)
                .offset(x: -18, y: 18)

            HStack(alignment: .top, spacing: 28) {
                VStack(alignment: .leading, spacing: 4) {
                    RemainingCount(remaining: state.remaining, inline: false)
                    Text("tasks left")
                        .font(.system(size: 15.5, weight: .semibold, design: .rounded))
                        .tracking(0.1)
                        .foregroundStyle(Palette.heading)
                    ProgressBar(done: state.doneCount, total: state.totalCount)
                }
                .frame(width: 75, alignment: .leading)

                if state.tasks.isEmpty {
                    EmptyRows()
                    Spacer(minLength: 0)
                } else {
                    SpacedRows(tasks: state.tasks, limit: 4)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            AddButton(diameter: 31.9)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .offset(y: 6)
        }
    }
}

private struct LargeWidget: View {
    let state: WidgetState

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            FrogArt(art: state.art)
                .frame(width: 169, height: 122)
                .offset(x: 17, y: 18)

            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    RemainingCount(remaining: state.remaining, inline: true)
                    Spacer(minLength: 8)
                    AddButton(diameter: 31.9)
                }

                ProgressBar(done: state.doneCount, total: state.totalCount)

                if state.tasks.isEmpty {
                    EmptyRows()
                } else {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(Array(state.tasks.prefix(7))) { task in
                            TaskRow(task: task)
                        }
                    }
                }

                Spacer(minLength: 4)

                WordOfTheDay(word: state.word)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

// MARK: - Widget view

struct FrogWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FrogWidgetEntry

    var body: some View {
        content
            .padding(.horizontal, family == .systemMedium ? 18 : 17)
            .padding(.vertical, 18)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .frogCard()
    }

    @ViewBuilder
    private var content: some View {
        if let state = entry.state, state.signedIn {
            switch family {
            case .systemSmall: SmallWidget(state: state)
            case .systemLarge: LargeWidget(state: state)
            default: MediumWidget(state: state)
            }
        } else {
            SignedOut()
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
        .description("Today's tasks and your frog. Tap a fly to tick one off.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

// MARK: - Helpers

private extension WidgetState {
    var remaining: Int { max(0, totalCount - doneCount) }
}

private extension View {
    func frogCard() -> some View {
        containerBackground(for: .widget) { Palette.card }
    }
}
