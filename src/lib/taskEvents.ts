import { Types } from 'mongoose';
import TaskEventModel, {
  type TaskEventDoc,
  type TaskEventKind,
} from '@/lib/models/TaskEvent';

export type TaskSyncChange = {
  eventKind?: TaskEventKind;
  taskId?: string;
  completed?: boolean;
  date?: string;
  backgroundId?: string;
  slot?: string;
  itemId?: string | null;
};

export type TaskEventMessage = {
  eventId: string;
  eventKind: TaskEventKind;
  changedAt: string;
  taskId?: string;
  completed?: boolean;
  date?: string;
  backgroundId?: string;
  slot?: string;
  itemId?: string | null;
  replayed?: boolean;
};

type Subscriber = (event: TaskEventMessage) => void;

type GlobalWithTaskBus = typeof globalThis & {
  taskEventSubscribers?: Map<string, Set<Subscriber>>;
};

function getBus() {
  const g = globalThis as GlobalWithTaskBus;
  if (!g.taskEventSubscribers) g.taskEventSubscribers = new Map();
  return g.taskEventSubscribers;
}

export function subscribeTaskEvents(
  userId: string,
  fn: Subscriber,
): () => void {
  const bus = getBus();
  let subscribers = bus.get(userId);
  if (!subscribers) {
    subscribers = new Set();
    bus.set(userId, subscribers);
  }
  subscribers.add(fn);
  return () => {
    const current = bus.get(userId);
    if (!current) return;
    current.delete(fn);
    if (current.size === 0) bus.delete(userId);
  };
}

function toMessage(doc: TaskEventDoc, replayed = false): TaskEventMessage {
  return {
    eventId: String(doc._id),
    eventKind: doc.eventKind,
    changedAt: doc.createdAt.toISOString(),
    taskId: doc.taskId,
    completed: doc.completed,
    date: doc.date,
    backgroundId: doc.backgroundId,
    slot: doc.slot,
    itemId: doc.itemId,
    replayed,
  };
}

export async function createTaskEvent(
  userId: string,
  change: TaskSyncChange = {},
) {
  const eventKind =
    change.eventKind ??
    (typeof change.completed === 'boolean'
      ? change.completed
        ? 'task-completed'
        : 'task-uncompleted'
      : 'tasks-changed');

  const doc = await TaskEventModel.create({
    userId,
    eventKind,
    taskId: change.taskId,
    completed: change.completed,
    date: change.date,
    backgroundId: change.backgroundId,
    slot: change.slot,
    itemId: change.itemId,
  });
  const message = toMessage(doc);
  publishTaskEvent(userId, message);
  return message;
}

export async function getTaskEventsAfter(userId: string, after?: string | null) {
  const query: Record<string, unknown> = { userId };
  if (after && Types.ObjectId.isValid(after)) {
    query._id = { $gt: new Types.ObjectId(after) };
  }
  const docs = await TaskEventModel.find(query)
    .sort({ _id: 1 })
    .limit(250)
    .lean<TaskEventDoc[]>();
  return docs.map((doc) => toMessage(doc, true));
}

export function publishTaskEvent(userId: string, event: TaskEventMessage) {
  const subscribers = getBus().get(userId);
  if (!subscribers || subscribers.size === 0) return;
  subscribers.forEach((fn) => {
    try {
      fn(event);
    } catch {
      void 0;
    }
  });
}
