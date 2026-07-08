import { Types } from 'mongoose';
import { v4 as uuid } from 'uuid';
import connectMongo from '@/lib/mongoose';
import TaskModel, { type TaskDoc, type Weekday } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import CalendarConnectionModel, {
  type CalendarConnectionDoc,
} from '@/lib/models/CalendarConnection';
import CalendarEventLinkModel, {
  type CalendarEventLinkDoc,
} from '@/lib/models/CalendarEventLink';
import { getZonedToday } from '@/lib/utils';
import { addDaysYMD, dowFromYMD } from '@/lib/taskOccurrence';
import { fingerprint } from './fingerprint';
import { neutralToAppRepeat, type NeutralToAppResult } from './recurrence';
import { minutesToReminder } from './reminders';
import {
  groupIntoUnits,
  neutralRecurrenceToCreateBody,
  taskUnitToNeutral,
  type TaskUnit,
} from './taskMapping';
import type { NeutralEvent } from './types';

export const SYNC_WINDOW_PAST_DAYS = 7;
export const SYNC_WINDOW_FUTURE_DAYS = 60;
export const MAX_IMPORTED_EVENTS = 500;

export type RemoteParse =
  | { kind: 'event'; neutral: NeutralEvent }
  | { kind: 'unsupported-recurrence'; neutral: NeutralEvent; reason: string }
  | { kind: 'skip'; reason: string };

export type RemoteChange = {
  providerEventId?: string;
  providerHref?: string;
  providerUid?: string;
  etag?: string;
  status: 'active' | 'cancelled';
  cancelledInstance?: { parentEventId: string; date: string };
  parse?: RemoteParse;
};

export type ProviderWriteResult = {
  providerEventId?: string;
  providerHref?: string;
  providerUid?: string;
  etag?: string;
};

export type ProviderAdapter = {
  provider: 'google' | 'apple';
  insert(
    conn: CalendarConnectionDoc,
    neutral: NeutralEvent,
    fp: string,
  ): Promise<ProviderWriteResult>;
  update(
    conn: CalendarConnectionDoc,
    link: CalendarEventLinkDoc,
    neutral: NeutralEvent,
    fp: string,
    opts: { instanceOnly: boolean },
  ): Promise<ProviderWriteResult | 'conflict' | 'gone'>;
  /** Delete the remote event; recurring events with past occurrences are
   *  truncated (UNTIL=yesterday) instead so calendar history survives. */
  removeOrEnd(
    conn: CalendarConnectionDoc,
    link: CalendarEventLinkDoc,
    todayYMD: string,
    tz: string,
  ): Promise<void>;
  /** Expand a recurring event the app cannot represent into concrete
   *  instance occurrences within the window. */
  listInstances(
    conn: CalendarConnectionDoc,
    change: RemoteChange,
    windowStart: string,
    windowEnd: string,
    tz: string,
  ): Promise<{ date: string; instanceEventId?: string; instanceHref?: string }[]>;
};

export async function getUserTz(userId: string): Promise<string> {
  const user = await UserModel.findById(userId, {
    'notificationPrefs.timezone': 1,
  }).lean<{ notificationPrefs?: { timezone?: string } }>();
  return user?.notificationPrefs?.timezone || 'UTC';
}

function linkKeyFilter(link: CalendarEventLinkDoc) {
  return link.repeatGroupId
    ? { repeatGroupId: link.repeatGroupId }
    : { id: link.taskId };
}

async function loadUnitForLink(
  link: CalendarEventLinkDoc,
): Promise<TaskUnit | null> {
  const docs = await TaskModel.find({
    userId: link.userId,
    ...linkKeyFilter(link),
  }).lean<TaskDoc[]>();
  if (docs.length === 0) return null;
  return {
    key: link.repeatGroupId
      ? { repeatGroupId: link.repeatGroupId }
      : { taskId: link.taskId },
    docs,
  };
}

async function nextOrderForDate(uid: string, date: string) {
  const dow = dowFromYMD(date);
  const last = await TaskModel.findOne(
    {
      userId: uid,
      $or: [
        { type: 'weekly', dayOfWeek: dow },
        { type: 'regular', date },
      ],
    },
    { order: 1 },
  )
    .sort({ order: -1 })
    .lean<TaskDoc>();
  return (last?.order ?? 0) + 1;
}

async function createDatedTask(
  uid: string,
  neutral: NeutralEvent,
  importTagId?: string,
  dateOverride?: string,
): Promise<string> {
  const date = dateOverride ?? neutral.startDate;
  const id = uuid();
  const now = new Date();
  await TaskModel.create({
    userId: uid,
    type: 'regular',
    id,
    text: neutral.title,
    order: await nextOrderForDate(uid, date),
    date,
    completed: false,
    createdAt: now,
    updatedAt: now,
    tags: importTagId ? [importTagId] : [],
    notes: neutral.notes,
    startTime: neutral.startTime,
    endTime: neutral.endTime,
    reminder: minutesToReminder(neutral.reminderMinutes),
  });
  return id;
}

/** Create app task(s) for an inbound event. Returns the link key. */
async function createTasksFromNeutral(
  uid: string,
  neutral: NeutralEvent,
  tz: string,
  importTagId?: string,
): Promise<{ taskId?: string; repeatGroupId?: string } | null> {
  if (!neutral.recurrence) {
    return { taskId: await createDatedTask(uid, neutral, importTagId) };
  }

  const appShape = neutralToAppRepeat(neutral.recurrence, neutral.startDate);
  if (!appShape) return null;

  const body = neutralRecurrenceToCreateBody(neutral, neutral.recurrence, appShape);
  if (importTagId) body.tags = [importTagId];
  body.reminder = minutesToReminder(neutral.reminderMinutes);

  const { createTasksForUser } = await import('@/app/api/tasks/route');
  const result = await createTasksForUser(uid, body, tz);
  if (!result.ok) {
    console.error('calendar import create failed:', result.error);
    return null;
  }

  if (neutral.exdates?.length) {
    await TaskModel.updateMany(
      { userId: uid, id: { $in: result.ids } },
      { $addToSet: { suppressedDates: { $each: neutral.exdates } } },
    );
  }

  if (result.repeatGroupId) return { repeatGroupId: result.repeatGroupId };
  return result.ids[0] ? { taskId: result.ids[0] } : null;
}

function recurrenceEquals(a?: NeutralEvent['recurrence'], b?: NeutralEvent['recurrence']) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.freq === b.freq &&
    a.interval === b.interval &&
    (a.until ?? '') === (b.until ?? '') &&
    JSON.stringify([...(a.byWeekday ?? [])].sort()) ===
      JSON.stringify([...(b.byWeekday ?? [])].sort()) &&
    JSON.stringify([...(a.byMonthday ?? [])].sort()) ===
      JSON.stringify([...(b.byMonthday ?? [])].sort())
  );
}

function setRepeatBody(shape: NeutralToAppResult) {
  switch (shape.kind) {
    case 'daily':
    case 'weekdays':
    case 'weekend':
      return { mode: shape.kind, endDate: shape.repeatEndDate };
    case 'weekly':
      return { mode: 'weekly', dayOfWeek: shape.dayOfWeek, endDate: shape.repeatEndDate };
    case 'monthly':
      return { mode: 'monthly', endDate: shape.repeatEndDate };
    case 'custom':
      return { mode: 'custom', rule: shape.rule, endDate: shape.repeatEndDate };
  }
}

/** Apply an inbound remote state onto an existing app unit. */
async function applyInboundUpdate(
  uid: string,
  unit: TaskUnit,
  remote: NeutralEvent,
  appNeutral: NeutralEvent,
  tz: string,
): Promise<boolean> {
  const ids = unit.docs.map((d) => d.id);
  const set: Record<string, unknown> = { text: remote.title };
  const unset: Record<string, unknown> = {};
  if (remote.notes !== undefined) set.notes = remote.notes;
  else unset.notes = 1;
  if (remote.startTime !== undefined) set.startTime = remote.startTime;
  else unset.startTime = 1;
  if (remote.endTime !== undefined) set.endTime = remote.endTime;
  else unset.endTime = 1;
  const reminder = minutesToReminder(remote.reminderMinutes);
  if (reminder !== undefined) set.reminder = reminder;
  else unset.reminder = 1;

  await TaskModel.updateMany(
    { userId: uid, id: { $in: ids } },
    {
      $set: set,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );

  const primary = unit.docs[0];

  if (!recurrenceEquals(appNeutral.recurrence, remote.recurrence)) {
    const { applySetRepeat } = await import('@/app/api/tasks/route');
    if (!remote.recurrence) {
      await applySetRepeat(uid, primary.id, { mode: 'none' }, remote.startDate, tz);
    } else {
      const shape = neutralToAppRepeat(remote.recurrence, remote.startDate);
      if (shape) {
        await applySetRepeat(
          uid,
          primary.id,
          setRepeatBody(shape),
          remote.startDate,
          tz,
        );
      }
    }
  } else if (!remote.recurrence && primary.type === 'regular') {
    if (primary.date !== remote.startDate) {
      await TaskModel.updateOne(
        { userId: uid, id: primary.id },
        { $set: { date: remote.startDate } },
      );
    }
  }

  if (remote.recurrence && remote.exdates?.length) {
    const keyFilter = unit.key.repeatGroupId
      ? { repeatGroupId: unit.key.repeatGroupId }
      : { id: unit.key.taskId };
    await TaskModel.updateMany(
      { userId: uid, ...keyFilter },
      { $addToSet: { suppressedDates: { $each: remote.exdates } } },
    );
  }

  return true;
}

async function updateLinkAfterSync(
  link: CalendarEventLinkDoc,
  fp: string,
  write?: ProviderWriteResult,
) {
  await CalendarEventLinkModel.updateOne(
    { _id: link._id },
    {
      $set: {
        lastSyncedFingerprint: fp,
        lastSyncedAt: new Date(),
        ...(write?.etag ? { etag: write.etag } : {}),
        ...(write?.providerEventId ? { providerEventId: write.providerEventId } : {}),
        ...(write?.providerHref ? { providerHref: write.providerHref } : {}),
        ...(write?.providerUid ? { providerUid: write.providerUid } : {}),
      },
    },
  );
}

function changeIdFilter(conn: CalendarConnectionDoc, change: RemoteChange) {
  const or: Record<string, unknown>[] = [];
  if (change.providerEventId) or.push({ providerEventId: change.providerEventId });
  if (change.providerHref) or.push({ providerHref: change.providerHref });
  if (change.providerUid) or.push({ providerUid: change.providerUid });
  return {
    userId: conn.userId,
    connectionId: conn._id,
    ...(or.length ? { $or: or } : { providerEventId: '__none__' }),
  };
}

/**
 * Process a batch of inbound remote changes for one connection.
 * Returns true when any app-side task data changed (caller notifies clients).
 */
export async function processRemoteChanges(
  conn: CalendarConnectionDoc,
  adapter: ProviderAdapter,
  changes: RemoteChange[],
  tz: string,
): Promise<boolean> {
  await connectMongo();
  const todayYMD = getZonedToday(tz);
  const windowStart = addDaysYMD(todayYMD, -SYNC_WINDOW_PAST_DAYS);
  const windowEnd = addDaysYMD(todayYMD, SYNC_WINDOW_FUTURE_DAYS);
  let appChanged = false;

  for (const change of changes) {
    try {
      if (change.status === 'cancelled' && change.cancelledInstance) {
        appChanged =
          (await handleCancelledInstance(conn, change.cancelledInstance, todayYMD, tz)) ||
          appChanged;
        continue;
      }

      const links = await CalendarEventLinkModel.find(
        changeIdFilter(conn, change),
      ).lean<CalendarEventLinkDoc[]>();

      if (change.status === 'cancelled') {
        appChanged = (await handleCancelledEvent(conn, links, tz, todayYMD)) || appChanged;
        continue;
      }

      const parse = change.parse;
      if (!parse || parse.kind === 'skip') continue;

      if (parse.kind === 'unsupported-recurrence') {
        appChanged =
          (await handleUnsupportedRecurrence(
            conn,
            adapter,
            change,
            parse.neutral,
            links,
            windowStart,
            windowEnd,
            tz,
          )) || appChanged;
        continue;
      }

      const remote = parse.neutral;
      const remoteFp = fingerprint(remote);
      const link = links.find((l) => !l.recurrenceInstanceId);

      if (!link) {
        if (!conn.settings.importEnabled) continue;
        if (remote.startDate < windowStart || remote.startDate > windowEnd) {
          if (!remote.recurrence) continue;
        }
        const created = await createTasksFromNeutral(
          conn.userId,
          remote,
          tz,
          conn.settings.importTagId,
        );
        if (!created) continue;
        await CalendarEventLinkModel.create({
          userId: conn.userId,
          connectionId: conn._id,
          provider: conn.provider,
          ...created,
          providerEventId: change.providerEventId,
          providerHref: change.providerHref,
          providerUid: change.providerUid,
          etag: change.etag,
          origin: 'calendar',
          lastSyncedAt: new Date(),
          lastSyncedFingerprint: remoteFp,
        });
        appChanged = true;
        continue;
      }

      if (remoteFp === link.lastSyncedFingerprint) {
        if (change.etag && change.etag !== link.etag) {
          await CalendarEventLinkModel.updateOne(
            { _id: link._id },
            { $set: { etag: change.etag } },
          );
        }
        continue;
      }

      const unit = await loadUnitForLink(link);
      if (!unit) continue;

      const appNeutral = taskUnitToNeutral(unit, tz, todayYMD);
      if (!appNeutral) continue;
      const appFp = fingerprint(appNeutral);

      if (appFp === link.lastSyncedFingerprint) {
        await applyInboundUpdate(conn.userId, unit, remote, appNeutral, tz);
        await updateLinkAfterSync(link, remoteFp, { etag: change.etag });
        appChanged = true;
      } else {
        const write = await adapter.update(conn, link, appNeutral, appFp, {
          instanceOnly: !!link.recurrenceInstanceId,
        });
        if (write === 'gone') {
          await CalendarEventLinkModel.deleteOne({ _id: link._id });
        } else if (write !== 'conflict') {
          await updateLinkAfterSync(link, appFp, write);
        }
      }
    } catch (err) {
      console.error(
        `calendar inbound change failed (${conn.provider}):`,
        (err as Error)?.message,
      );
    }
  }

  return appChanged;
}

async function handleCancelledInstance(
  conn: CalendarConnectionDoc,
  instance: { parentEventId: string; date: string },
  todayYMD: string,
  tz: string,
): Promise<boolean> {
  const instanceLink = await CalendarEventLinkModel.findOne({
    userId: conn.userId,
    connectionId: conn._id,
    recurrenceInstanceId: instance.parentEventId,
  }).lean<CalendarEventLinkDoc>();

  if (instanceLink) {
    const links = await CalendarEventLinkModel.find({
      userId: conn.userId,
      connectionId: conn._id,
      recurrenceInstanceId: instance.parentEventId,
    }).lean<CalendarEventLinkDoc[]>();
    let changed = false;
    for (const link of links) {
      const doc = await TaskModel.findOne({
        userId: conn.userId,
        id: link.taskId,
        date: instance.date,
      }).lean<TaskDoc>();
      if (doc) {
        const unit: TaskUnit = { key: { taskId: doc.id }, docs: [doc] };
        const appNeutral = taskUnitToNeutral(unit, tz, todayYMD);
        if (appNeutral && fingerprint(appNeutral) === link.lastSyncedFingerprint) {
          await TaskModel.deleteOne({ userId: conn.userId, id: doc.id });
          await CalendarEventLinkModel.deleteOne({ _id: link._id });
          changed = true;
        }
      }
    }
    return changed;
  }

  const link = await CalendarEventLinkModel.findOne({
    userId: conn.userId,
    connectionId: conn._id,
    providerEventId: instance.parentEventId,
    recurrenceInstanceId: { $exists: false },
  }).lean<CalendarEventLinkDoc>();
  if (!link) return false;

  const res = await TaskModel.updateMany(
    { userId: conn.userId, ...linkKeyFilter(link) },
    { $addToSet: { suppressedDates: instance.date } },
  );
  if (res.modifiedCount > 0) {
    const unit = await loadUnitForLink(link);
    if (unit) {
      const appNeutral = taskUnitToNeutral(unit, tz, todayYMD);
      if (appNeutral) await updateLinkAfterSync(link, fingerprint(appNeutral));
    }
    return true;
  }
  return false;
}

async function handleCancelledEvent(
  conn: CalendarConnectionDoc,
  links: CalendarEventLinkDoc[],
  tz: string,
  todayYMD: string,
): Promise<boolean> {
  let appChanged = false;
  for (const link of links) {
    const unit = await loadUnitForLink(link);
    if (!unit) {
      await CalendarEventLinkModel.deleteOne({ _id: link._id });
      continue;
    }
    const appNeutral = taskUnitToNeutral(unit, tz, todayYMD);
    const appFp = appNeutral ? fingerprint(appNeutral) : null;
    if (appFp && appFp !== link.lastSyncedFingerprint) {
      // App modified since last sync — app wins; dropping the link makes the
      // outbound sweep re-create the event fresh.
      await CalendarEventLinkModel.deleteOne({ _id: link._id });
      continue;
    }
    await TaskModel.deleteMany({ userId: conn.userId, ...linkKeyFilter(link) });
    await CalendarEventLinkModel.deleteOne({ _id: link._id });
    appChanged = true;
  }
  return appChanged;
}

async function handleUnsupportedRecurrence(
  conn: CalendarConnectionDoc,
  adapter: ProviderAdapter,
  change: RemoteChange,
  neutral: NeutralEvent,
  links: CalendarEventLinkDoc[],
  windowStart: string,
  windowEnd: string,
  tz: string,
): Promise<boolean> {
  if (!conn.settings.importEnabled) return false;
  const parentId = change.providerEventId ?? change.providerHref;
  if (!parentId) return false;

  let instances: { date: string; instanceEventId?: string; instanceHref?: string }[];
  try {
    instances = await adapter.listInstances(conn, change, windowStart, windowEnd, tz);
  } catch (err) {
    console.error('calendar listInstances failed:', (err as Error)?.message);
    return false;
  }

  const instanceLinks = links.filter((l) => l.recurrenceInstanceId === parentId);
  const linkByDate = new Map<string, CalendarEventLinkDoc>();
  for (const l of instanceLinks) {
    const doc = await TaskModel.findOne({ userId: conn.userId, id: l.taskId }, { date: 1 }).lean<{ date?: string }>();
    if (doc?.date) linkByDate.set(doc.date, l);
  }

  const perInstanceNeutral = (date: string): NeutralEvent => ({
    ...neutral,
    startDate: date,
    recurrence: undefined,
    exdates: undefined,
  });

  let appChanged = false;
  const seenDates = new Set<string>();

  for (const inst of instances) {
    if (inst.date < windowStart || inst.date > windowEnd) continue;
    seenDates.add(inst.date);
    const instNeutral = perInstanceNeutral(inst.date);
    const instFp = fingerprint(instNeutral);
    const existing = linkByDate.get(inst.date);

    if (!existing) {
      const taskId = await createDatedTask(
        conn.userId,
        instNeutral,
        conn.settings.importTagId,
        inst.date,
      );
      await CalendarEventLinkModel.create({
        userId: conn.userId,
        connectionId: conn._id,
        provider: conn.provider,
        taskId,
        providerEventId: inst.instanceEventId ?? change.providerEventId,
        providerHref: inst.instanceHref ?? change.providerHref,
        providerUid: change.providerUid,
        recurrenceInstanceId: parentId,
        origin: 'calendar',
        lastSyncedAt: new Date(),
        lastSyncedFingerprint: instFp,
      });
      appChanged = true;
      continue;
    }

    if (instFp === existing.lastSyncedFingerprint) continue;
    const unit = await loadUnitForLink(existing);
    if (!unit) continue;
    const appNeutral = taskUnitToNeutral(unit, tz, windowStart);
    if (!appNeutral) continue;
    const appFp = fingerprint(appNeutral);
    if (appFp === existing.lastSyncedFingerprint) {
      await applyInboundUpdate(conn.userId, unit, instNeutral, appNeutral, tz);
      await updateLinkAfterSync(existing, instFp);
      appChanged = true;
    }
  }

  // Instances that disappeared remotely (deleted occurrences)
  const staleEntries: [string, CalendarEventLinkDoc][] = [];
  linkByDate.forEach((link, date) => {
    if (!seenDates.has(date)) staleEntries.push([date, link]);
  });
  for (const [, link] of staleEntries) {
    try {
      const unit = await loadUnitForLink(link);
      if (unit) {
        const appNeutral = taskUnitToNeutral(unit, tz, windowStart);
        if (appNeutral && fingerprint(appNeutral) === link.lastSyncedFingerprint) {
          await TaskModel.deleteMany({ userId: conn.userId, id: link.taskId });
          appChanged = true;
        }
      }
      await CalendarEventLinkModel.deleteOne({ _id: link._id });
    } catch (err) {
      console.error('calendar instance cleanup failed:', (err as Error)?.message);
    }
  }

  return appChanged;
}

/**
 * Push app-side state out to every exporting connection for this user.
 * Fingerprints make repeat runs no-ops.
 */
export async function runOutboundSweep(
  userId: string,
  adapters: Record<string, ProviderAdapter>,
): Promise<void> {
  await connectMongo();
  const conns = await CalendarConnectionModel.find({
    userId,
    status: 'active',
    'settings.exportEnabled': true,
  }).lean<CalendarConnectionDoc[]>();
  if (conns.length === 0) return;

  const tz = await getUserTz(userId);
  const todayYMD = getZonedToday(tz);
  const windowEnd = addDaysYMD(todayYMD, SYNC_WINDOW_FUTURE_DAYS);

  const tasks = await TaskModel.find({
    userId,
    deletedAt: { $exists: false },
    bondId: { $exists: false },
    type: { $ne: 'backlog' },
  }).lean<TaskDoc[]>();

  const units = groupIntoUnits(tasks);
  const eligible: { unit: TaskUnit; neutral: NeutralEvent; fp: string }[] = [];
  for (const unit of units) {
    const neutral = taskUnitToNeutral(unit, tz, todayYMD);
    if (!neutral) continue;
    if (!neutral.recurrence) {
      if (neutral.startDate < todayYMD || neutral.startDate > windowEnd) continue;
    }
    eligible.push({ unit, neutral, fp: fingerprint(neutral) });
  }

  for (const conn of conns) {
    const adapter = adapters[conn.provider];
    if (!adapter) continue;
    try {
      const links = await CalendarEventLinkModel.find({
        userId,
        connectionId: conn._id,
      }).lean<CalendarEventLinkDoc[]>();

      const byTaskId = new Map<string, CalendarEventLinkDoc>();
      const byGroupId = new Map<string, CalendarEventLinkDoc>();
      for (const l of links) {
        if (l.taskId) byTaskId.set(l.taskId, l);
        if (l.repeatGroupId) byGroupId.set(l.repeatGroupId, l);
      }

      const liveKeys = new Set<string>();

      for (const { unit, neutral, fp } of eligible) {
        const link = unit.key.repeatGroupId
          ? byGroupId.get(unit.key.repeatGroupId)
          : byTaskId.get(unit.key.taskId!);
        liveKeys.add(unit.key.repeatGroupId ?? unit.key.taskId!);

        if (!link) {
          const write = await adapter.insert(conn, neutral, fp);
          await CalendarEventLinkModel.create({
            userId,
            connectionId: conn._id,
            provider: conn.provider,
            taskId: unit.key.taskId,
            repeatGroupId: unit.key.repeatGroupId,
            ...write,
            origin: 'app',
            lastSyncedAt: new Date(),
            lastSyncedFingerprint: fp,
          });
        } else if (fp !== link.lastSyncedFingerprint) {
          const write = await adapter.update(conn, link, neutral, fp, {
            instanceOnly: !!link.recurrenceInstanceId,
          });
          if (write === 'gone') {
            await CalendarEventLinkModel.deleteOne({ _id: link._id });
          } else if (write !== 'conflict') {
            await updateLinkAfterSync(link, fp, write);
          }
        }
      }

      // Links whose app unit no longer exists (or left the export set): the
      // event was deleted in the app -> remove/end it remotely. Only links we
      // created or previously matched are candidates; imported instance links
      // clean up in the inbound path.
      for (const link of links) {
        if (link.recurrenceInstanceId) continue;
        const key = link.repeatGroupId ?? link.taskId;
        if (!key || liveKeys.has(key)) continue;
        const stillExists = await TaskModel.exists({
          userId,
          ...linkKeyFilter(link),
        });
        if (stillExists) continue; // ineligible but alive (e.g. became buddy task) — leave remote as-is
        await adapter.removeOrEnd(conn, link, todayYMD, tz);
        await CalendarEventLinkModel.deleteOne({ _id: link._id });
      }
    } catch (err) {
      console.error(
        `calendar outbound sweep failed (${conn.provider}):`,
        (err as Error)?.message,
      );
    }
  }
}

/** Seed links for tasks imported by the legacy one-way Google sync. */
export async function seedLegacyGoogleLinks(
  conn: CalendarConnectionDoc,
  tz: string,
): Promise<void> {
  await connectMongo();
  const todayYMD = getZonedToday(tz);
  const legacy = await TaskModel.find({
    userId: conn.userId,
    calendarEventId: { $exists: true, $nin: [null, ''] },
  }).lean<TaskDoc[]>();

  for (const doc of legacy) {
    const exists = await CalendarEventLinkModel.exists({
      userId: conn.userId,
      connectionId: conn._id,
      providerEventId: doc.calendarEventId,
    });
    if (exists) continue;
    const unit: TaskUnit = { key: { taskId: doc.id }, docs: [doc] };
    const neutral = taskUnitToNeutral(unit, tz, todayYMD);
    if (!neutral) continue;
    await CalendarEventLinkModel.create({
      userId: conn.userId,
      connectionId: conn._id,
      provider: 'google',
      taskId: doc.id,
      providerEventId: doc.calendarEventId,
      origin: 'calendar',
      lastSyncedAt: new Date(),
      lastSyncedFingerprint: fingerprint(neutral),
    });
  }
}

export async function deleteConnectionData(connectionId: Types.ObjectId | string) {
  await connectMongo();
  await CalendarEventLinkModel.deleteMany({ connectionId });
  await CalendarConnectionModel.deleteOne({ _id: connectionId });
}
