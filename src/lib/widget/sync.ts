'use client';

import {
  WIDGET_PAYLOAD_VERSION,
  WIDGET_TASK_LIMIT,
  type FrogMood,
  type PendingAction,
  type WidgetPayload,
  type WidgetTask,
} from './types';
import { clearWidgetState, drainWidgetQueue, pushWidgetState } from './bridge';
import { pickWidgetLine, type WidgetUrgency } from '@/lib/widget/widgetSpeech';

const SEEN_GUEST_UIDS_KEY = 'frogress_widget_guest_uids';

export function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function todayKey(tz = clientTimezone()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function moodFrom(fullness: number | null, allDone: boolean): FrogMood {
  if (fullness !== null && fullness <= 0.2) return 'hungry';
  if (allDone) return 'happy';
  if (fullness !== null && fullness >= 0.7) return 'happy';
  return 'neutral';
}

/**
 * Guest uids are device-local: nothing on the server links them to the person
 * once they upgrade or switch accounts. We remember which uids on this device
 * were guests so queued widget actions from a guest session can be replayed
 * onto whoever ends up signed in, instead of being silently dropped.
 */
export function rememberGuestUid(uid: string): void {
  if (!uid) return;
  try {
    const raw = localStorage.getItem(SEEN_GUEST_UIDS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (list.includes(uid)) return;
    list.push(uid);
    localStorage.setItem(
      SEEN_GUEST_UIDS_KEY,
      JSON.stringify(list.slice(-10)),
    );
  } catch {
    /* ignore */
  }
}

function guestUidsOnThisDevice(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_GUEST_UIDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Decides whether a queued native action may be applied to the signed-in user.
 *
 * - same uid: always.
 * - a guest uid seen on this device: yes. The queue was written before the
 *   upgrade (or before the guest signed into a real account), and the work
 *   belongs to the person holding the phone either way.
 * - anything else: drop. That's a different real account's data and must never
 *   cross over.
 */
export function mayApply(action: PendingAction, currentUid: string): boolean {
  if (!currentUid) return false;
  if (action.uid === currentUid) return true;
  if (!action.guest) return false;
  return guestUidsOnThisDevice().includes(action.uid);
}

let lastMessageKey = '';
let lastMessage = { line: '', urgency: 'calm' as WidgetUrgency };

/**
 * The frog's line, held stable across pushes.
 *
 * Keyed to the things the line actually reacts to, so it only changes when the
 * situation does — otherwise every sync would reword the same sentence and
 * spend a WidgetKit reload doing it.
 */
function widgetMessage(input: {
  done: number;
  total: number;
  fullness: number | null;
  streak: number;
  checkedInToday: boolean;
}): { line: string; urgency: WidgetUrgency } {
  const hungerPercent =
    input.fullness === null ? null : Math.round(input.fullness * 100);
  const hour = new Date().getHours();
  const key = [
    todayKey(),
    hour,
    input.done,
    input.total,
    hungerPercent === null ? 'x' : Math.floor(hungerPercent / 20),
    input.streak,
    input.checkedInToday ? 'in' : 'out',
  ].join('|');

  if (key === lastMessageKey && lastMessage.line) return lastMessage;
  lastMessageKey = key;
  lastMessage = pickWidgetLine(
    {
      done: input.done,
      total: input.total,
      streak: input.streak,
      checkedInToday: input.checkedInToday,
      hungerPercent,
      hour,
    },
    key,
  );
  return lastMessage;
}

export function buildPayload(input: {
  uid: string;
  guest: boolean;
  tasks: { id: string; text: string; completed: boolean }[];
  fullness: number | null;
  streak: number;
  checkedInToday: boolean;
}): WidgetPayload {
  const open = input.tasks.filter((t) => !t.completed);
  const done = input.tasks.filter((t) => t.completed);
  // Open work first — the widget is a prompt, not a report.
  const ordered = [...open, ...done].slice(0, WIDGET_TASK_LIMIT);
  const rows: WidgetTask[] = ordered.map((t) => ({
    id: t.id,
    text: t.text.length > 60 ? `${t.text.slice(0, 59)}…` : t.text,
    done: t.completed,
  }));

  const speech = widgetMessage({
    done: done.length,
    total: input.tasks.length,
    fullness: input.fullness,
    streak: input.streak,
    checkedInToday: input.checkedInToday,
  });

  return {
    v: WIDGET_PAYLOAD_VERSION,
    uid: input.uid,
    guest: input.guest,
    signedIn: Boolean(input.uid),
    day: todayKey(),
    streak: input.streak,
    mood: moodFrom(
      input.fullness,
      input.tasks.length > 0 && open.length === 0,
    ),
    doneCount: done.length,
    totalCount: input.tasks.length,
    message: speech.line,
    urgency: speech.urgency,
    tasks: rows,
    updatedAt: Date.now(),
  };
}

/**
 * Everything except the timestamp. Pushing an identical snapshot would spend a
 * WidgetKit reload for no visible change, and iOS only allows on the order of
 * 40-70 a day — shared with the Frogodoro Live Activity.
 */
function signatureOf(payload: WidgetPayload): string {
  const { updatedAt: _updatedAt, ...rest } = payload;
  return JSON.stringify(rest);
}

let lastSignature: string | null = null;

export async function syncWidget(payload: WidgetPayload): Promise<void> {
  const signature = signatureOf(payload);
  if (signature === lastSignature) return;
  lastSignature = signature;
  if (payload.guest) rememberGuestUid(payload.uid);
  await pushWidgetState(payload);
}

export async function signOutWidget(): Promise<void> {
  lastSignature = null;
  await clearWidgetState();
}

type FlushResult = {
  added: number;
  toggled: number;
  dropped: number;
};

async function postAdds(
  adds: Extract<PendingAction, { kind: 'add' }>[],
  tz: string,
  day: string,
): Promise<number> {
  if (adds.length === 0) return 0;
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        timezone: tz,
        tasks: adds.map((a) => ({
          text: a.text,
          repeat: 'this-week',
          dates: [day],
        })),
      }),
    });
    return res.ok ? adds.length : 0;
  } catch {
    // The queue is already drained; a failed add is lost rather than duplicated.
    return 0;
  }
}

async function putToggle(
  action: Extract<PendingAction, { kind: 'toggle' }>,
  tz: string,
  day: string,
): Promise<boolean> {
  try {
    const res = await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        date: day,
        taskId: action.taskId,
        completed: action.done,
        timezone: tz,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Replays everything the widget queued while the webview was not running.
 *
 * Every action goes through the normal task endpoints, so fly caps, the ledger,
 * quest counters and undo all behave exactly as they do in-app. The native side
 * never writes to the server itself — it has no session cookie and no idea who
 * is signed in.
 */
export async function flushWidgetQueue(
  currentUid: string,
): Promise<FlushResult> {
  const actions = await drainWidgetQueue();
  const result: FlushResult = { added: 0, toggled: 0, dropped: 0 };
  if (actions.length === 0) return result;

  const tz = clientTimezone();
  const day = todayKey(tz);

  const applicable: PendingAction[] = [];
  for (const action of actions) {
    if (mayApply(action, currentUid)) applicable.push(action);
    else result.dropped += 1;
  }

  result.added = await postAdds(
    applicable.filter(
      (a): a is Extract<PendingAction, { kind: 'add' }> => a.kind === 'add',
    ),
    tz,
    day,
  );

  const toggles = applicable.filter(
    (a): a is Extract<PendingAction, { kind: 'toggle' }> => a.kind === 'toggle',
  );
  for (const action of toggles) {
    if (await putToggle(action, tz, day)) result.toggled += 1;
  }

  return result;
}
