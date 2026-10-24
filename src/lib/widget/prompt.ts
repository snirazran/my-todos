'use client';

import type { WidgetPinState } from './types';

const STORAGE_KEY = 'frogress_widget_prompt';
const COMPLETED_KEY = 'frogress_completed_ever';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ASKS = 2;
const SECOND_ASK_DELAY_MS = 3 * DAY_MS;

export const TASK_COMPLETED_EVENT = 'frogress:task-completed';
export const PLEDGE_MADE_EVENT = 'frogress:pledge-made';
const PLEDGE_ASK_KEY = 'frogress_widget_pledge_asks';

function readPledgeAskedUids(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PLEDGE_ASK_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function recordPledgeAsk(uid: string): void {
  try {
    const uids = readPledgeAskedUids().filter((id) => id !== uid);
    localStorage.setItem(PLEDGE_ASK_KEY, JSON.stringify([...uids, uid].slice(-20)));
  } catch {
    /* ignore */
  }
}

/** The pledge is its own ask, once per account, outside the two-ask ladder. */
export function shouldAskAfterPledge(input: {
  pinState: WidgetPinState;
  uid: string;
}): boolean {
  if (!input.uid) return false;
  if (input.pinState === 'unsupported' || input.pinState === 'pinned') return false;
  return !readPledgeAskedUids().includes(input.uid);
}

export function announcePledgeMade(): void {
  try {
    window.dispatchEvent(new Event(PLEDGE_MADE_EVENT));
  } catch {
    /* ignore */
  }
}

/** Lifetime completed-task count on this device, the value-moment signal. */
export function readCompletedEver(): number {
  try {
    return Number(localStorage.getItem(COMPLETED_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

/** Called when a task is ticked, so the widget ask can wait for a real win. */
export function recordTaskCompleted(): void {
  try {
    localStorage.setItem(COMPLETED_KEY, String(readCompletedEver() + 1));
    window.dispatchEvent(new Event(TASK_COMPLETED_EVENT));
  } catch {
    /* ignore */
  }
}

type PromptState = {
  asks: number;
  lastAskAt: number;
  /** Set once the launcher confirms the pin, or the user says they added it. */
  added: boolean;
};

const EMPTY: PromptState = { asks: 0, lastAskAt: 0, added: false };

export function readPromptState(): PromptState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<PromptState>) };
  } catch {
    return EMPTY;
  }
}

function write(next: PromptState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function recordPromptShown(): void {
  const state = readPromptState();
  write({ ...state, asks: state.asks + 1, lastAskAt: Date.now() });
}

export function recordWidgetAdded(): void {
  write({ ...readPromptState(), added: true });
}

/**
 * The ask ladder. Two prompts, ever, and never before the user has ticked
 * something off.
 *
 * Accounts now start with tasks already in them, so the old worry — a cold
 * prompt showing an empty box — no longer applies; the preview looks right from
 * the first minute. The first completion is still the moment to ask, because it
 * is the first time the reward loop has actually fired for them, and the pitch
 * lands as "keep this going" rather than "here is a feature".
 */
export function shouldAskForWidget(input: {
  pinState: WidgetPinState;
  /** Tasks the user has ever ticked. The first one is the value moment. */
  completedEver: number;
  streak: number;
}): boolean {
  if (input.pinState === 'unsupported') return false;
  if (input.pinState === 'pinned') return false;

  const state = readPromptState();
  if (state.added) return false;
  if (state.asks >= MAX_ASKS) return false;
  if (input.completedEver < 1) return false;

  if (state.asks === 0) return true;

  // Second and final ask: only once the streak makes the pitch concrete.
  if (input.streak < 2) return false;
  return Date.now() - state.lastAskAt >= SECOND_ASK_DELAY_MS;
}
