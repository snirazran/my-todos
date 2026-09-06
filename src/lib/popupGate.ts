'use client';

import { create } from 'zustand';
import { useSheetStore } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';

/**
 * One place that answers "may an uninvited popup take the screen right now?".
 *
 * Two different questions get mixed up when every surface answers this for
 * itself:
 *
 *  - is something on screen already (a sheet, a cinematic, a hint spotlight)
 *  - is something about to be on screen that has the right of way
 *
 * The second one can't be read off any open-state flag, because the thing with
 * the right of way — the daily streak check-in — spends its first second in a
 * network call with nothing rendered yet. Anything that fires on a plain timer
 * during that second wins a race it should have lost. A hold is a claim on the
 * screen taken *before* the popup exists, so the rest of the app can wait for
 * it instead of racing it.
 */

/** Held by the daily login-streak flow, from check-in until its sheet closes. */
export const LOGIN_STREAK_HOLD = 'login-streak';

/** A hold nobody releases would mute every popup forever, so each one expires. */
const DEFAULT_HOLD_MS = 20_000;
/** Quiet beat after the holder is done, so the next popup isn't a jump cut. */
const DEFAULT_GRACE_MS = 1_200;
/** Longest a holder waiting for a busy screen keeps everyone else waiting. */
const HOLD_CEILING_MS = 45_000;
const POLL_MS = 600;

type GateState = {
  holds: string[];
  graceUntil: number;
};

export const usePopupGateStore = create<GateState>(() => ({
  holds: [],
  graceUntil: 0,
}));

const expiryTimers = new Map<string, number>();
let graceTimer = 0;

function clearExpiry(reason: string) {
  const timer = expiryTimers.get(reason);
  if (timer) window.clearTimeout(timer);
  expiryTimers.delete(reason);
}

/**
 * Claim the screen for `reason`. Calling it again refreshes the expiry, so a
 * holder that is still working can keep its claim alive.
 */
export function holdAutoPopups(reason: string, ttlMs = DEFAULT_HOLD_MS) {
  if (typeof window === 'undefined') return;
  clearExpiry(reason);
  if (Number.isFinite(ttlMs)) {
    expiryTimers.set(
      reason,
      window.setTimeout(() => releaseAutoPopups(reason, 0), Math.max(0, ttlMs)),
    );
  }
  usePopupGateStore.setState((state) => ({
    holds: state.holds.includes(reason) ? state.holds : [...state.holds, reason],
    graceUntil: 0,
  }));
}

export function releaseAutoPopups(reason: string, graceMs = DEFAULT_GRACE_MS) {
  if (typeof window === 'undefined') return;
  clearExpiry(reason);
  const { holds } = usePopupGateStore.getState();
  if (!holds.includes(reason)) return;
  const next = holds.filter((r) => r !== reason);
  const graceUntil = next.length === 0 && graceMs > 0 ? Date.now() + graceMs : 0;
  usePopupGateStore.setState({ holds: next, graceUntil });
  window.clearTimeout(graceTimer);
  if (!graceUntil) return;
  // The grace window has to end with a store write, not just a stale timestamp,
  // or a component parked on `useAutoPopupsHeld()` would never re-render.
  graceTimer = window.setTimeout(() => {
    const state = usePopupGateStore.getState();
    if (state.graceUntil && state.graceUntil <= Date.now()) {
      usePopupGateStore.setState({ graceUntil: 0 });
    }
  }, graceMs + 32);
}

function held(ignoreReason?: string) {
  const { holds, graceUntil } = usePopupGateStore.getState();
  if (ignoreReason && holds.includes(ignoreReason)) {
    return holds.some((reason) => reason !== ignoreReason);
  }
  return holds.length > 0 || graceUntil > Date.now();
}

/** True while something else has the right of way. */
export function areAutoPopupsHeld(ignoreReason?: string) {
  return held(ignoreReason);
}

/** True while anything at all owns the screen — a hold, a sheet, a cinematic. */
export function isScreenBusy(ignoreReason?: string) {
  if (held(ignoreReason)) return true;
  if (useSheetStore.getState().count > 0) return true;
  const ui = useUIStore.getState();
  return ui.isCinematicActive || !!ui.activeHint;
}

export function useAutoPopupsHeld() {
  return usePopupGateStore(
    (state) => state.holds.length > 0 || state.graceUntil > Date.now(),
  );
}

export function useScreenBusy() {
  const heldNow = useAutoPopupsHeld();
  const sheetOpen = useSheetStore((state) => state.count > 0);
  const cinematic = useUIStore((state) => state.isCinematicActive);
  const hinting = useUIStore((state) => !!state.activeHint);
  return heldNow || sheetOpen || cinematic || hinting;
}

type WaitOptions = {
  /** Give up after this long rather than queue forever. */
  dropAfterMs?: number;
  initialDelayMs?: number;
  /** A hold this caller owns, so it doesn't wait on itself — and so the hold
   *  stays alive while the caller is still trying to get on screen. */
  ownHold?: string;
};

function waitFor(
  isBlocked: () => boolean,
  show: () => void,
  { dropAfterMs, initialDelayMs = 900, ownHold }: WaitOptions,
) {
  const startedAt = Date.now();
  const deadline = dropAfterMs === undefined ? Infinity : startedAt + dropAfterMs;
  let timer = 0;
  let frame = 0;
  let cancelled = false;

  const tryOpen = () => {
    if (cancelled) return;
    if (!isBlocked()) {
      show();
      return;
    }
    if (Date.now() > deadline) {
      if (ownHold) releaseAutoPopups(ownHold, 0);
      return;
    }
    // A holder stuck behind a sheet the user never closes keeps waiting for its
    // own turn, but stops muting everyone else at the ceiling.
    if (ownHold) {
      if (Date.now() - startedAt < HOLD_CEILING_MS) holdAutoPopups(ownHold);
      else releaseAutoPopups(ownHold, 0);
    }
    timer = window.setTimeout(tryOpen, POLL_MS);
  };

  if (initialDelayMs <= 0) {
    frame = requestAnimationFrame(tryOpen);
  } else {
    timer = window.setTimeout(tryOpen, initialDelayMs);
  }

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (frame) cancelAnimationFrame(frame);
  };
}

/**
 * Run `show` at the next moment nothing else owns the screen — never over a
 * cinematic, never stacked on another sheet, never ahead of a holder. Two
 * full-screen popups on top of each other don't just look wrong: the lower one
 * is usually a Radix dialog, which parks `pointer-events: none` on the body, so
 * the one painted on top ends up inert. Returns a cancel function.
 */
export function whenScreenIsFree(show: () => void, options: WaitOptions = {}) {
  return waitFor(() => isScreenBusy(options.ownHold), show, options);
}

/**
 * Wait only for the right of way, not for the whole screen — for surfaces that
 * are content rather than an interruption (an inline card), or that already do
 * their own busy check.
 */
export function whenAutoPopupsAllowed(show: () => void, options: WaitOptions = {}) {
  return waitFor(() => areAutoPopupsHeld(options.ownHold), show, options);
}
