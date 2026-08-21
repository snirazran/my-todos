import Foundation
import WidgetKit

/// The only thing the app and the widget extension share.
///
/// The webview writes a rendered snapshot of today; the widget reads it. Taps
/// taken on the home screen go the other way, into a queue the webview drains
/// and replays through the normal task endpoints. Nothing here touches the
/// network — the extension has no session cookie and no idea who is signed in.
enum FrogWidgetStore {

    static let appGroup = "group.io.frog.tasks.liveactivities"
    static let kind = "FrogTasksWidget"

    private static let stateKey = "widget_state"
    private static let queueKey = "widget_queue"
    private static let maxQueue = 50
    private static let lock = NSLock()

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    // MARK: - State (app -> widget)

    static func setState(_ json: String) {
        defaults?.set(json, forKey: stateKey)
        reload()
    }

    static func clearState() {
        defaults?.removeObject(forKey: stateKey)
        reload()
    }

    static func readState() -> WidgetState? {
        guard
            let json = defaults?.string(forKey: stateKey),
            let data = json.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetState.self, from: data)
    }

    static func reload() {
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }

    /// Flips a row locally so the widget reacts on the next redraw, before any
    /// sync. The webview's next snapshot overwrites this.
    static func applyLocalToggle(taskId: String, done: Bool) {
        lock.lock()
        defer { lock.unlock() }
        guard
            var state = readState(),
            let index = state.tasks.firstIndex(where: { $0.id == taskId })
        else { return }
        state.tasks[index].done = done
        state.doneCount = state.tasks.filter(\.done).count
        guard
            let data = try? JSONEncoder().encode(state),
            let json = String(data: data, encoding: .utf8)
        else { return }
        defaults?.set(json, forKey: stateKey)
    }

    // MARK: - Queue (widget -> app)

    static func queueToggle(taskId: String, done: Bool) {
        lock.lock()
        defer { lock.unlock() }
        let state = readState()
        let action = PendingAction(
            kind: "toggle",
            clientId: UUID().uuidString,
            taskId: taskId,
            text: nil,
            done: done,
            uid: state?.uid ?? "",
            guest: state?.guest ?? false,
            at: Date().timeIntervalSince1970 * 1000
        )
        var queue = readQueue()
        queue.append(action)
        if queue.count > maxQueue {
            queue.removeFirst(queue.count - maxQueue)
        }
        writeQueue(queue)
    }

    /// Reads and empties the queue in one step, so nothing replays twice.
    static func drainQueue() -> String {
        lock.lock()
        defer { lock.unlock() }
        let json = defaults?.string(forKey: queueKey) ?? "[]"
        defaults?.removeObject(forKey: queueKey)
        return json
    }

    private static func readQueue() -> [PendingAction] {
        guard
            let json = defaults?.string(forKey: queueKey),
            let data = json.data(using: .utf8),
            let queue = try? JSONDecoder().decode([PendingAction].self, from: data)
        else { return [] }
        return queue
    }

    private static func writeQueue(_ queue: [PendingAction]) {
        guard
            let data = try? JSONEncoder().encode(queue),
            let json = String(data: data, encoding: .utf8)
        else { return }
        defaults?.set(json, forKey: queueKey)
    }
}

// MARK: - Wire format (mirrors src/lib/widget/types.ts)

struct WidgetTask: Codable, Identifiable, Hashable {
    let id: String
    let text: String
    var done: Bool
}

struct WidgetState: Codable {
    let v: Int
    let uid: String
    let guest: Bool
    let signedIn: Bool
    let day: String
    let streak: Int
    let mood: String
    var doneCount: Int
    let totalCount: Int
    /// Optional so a snapshot written before this field existed still decodes.
    let message: String?
    var tasks: [WidgetTask]
    let updatedAt: Double
}

struct PendingAction: Codable {
    let kind: String
    let clientId: String
    let taskId: String?
    let text: String?
    let done: Bool?
    let uid: String
    let guest: Bool
    let at: Double
}
