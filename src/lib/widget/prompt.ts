'use client';

import type { WidgetPinState } from './types';

const STORAGE_KEY = 'frogress_widget_prompt';
const COMPLETED_KEY = 'frogress_completed_ever';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ASKS = 2;
const SECOND_ASK_DELAY_MS = 3 * DAY_MS;

export const TASK_COMPLETED_EVENT = 'frogress:task-completed';

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
 * The ask ladder. Two prompts, ever, and never before the user has something
 * worth putting on their home screen — a cold prompt at signup would show an
 * empty box and burn the only good moment we get.
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
