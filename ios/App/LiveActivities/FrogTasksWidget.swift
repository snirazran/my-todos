import AppIntents
import SwiftUI
import WidgetKit

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

// MARK: - Metrics
//
// Every number below is a point measurement taken off the sheet, which was
// drawn against a 158/338pt card — the widget sizes an iPhone 12/13/14/15/16
// hands out. Other devices hand out different ones (a Pro Max large is
// 362x382), so each value is scaled by how much bigger this device's card is
// than the one the design assumes. Without that the contents hold their size
// while the card grows, and the whole thing reads about 7% small.

private struct Metrics {
    static let small = CGSize(width: 158, height: 158)
    static let medium = CGSize(width: 338, height: 158)
    static let large = CGSize(width: 338, height: 354)

    let scale: CGFloat

    /// The smaller of the two axis ratios, so the design's box always fits the
    /// card. Scaling on width alone overflows vertically the moment a device
    /// hands out a card that is proportionally shorter than the sheet.
    init(size: CGSize, reference: CGSize) {
        guard size.width > 0, size.height > 0,
              reference.width > 0, reference.height > 0
        else { scale = 1; return }
        scale = min(size.width / reference.width, size.height / reference.height)
    }

    /// One design point, in this device's actual points.
    func s(_ value: CGFloat) -> CGFloat { value * scale }

    func font(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: s(size), weight: weight, design: .rounded)
    }
}

/// Design-space geometry, used to decide what overlaps what. Scale cancels out
/// of that question, so it is answered in the sheet's own units.
private enum Design {
    static let rowHeight: CGFloat = 21.5
    static let rowSpacing: CGFloat = 7
    static let headerHeight: CGFloat = 36
    static let barHeight: CGFloat = 6
    static let largeHeight: CGFloat = 354
    static let artLarge = CGSize(width: 169, height: 122)
    static let artMedium = CGSize(width: 113, height: 82)
    static let addLarge: CGFloat = 31.9
    static let addSmall: CGFloat = 23.58
    /// The sheet trims its text to cap height; SwiftUI gives a font its whole
    /// line box. Pinning these to the drawn heights keeps the medium's header
    /// block at the 46pt the layout is budgeted for instead of ~70pt, which is
    /// what was squeezing the frog down to two thirds of its size.
    static let countTrim: CGFloat = 21
    static let labelTrim: CGFloat = 11
    /// How far the medium's frog hangs below the padded content box.
    static let artMediumBleed: CGFloat = 18
    /// Gaps that reproduce the sheet at a full list. Fixed rather than spread:
    /// justifying two rows across the whole column strands them 79pt apart.
    static let rowGapMedium: CGFloat = 12
    static let rowGapSmall: CGFloat = 6.25

    /// The medium's add button only reaches the fourth row, so a shorter list
    /// gives up no width at all.
    static func rowMeetsAdd(_ index: Int) -> Bool {
        let bottom = 18 + CGFloat(index) * (rowHeight + rowGapMedium) + rowHeight
        return bottom > 158 - 12 - addLarge
    }
    /// The marker's stroke overhangs its 21.5 layout box, so the disc reads a
    /// little wider than the row it sits in — as on the sheet.
    static let markerArt: CGFloat = 23.7396

    /// Share of the artwork canvas that is empty on its leading edge, measured
    /// off the PNGs. The three illustrations are padded very differently — the
    /// skater floats in nearly 19% of blank canvas — so a reserve measured to
    /// the image frame strands 20-30pt of text width on most of them.
    static func artLeadingPad(_ art: String) -> CGFloat {
        switch art {
        case "astronaut": return 0.010
        case "laptop": return 0.115
        default: return 0.188
        }
    }

    /// Room a row gives up on the right so a long title truncates before what
    /// floats over it, instead of running underneath. The sheet shows this on
    /// the overflow variant, where the last rows stop short of the frog.
    static func artReserve(_ art: String) -> CGFloat {
        artLarge.width * (1 - artLeadingPad(art)) - 17 + 6
    }

    static let addReserve: CGFloat = addLarge + 8

    /// Large lays its rows out top-down from a fixed offset, so which of them
    /// reach the frog in the bottom-right corner is arithmetic, not a guess:
    /// with a full list it comes out as the last two, exactly as drawn.
    static func rowMeetsArt(_ index: Int) -> Bool {
        let top = 18 + headerHeight + 14 + barHeight + 14
        let bottom = top + CGFloat(index) * (rowHeight + rowSpacing) + rowHeight
        return bottom > largeHeight - artLarge.height
    }
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
    /// Medium sits the frog in the leading corner, so it is mirrored to face
    /// into the card rather than off the edge of it.
    var flipped: Bool = false

    private var assetName: String {
        switch art {
        case "astronaut": return "FrogArtAstronaut"
        case "laptop": return "FrogArtLaptop"
        default: return "FrogArtSkater"
        }
    }

    var body: some View {
        artwork
            .scaleEffect(x: flipped ? -1 : 1, y: 1)
            .accessibilityHidden(true)
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
    let m: Metrics
    let diameter: CGFloat

    var body: some View {
        Button(intent: FrogQuickAddIntent()) {
            Image("WidgetPlus")
                .resizable()
                .frame(width: m.s(diameter), height: m.s(diameter))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add a task")
    }
}

private struct ProgressBar: View {
    let m: Metrics
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
        .frame(height: m.s(Design.barHeight))
        .accessibilityHidden(true)
    }
}

/// A row of today's list. The fly is the target: tapping it feeds the frog and
/// leaves a tick behind.
private struct TaskRow: View {
    let m: Metrics
    let task: WidgetTask
    /// Design-space width surrendered on the right, so a long title stops short
    /// of whatever floats over this row. Zero for rows with the card to
    /// themselves.
    var reserve: CGFloat = 0

    /// A row captured on the home screen has no server id yet, so it cannot be
    /// ticked here — it renders inert until the webview's next snapshot
    /// replaces it with the real one.
    private var pending: Bool { task.id.hasPrefix(FrogWidgetStore.pendingPrefix) }

    var body: some View {
        Group {
            if pending {
                rowBody.opacity(0.6)
            } else {
                Button(intent: ToggleFrogTaskIntent(taskId: task.id, done: !task.done)) {
                    rowBody
                }
                .buttonStyle(.plain)
            }
        }
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        if pending { return "\(task.text), saving." }
        return task.done
            ? "\(task.text), done. Tap to undo."
            : "\(task.text), not done. Tap to complete."
    }

    private var rowBody: some View {
        HStack(spacing: m.s(10)) {
            Image(task.done ? "WidgetCheckOn" : "WidgetCheckOff")
                .resizable()
                .frame(width: m.s(Design.markerArt), height: m.s(Design.markerArt))
                .frame(width: m.s(Design.rowHeight), height: m.s(Design.rowHeight))
            Text(task.text)
                .font(m.font(13))
                .tracking(m.s(0.5))
                .lineLimit(1)
                .truncationMode(.tail)
                .strikethrough(task.done, color: Palette.text.opacity(0.45))
                .foregroundStyle(task.done ? Palette.text.opacity(0.45) : Palette.text)
            Spacer(minLength: 0)
        }
        .padding(.trailing, m.s(reserve))
        .frame(height: m.s(Design.rowHeight))
        .contentShape(Rectangle())
    }
}

/// Today's rows, stacked from the top at the sheet's own spacing.
private struct SpacedRows: View {
    let m: Metrics
    let tasks: [WidgetTask]
    let limit: Int
    let gap: CGFloat
    var reserve: (Int) -> CGFloat = { _ in 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: m.s(gap)) {
            ForEach(Array(tasks.prefix(limit).enumerated()), id: \.element.id) { index, task in
                TaskRow(m: m, task: task, reserve: reserve(index))
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// The count, sized to the space it has: large spells the whole sentence on one
/// line; medium sets its own label underneath, and small shows the figure alone.
private struct RemainingCount: View {
    let m: Metrics
    let remaining: Int
    let inline: Bool

    var body: some View {
        Text(inline ? "\(remaining) tasks left" : "\(remaining)")
            .font(m.font(30, .bold))
            .tracking(m.s(0.3))
            .foregroundStyle(Palette.heading)
            .lineLimit(1)
            .minimumScaleFactor(inline ? 0.6 : 1)
            .accessibilityLabel("\(remaining) tasks left")
    }
}

private struct WordOfTheDay: View {
    let m: Metrics
    let word: WidgetWord

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(word.term).font(m.font(13, .bold))
            Text(word.meaning).font(m.font(10))
        }
        .tracking(m.s(0.5))
        .foregroundStyle(Palette.heading)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Word of the day: \(word.term), \(word.meaning)")
    }
}

private struct EmptyRows: View {
    let m: Metrics

    var body: some View {
        Text("Nothing yet. Feed the frog a task.")
            .font(m.font(13))
            .foregroundStyle(Palette.text.opacity(0.55))
            .lineLimit(2)
    }
}

private struct SignedOut: View {
    let m: Metrics

    var body: some View {
        VStack(alignment: .leading, spacing: m.s(4)) {
            Text("Frogress")
                .font(m.font(12, .bold))
                .foregroundStyle(Palette.text.opacity(0.55))
            Text("Sign in to see today's list.")
                .font(m.font(14, .semibold))
                .foregroundStyle(Palette.heading)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Sizes

private struct SmallWidget: View {
    let m: Metrics
    let state: WidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: m.s(12)) {
            HStack(alignment: .center) {
                RemainingCount(m: m, remaining: state.remaining, inline: false)
                Spacer(minLength: 0)
                AddButton(m: m, diameter: Design.addSmall)
            }
            .frame(height: m.s(15))

            ProgressBar(m: m, done: state.doneCount, total: state.totalCount)

            if state.tasks.isEmpty {
                EmptyRows(m: m)
                Spacer(minLength: 0)
            } else {
                SpacedRows(m: m, tasks: state.tasks, limit: 3, gap: Design.rowGapSmall)
            }
        }
    }
}

private struct MediumWidget: View {
    let m: Metrics
    let state: WidgetState

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            HStack(alignment: .top, spacing: m.s(28)) {
                // The frog is a sibling below the header rather than a layer
                // floating over it. Overlap is then impossible on any card,
                // whatever height the device hands out: the header takes the
                // room it needs and the frog gets what is left. Free-floating
                // it collided even on the reference card, because SwiftUI
                // gives text a full line box where the sheet trims to cap
                // height — about 24pt taller over the three lines.
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: m.s(4)) {
                        RemainingCount(m: m, remaining: state.remaining, inline: false)
                            .frame(height: m.s(Design.countTrim))
                        Text("tasks left")
                            .font(m.font(15.5, .semibold))
                            .tracking(m.s(0.1))
                            .foregroundStyle(Palette.heading)
                            .lineLimit(1)
                            .frame(height: m.s(Design.labelTrim))
                        ProgressBar(m: m, done: state.doneCount, total: state.totalCount)
                    }
                    .layoutPriority(1)

                    Spacer(minLength: 0)

                    // Both frames are the sheet's own box model: the artwork
                    // draws at full size while its *layout* box is narrower and
                    // shorter, so it spills into the gutter and past the bottom
                    // padding without pushing anything around. Sized in design
                    // points that provably fit the column, so it can neither
                    // shrink nor collide.
                    FrogArt(art: state.art, flipped: true)
                        .frame(width: m.s(Design.artMedium.width),
                               height: m.s(Design.artMedium.height))
                        .frame(
                            width: m.s(75),
                            height: m.s(Design.artMedium.height - Design.artMediumBleed),
                            alignment: .topLeading
                        )
                        .offset(x: -m.s(18))
                }
                .frame(width: m.s(75), alignment: .leading)

                if state.tasks.isEmpty {
                    EmptyRows(m: m)
                    Spacer(minLength: 0)
                } else {
                    SpacedRows(
                        m: m,
                        tasks: state.tasks,
                        limit: 4,
                        gap: Design.rowGapMedium
                    ) { index in
                        Design.rowMeetsAdd(index) ? Design.addReserve : 0
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            AddButton(m: m, diameter: Design.addLarge)
                .offset(y: m.s(6))
        }
    }
}

private struct LargeWidget: View {
    let m: Metrics
    let state: WidgetState

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            FrogArt(art: state.art)
                .frame(width: m.s(Design.artLarge.width), height: m.s(Design.artLarge.height))
                .offset(x: m.s(17), y: m.s(18))

            VStack(alignment: .leading, spacing: m.s(14)) {
                HStack(alignment: .center) {
                    RemainingCount(m: m, remaining: state.remaining, inline: true)
                    Spacer(minLength: m.s(8))
                    AddButton(m: m, diameter: Design.addLarge)
                }
                .frame(height: m.s(Design.headerHeight))

                ProgressBar(m: m, done: state.doneCount, total: state.totalCount)

                if state.tasks.isEmpty {
                    EmptyRows(m: m)
                } else {
                    VStack(alignment: .leading, spacing: m.s(Design.rowSpacing)) {
                        ForEach(Array(state.tasks.prefix(7).enumerated()), id: \.element.id) { index, task in
                            TaskRow(
                                m: m,
                                task: task,
                                reserve: Design.rowMeetsArt(index)
                                    ? Design.artReserve(state.art)
                                    : 0
                            )
                        }
                    }
                }

                Spacer(minLength: m.s(4))

                WordOfTheDay(m: m, word: state.word)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

// MARK: - Widget view

struct FrogWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FrogWidgetEntry

    private var reference: CGSize {
        switch family {
        case .systemSmall: return Metrics.small
        case .systemLarge: return Metrics.large
        default: return Metrics.medium
        }
    }

    var body: some View {
        GeometryReader { geo in
            let m = Metrics(size: geo.size, reference: reference)
            content(m)
                .padding(.horizontal, m.s(family == .systemMedium ? 18 : 17))
                .padding(.vertical, m.s(18))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .containerBackground(for: .widget) { Palette.card }
    }

    @ViewBuilder
    private func content(_ m: Metrics) -> some View {
        if let state = entry.state, state.signedIn {
            switch family {
            case .systemSmall: SmallWidget(m: m, state: state)
            case .systemLarge: LargeWidget(m: m, state: state)
            default: MediumWidget(m: m, state: state)
            }
        } else {
            SignedOut(m: m)
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

private extension WidgetState {
    var remaining: Int { max(0, totalCount - doneCount) }
}
