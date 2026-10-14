import { v4 as uuid } from 'uuid';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import { getZonedToday } from '@/lib/utils';
import {
  addDaysYMD,
  habitGroupKey,
  habitKeyFilter,
  isAfterRepeatEnd,
  movedInOn,
  occursOnDate,
  repeatStartForDoc,
  ruleOccursOn,
  type MovedDate,
} from '@/lib/taskOccurrence';
import {
  planRuleMove,
  type RepeatMoveScope,
  type RulePlan,
} from '@/lib/repeatMove';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type MoveFailure =
  | 'invalid'
  | 'not_found'
  | 'not_repeating'
  | 'past'
  | 'completed'
  | 'not_occurrence'
  | 'occupied'
  | 'no_rule';

export type MoveResult =
  | {
      ok: true;
      scope: RepeatMoveScope;
      taskId: string;
      restored?: boolean;
      split?: boolean;
    }
  | { ok: false; error: MoveFailure; status: number };

const fail = (error: MoveFailure, status = 409): MoveResult => ({
  ok: false,
  error,
  status,
});

type DateMap<T> = Record<string, T> | undefined;

function shiftKey<T>(map: DateMap<T>, from: string, to: string): DateMap<T> {
  if (!map) return map;
  const next: Record<string, T> = { ...map };
  if (Object.prototype.hasOwnProperty.call(next, from)) {
    next[to] = next[from];
    delete next[from];
  } else {
    delete next[to];
  }
  return next;
}

function splitMap<T>(map: DateMap<T>, staysOld: (date: string) => boolean) {
  const before: Record<string, T> = {};
  const after: Record<string, T> = {};
  for (const key of Object.keys(map ?? {})) {
    if (staysOld(key)) before[key] = map![key];
    else after[key] = map![key];
  }
  return { before, after };
}

function hasKeys(map: Record<string, unknown> | undefined) {
  return !!map && Object.keys(map).length > 0;
}

export async function loadHabitSiblings(userId: string, doc: TaskDoc) {
  return TaskModel.find({
    userId,
    type: 'weekly',
    deletedAt: { $exists: false },
    ...habitKeyFilter(habitGroupKey(doc)),
  })
    .lean<TaskDoc[]>()
    .exec();
}

function occupiedBy(sibs: TaskDoc[], self: TaskDoc, date: string, tz: string) {
  if ((self.completedDates ?? []).includes(date)) return true;
  return sibs.some((sib) => occursOnDate(sib, date, tz));
}

function liveGroupDays(sibs: TaskDoc[], groupId: string, cut: string) {
  const days = new Set<number>();
  for (const sib of sibs) {
    if (sib.repeatGroupId !== groupId) continue;
    if (typeof sib.dayOfWeek !== 'number') continue;
    if (sib.repeatEndDate && sib.repeatEndDate < cut) continue;
    days.add(sib.dayOfWeek);
  }
  return Array.from(days);
}

function firstRuleDateBefore(doc: TaskDoc, cut: string, tz: string) {
  const start = repeatStartForDoc(doc, tz);
  if (!start || start >= cut) return null;
  let d = start;
  for (let guard = 0; guard < 800 && d < cut; guard++, d = addDaysYMD(d, 1)) {
    if (ruleOccursOn(doc, d, tz)) return d;
  }
  return null;
}

type Request = {
  userId: string;
  taskId: string;
  from: string;
  to: string;
  tz: string;
  order?: number;
};

async function loadMovable(req: Request) {
  if (!YMD.test(req.from) || !YMD.test(req.to)) return { error: fail('invalid', 400) };
  const doc = await TaskModel.findOne({
    userId: req.userId,
    id: req.taskId,
    deletedAt: { $exists: false },
  }).lean<TaskDoc>();
  if (!doc) return { error: fail('not_found', 404) };
  if (doc.type !== 'weekly') return { error: fail('not_repeating', 400) };
  if (req.to < getZonedToday(req.tz)) return { error: fail('past', 400) };
  if ((doc.completedDates ?? []).includes(req.from))
    return { error: fail('completed') };
  if (!occursOnDate(doc, req.from, req.tz)) return { error: fail('not_occurrence') };
  return { doc };
}

export async function moveOneOccurrence(req: Request): Promise<MoveResult> {
  const loaded = await loadMovable(req);
  if ('error' in loaded) return loaded.error!;
  const { doc } = loaded;
  const { from, to, userId, tz } = req;
  if (from === to) return { ok: true, scope: 'one', taskId: doc.id };

  const current = movedInOn(doc, from);
  const slot = current ? current.from : from;
  const moves = doc.movedDates ?? [];
  const now = new Date();
  const sibs = await loadHabitSiblings(userId, doc);
  if (occupiedBy(sibs, doc, to, tz)) return fail('occupied');

  if (to === slot) {
    await TaskModel.updateOne(
      { userId, id: doc.id },
      {
        $set: {
          movedDates: moves.filter((m) => m.from !== slot),
          checklistDoneByDate: shiftKey(doc.checklistDoneByDate, from, to) ?? {},
          checklistBudgetByDate: shiftKey(doc.checklistBudgetByDate, from, to) ?? {},
          ...(typeof req.order === 'number'
            ? { [`orderOverrides.${to}`]: req.order }
            : {}),
          updatedAt: now,
        },
        $pull: { suppressedDates: slot },
      },
    );
    return { ok: true, scope: 'one', taskId: doc.id, restored: true };
  }

  const nextMoves: MovedDate[] = moves
    .filter((m) => m.from !== slot && !(m.skipped && m.to === to))
    .concat({ from: slot, to });
  await TaskModel.updateOne(
    { userId, id: doc.id },
    {
      $set: {
        movedDates: nextMoves,
        checklistDoneByDate: shiftKey(doc.checklistDoneByDate, from, to) ?? {},
        checklistBudgetByDate: shiftKey(doc.checklistBudgetByDate, from, to) ?? {},
        ...(typeof req.order === 'number'
          ? { [`orderOverrides.${to}`]: req.order }
          : {}),
        updatedAt: now,
      },
      $addToSet: { suppressedDates: slot },
    },
  );
  return { ok: true, scope: 'one', taskId: doc.id };
}

export async function moveFutureOccurrences(req: Request): Promise<MoveResult> {
  const loaded = await loadMovable(req);
  if ('error' in loaded) return loaded.error!;
  const { doc } = loaded;
  const { from, to, userId, tz } = req;
  if (doc.bondId || movedInOn(doc, from)) return fail('no_rule');

  const today = getZonedToday(tz);
  const sibs = await loadHabitSiblings(userId, doc);
  if (occupiedBy(sibs, doc, to, tz)) return fail('occupied');

  const earliest = from < to ? from : to;
  const cut = earliest > today ? earliest : today;
  const groupDays = doc.repeatGroupId
    ? liveGroupDays(sibs, doc.repeatGroupId, cut)
    : null;
  const plan = planRuleMove(doc, from, to, today, groupDays);
  if (!plan) return fail('no_rule');

  const result = firstRuleDateBefore(doc, plan.cut, tz)
    ? await splitSeries(doc, plan, req)
    : await rewriteSeries(doc, plan, req);

  if (plan.groupMode && doc.repeatGroupId) {
    await TaskModel.updateMany(
      {
        userId,
        repeatGroupId: doc.repeatGroupId,
        deletedAt: { $exists: false },
      },
      { $set: { repeatMode: plan.groupMode } },
    );
  }
  return result;
}

function ruleFields(plan: RulePlan) {
  const set: Record<string, unknown> = {
    repeatMode: plan.set.repeatMode,
    repeatStartDate: plan.start,
  };
  const unset: Record<string, 1> = {};
  if (plan.set.repeatRule) set.repeatRule = plan.set.repeatRule;
  else unset.repeatRule = 1;
  if (typeof plan.set.repeatDayOfMonth === 'number')
    set.repeatDayOfMonth = plan.set.repeatDayOfMonth;
  else unset.repeatDayOfMonth = 1;
  if (typeof plan.set.dayOfWeek === 'number') set.dayOfWeek = plan.set.dayOfWeek;
  return { set, unset };
}

function pendingMovesAfter(moves: MovedDate[], cut: string) {
  const kept = moves.filter((m) => m.from < cut);
  const dropped = moves.filter((m) => m.from >= cut).map((m) => m.from);
  return { kept, dropped };
}

async function rewriteSeries(
  doc: TaskDoc,
  plan: RulePlan,
  req: Request,
): Promise<MoveResult> {
  const { set, unset } = ruleFields(plan);
  const { kept, dropped } = pendingMovesAfter(doc.movedDates ?? [], plan.cut);
  const suppressed = (doc.suppressedDates ?? []).filter(
    (d) => dropped.indexOf(d) === -1,
  );
  await TaskModel.updateOne(
    { userId: req.userId, id: doc.id },
    {
      $set: {
        ...set,
        movedDates: kept,
        suppressedDates: suppressed,
        checklistDoneByDate:
          shiftKey(doc.checklistDoneByDate, plan.from, plan.to) ?? {},
        checklistBudgetByDate:
          shiftKey(doc.checklistBudgetByDate, plan.from, plan.to) ?? {},
        ...(typeof req.order === 'number'
          ? { [`orderOverrides.${plan.to}`]: req.order }
          : {}),
        updatedAt: new Date(),
      },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
  return { ok: true, scope: 'future', taskId: doc.id };
}

async function splitSeries(
  doc: TaskDoc,
  plan: RulePlan,
  req: Request,
): Promise<MoveResult> {
  const { cut } = plan;
  const now = new Date();
  const newId = uuid();
  const lastOld = addDaysYMD(cut, -1);

  const completed = doc.completedDates ?? [];
  const late = doc.lateCompletedDates ?? [];
  const { kept, dropped } = pendingMovesAfter(doc.movedDates ?? [], cut);
  const keptTargets = kept.map((m) => m.to);
  const staysOld = (d: string) => d < cut || keptTargets.indexOf(d) !== -1;
  const suppressedOld = (doc.suppressedDates ?? []).filter((d) => d < cut);
  if (plan.from < cut && suppressedOld.indexOf(plan.from) === -1)
    suppressedOld.push(plan.from);
  const suppressedNew = (doc.suppressedDates ?? []).filter(
    (d) => d >= cut && dropped.indexOf(d) === -1,
  );

  const doneByDate = splitMap(
    shiftKey(doc.checklistDoneByDate, plan.from, plan.to),
    staysOld,
  );
  const budgetByDate = splitMap(
    shiftKey(doc.checklistBudgetByDate, plan.from, plan.to),
    staysOld,
  );
  const orderByDate = splitMap(doc.orderOverrides, staysOld);
  if (typeof req.order === 'number') orderByDate.after[plan.to] = req.order;
  const completedAt = splitMap(doc.completedAtByDate, staysOld);

  const groupId = doc.repeatGroupId;
  const key = habitGroupKey(doc);
  const { set: ruleSet } = ruleFields(plan);

  const endsLater = !doc.repeatEndDate || doc.repeatEndDate > lastOld;
  await TaskModel.updateOne(
    { userId: req.userId, id: doc.id },
    {
      $set: {
        ...(endsLater ? { repeatEndDate: lastOld } : {}),
        ...(groupId ? { habitKey: key } : {}),
        completedDates: completed.filter(staysOld),
        lateCompletedDates: late.filter(staysOld),
        completedAtByDate: completedAt.before,
        suppressedDates: suppressedOld,
        movedDates: kept,
        checklistDoneByDate: doneByDate.before,
        checklistBudgetByDate: budgetByDate.before,
        orderOverrides: orderByDate.before,
        updatedAt: now,
      },
      ...(groupId ? { $unset: { repeatGroupId: 1 } } : {}),
    },
  );

  await TaskModel.create({
    userId: req.userId,
    type: 'weekly',
    id: newId,
    text: doc.text,
    order: doc.order,
    tags: doc.tags ?? [],
    notes: doc.notes,
    checklist: doc.checklist?.map(({ id, text, reward }) => ({
      id,
      text,
      done: false,
      ...(reward ? { reward } : {}),
    })),
    startTime: doc.startTime,
    endTime: doc.endTime,
    reminder: doc.reminder,
    frogodoroSettings: doc.frogodoroSettings,
    sectionId: doc.sectionId,
    isSeededPlan: doc.isSeededPlan,
    ...ruleSet,
    ...(doc.repeatEndDate && !isAfterRepeatEnd(doc, cut)
      ? { repeatEndDate: doc.repeatEndDate }
      : {}),
    ...(groupId ? { repeatGroupId: groupId } : { habitKey: key }),
    completedDates: completed.filter((d) => !staysOld(d)),
    lateCompletedDates: late.filter((d) => !staysOld(d)),
    ...(hasKeys(completedAt.after) ? { completedAtByDate: completedAt.after } : {}),
    suppressedDates: suppressedNew,
    ...(hasKeys(doneByDate.after) ? { checklistDoneByDate: doneByDate.after } : {}),
    ...(hasKeys(budgetByDate.after)
      ? { checklistBudgetByDate: budgetByDate.after }
      : {}),
    ...(hasKeys(orderByDate.after) ? { orderOverrides: orderByDate.after } : {}),
    createdAt: doc.createdAt ?? now,
    updatedAt: now,
  });
  return { ok: true, scope: 'future', taskId: newId, split: true };
}

export async function skipOccurrence(userId: string, doc: TaskDoc, date: string) {
  const moved = movedInOn(doc, date);
  if (moved) {
    await TaskModel.updateOne(
      { userId, id: doc.id },
      {
        $set: {
          movedDates: (doc.movedDates ?? []).map((m) =>
            m.from === moved.from ? { ...m, skipped: true } : m,
          ),
        },
      },
    );
    return;
  }
  await TaskModel.updateOne(
    { userId, id: doc.id },
    { $addToSet: { suppressedDates: date } },
  );
}

export async function unskipOccurrence(userId: string, doc: TaskDoc, date: string) {
  const skippedMove = (doc.movedDates ?? []).find(
    (m) => m.skipped && m.to === date,
  );
  if (skippedMove) {
    await TaskModel.updateOne(
      { userId, id: doc.id },
      {
        $set: {
          movedDates: (doc.movedDates ?? []).map((m) =>
            m === skippedMove ? { from: m.from, to: m.to } : m,
          ),
        },
      },
    );
    return;
  }
  await TaskModel.updateOne(
    { userId, id: doc.id },
    { $pull: { suppressedDates: date } },
  );
}

export function discardPendingMoves(doc: TaskDoc, today: string) {
  const moves = doc.movedDates ?? [];
  if (moves.length === 0) return null;
  const pending = moves.filter((m) => m.to >= today);
  if (pending.length === 0) return null;
  const reopen = pending.filter((m) => m.from >= today).map((m) => m.from);
  return {
    movedDates: moves.filter((m) => m.to < today),
    suppressedDates: (doc.suppressedDates ?? []).filter(
      (d) => reopen.indexOf(d) === -1,
    ),
  };
}

export function parseMoveRequest(raw: unknown): {
  taskId: string;
  from: string;
  to: string;
  scope: RepeatMoveScope;
  order?: number;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.taskId !== 'string' || !r.taskId) return null;
  if (typeof r.from !== 'string' || !YMD.test(r.from)) return null;
  if (typeof r.to !== 'string' || !YMD.test(r.to)) return null;
  const scope = r.scope === 'future' ? 'future' : 'one';
  const order =
    typeof r.order === 'number' && Number.isFinite(r.order) ? r.order : undefined;
  return { taskId: r.taskId, from: r.from, to: r.to, scope, order };
}
