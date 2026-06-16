'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { LiveActivities } from 'capacitor-live-activities';

/** Custom Android plugin (ongoing chronometer notification). iOS has no impl. */
interface FrogTimerPlugin {
  start(opts: {
    phase: string;
    isRunning: boolean;
    endTime: number;
    timeLeft: number;
    taskName: string;
  }): Promise<void>;
  update(opts: {
    phase: string;
    isRunning: boolean;
    endTime: number;
    timeLeft: number;
    taskName: string;
  }): Promise<void>;
  stop(): Promise<void>;
}

const FrogTimer = registerPlugin<FrogTimerPlugin>('FrogTimer');

/**
 * Cross-platform "live timer" controller for the Frogodoro focus/break timer.
 *
 * iOS  → ActivityKit Live Activity (lock screen + Dynamic Island) via
 *        capacitor-live-activities. The native `timer` element self-counts to
 *        `endTime`, exactly like the Apple Clock app, so it keeps ticking even
 *        while the app is backgrounded with no per-second JS updates.
 * Android → ongoing chronometer notification (Phase 2, custom plugin).
 * Web  → no-op.
 */

export interface LiveTimerSnapshot {
  /** Whether a timer session exists at all (running or paused). */
  active: boolean;
  isRunning: boolean;
  phase: 'focus' | 'break';
  /** Unix ms when the running phase ends. Null when paused/idle. */
  endTime: number | null;
  /** Seconds left — used to render the paused (static) state. */
  timeLeft: number;
  /** Total seconds in the current phase — anchors the progress ring. */
  totalSeconds: number;
  taskName: string;
}

const FOCUS_COLOR = '#16a34a';
const BREAK_COLOR = '#0ea5e9';

// Module-level handle to the one activity we manage at a time.
let activityId: string | null = null;
let signature: string | null = null;

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function phaseMeta(phase: 'focus' | 'break') {
  return phase === 'focus'
    ? { label: 'Focus', color: FOCUS_COLOR, symbol: 'timer' }
    : { label: 'Break', color: BREAK_COLOR, symbol: 'cup.and.saucer.fill' };
}

/**
 * Lock-screen layout, styled to echo Apple's Timer Live Activity: a large
 * headline countdown on the leading side with a smaller label/status subtitle
 * beneath it, and a big phase glyph on the trailing side for balance.
 */
function buildLayout(snap: LiveTimerSnapshot): any {
  const { label, color } = phaseMeta(snap.phase);

  // Headline countdown — large, bold, monospaced so it reads like Apple's.
  const bigTime =
    snap.isRunning && snap.endTime
      ? {
          type: 'timer',
          properties: [
            { endTime: snap.endTime },
            { style: 'countdown' },
            { fontSize: 40 },
            { fontWeight: 'bold' },
            { monospacedDigit: true },
            { color },
            { alignment: 'leading' },
          ],
        }
      : {
          type: 'text',
          properties: [
            { text: fmt(snap.timeLeft) },
            { fontSize: 40 },
            { fontWeight: 'bold' },
            { monospacedDigit: true },
            { color },
            { alignment: 'leading' },
          ],
        };

  // Subtitle row: phase label + task name (or "Paused" status), echoing the
  // "Countdown" caption under Apple's timer.
  const subtitle = {
    type: 'container',
    properties: [{ direction: 'horizontal' }, { spacing: 6 }, { insideAlignment: 'center' }],
    children: [
      {
        type: 'text',
        properties: [{ text: label }, { fontSize: 15 }, { fontWeight: 'semibold' }, { color }],
      },
      {
        type: 'text',
        properties: [
          { text: snap.isRunning ? snap.taskName || 'Frogodoro' : 'Paused' },
          { fontSize: 14 },
          { color: '#8e8e93' },
        ],
      },
    ],
  };

  return {
    type: 'container',
    properties: [
      { direction: 'horizontal' },
      { spacing: 12 },
      { padding: 16 },
      { insideAlignment: 'center' },
    ],
    children: [
      {
        type: 'container',
        properties: [{ direction: 'vertical' }, { spacing: 4 }, { insideAlignment: 'leading' }],
        children: [bigTime, subtitle],
      },
      { type: 'spacer', properties: [] },
      ringElement(snap, 44, 5),
    ],
  };
}

/**
 * Circular progress ring (our custom `circular-timer` element) echoing Apple's
 * Timer. iOS doesn't let third parties auto-animate a circular countdown, so the
 * ring is a snapshot of how much time remains (`value`/`total`), recomputed each
 * time the activity is recreated (start / pause / resume / phase change). When
 * paused it fades and shows a centered pause glyph. The live MM:SS number beside
 * it provides the continuous countdown.
 */
function ringElement(snap: LiveTimerSnapshot, size: number, lineWidth: number): any {
  const { color } = phaseMeta(snap.phase);
  return {
    type: 'circular-timer',
    properties: [
      { color },
      { size },
      { lineWidth },
      { paused: !snap.isRunning },
      // Fraction remaining, captured at reconcile time.
      { value: Math.max(0, snap.timeLeft) },
      { total: Math.max(1, snap.totalSeconds) },
    ],
  };
}

/** Dynamic Island layout — compact pill + expanded view. */
function buildIsland(snap: LiveTimerSnapshot): any {
  const { label, color } = phaseMeta(snap.phase);
  const compactTime =
    snap.isRunning && snap.endTime
      ? { type: 'timer', properties: [{ endTime: snap.endTime }, { style: 'countdown' }, { color }, { monospacedDigit: true }] }
      : { type: 'text', properties: [{ text: fmt(snap.timeLeft) }, { color }, { monospacedDigit: true }] };

  return {
    // Expanded view echoes Apple's Timer: a big headline countdown with a
    // small label/status subtitle beneath it on the leading side, and the
    // phase glyph on the trailing side (where Apple shows its controls).
    expanded: {
      leading: {
        type: 'container',
        properties: [{ direction: 'vertical' }, { spacing: 2 }, { insideAlignment: 'leading' }],
        children: [
          snap.isRunning && snap.endTime
            ? {
                type: 'timer',
                properties: [
                  { endTime: snap.endTime },
                  { style: 'countdown' },
                  { fontSize: 34 },
                  { fontWeight: 'bold' },
                  { color },
                  { monospacedDigit: true },
                  { alignment: 'leading' },
                ],
              }
            : {
                type: 'text',
                properties: [
                  { text: fmt(snap.timeLeft) },
                  { fontSize: 34 },
                  { fontWeight: 'bold' },
                  { color },
                  { monospacedDigit: true },
                  { alignment: 'leading' },
                ],
              },
          {
            type: 'text',
            properties: [
              { text: snap.isRunning ? label : `${label} · Paused` },
              { fontSize: 14 },
              { fontWeight: 'semibold' },
              { color: '#8e8e93' },
            ],
          },
        ],
      },
      trailing: ringElement(snap, 34, 4),
    },
    // Apple's compact pill puts the time on the leading side and the animated
    // ring on the trailing side — mirror that.
    compactLeading: compactTime,
    compactTrailing: ringElement(snap, 20, 2.5),
    minimal: ringElement(snap, 20, 2.5),
  };
}

function computeSignature(snap: LiveTimerSnapshot): string | null {
  if (!snap.active) return null;
  if (snap.isRunning && snap.endTime) {
    return `run:${snap.phase}:${snap.endTime}`;
  }
  return `pause:${snap.phase}:${Math.round(snap.timeLeft)}`;
}

/**
 * End every live activity currently known to the system, not just the one we
 * tracked in `activityId`. This is the safety net against orphaned activities
 * left behind when the WebView reloads (e.g. reopening the app from the
 * Dynamic Island) and our in-memory handle is lost.
 */
async function endAllIosActivities(): Promise<void> {
  try {
    const { activities } = await LiveActivities.getAllActivities();
    await Promise.all(
      (activities ?? []).map((a: any) =>
        LiveActivities.endActivity({ activityId: a.id, data: {} }).catch((err) =>
          console.error('endActivity failed:', err),
        ),
      ),
    );
  } catch (err) {
    console.error('getAllActivities failed:', err);
  }
  activityId = null;
}

/**
 * Reconcile the live timer with the current store snapshot. Because the
 * plugin's `timer` element is baked into the layout at start time, we recreate
 * the activity whenever the meaningful state (phase / endTime / paused) changes.
 */
export async function reconcileLiveTimer(snap: LiveTimerSnapshot): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const desiredSig = computeSignature(snap);
  if (desiredSig === signature) return;
  signature = desiredSig;

  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    try {
      if (!desiredSig) {
        await FrogTimer.stop();
      } else {
        // A re-notify with the same id updates in place — no flicker, so no
        // need for the iOS end-then-start dance.
        await FrogTimer.start({
          phase: snap.phase,
          isRunning: snap.isRunning,
          endTime: snap.endTime ?? 0,
          timeLeft: snap.timeLeft,
          taskName: snap.taskName,
        });
      }
    } catch (err) {
      console.error('FrogTimer failed:', err);
      signature = null;
    }
    return;
  }

  if (platform !== 'ios') return;

  // iOS: the timer element is baked into the layout, so every state change
  // recreates the activity. We can't rely on the module-level `activityId`
  // alone: tapping the Dynamic Island reopens the app and reloads the WebView,
  // wiping that JS state while the system activity keeps running. So we end
  // EVERY existing activity before starting a fresh one — otherwise each
  // pause/resume after a reopen stacks another lock-screen card. We only ever
  // run a single timer activity, so this guarantees exactly one on screen.
  await endAllIosActivities();

  if (!desiredSig) return;

  try {
    const { activityId: id } = await LiveActivities.startActivity({
      layout: buildLayout(snap),
      dynamicIslandLayout: buildIsland(snap),
      behavior: {
        widgetUrl: '',
        keyLineTint: phaseMeta(snap.phase).color,
      },
      data: {},
      staleDate: snap.endTime ?? undefined,
    } as any);
    activityId = id;
  } catch (err) {
    console.error('startActivity failed:', err);
    signature = null;
  }
}

/** Force-clear any live timer (e.g. on stop / sign-out). */
export async function clearLiveTimer(): Promise<void> {
  await reconcileLiveTimer({
    active: false,
    isRunning: false,
    phase: 'focus',
    endTime: null,
    timeLeft: 0,
    totalSeconds: 0,
    taskName: '',
  });
}
