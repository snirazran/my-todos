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

/** Lock-screen layout — phase label on the left, big counting timer on the right. */
function buildLayout(snap: LiveTimerSnapshot): any {
  const { label, color, symbol } = phaseMeta(snap.phase);
  const timeElement =
    snap.isRunning && snap.endTime
      ? {
          type: 'timer',
          properties: [
            { endTime: snap.endTime },
            { style: 'timer' },
            { fontSize: 30 },
            { fontWeight: 'bold' },
            { monospaced: true },
            { color },
            { alignment: 'trailing' },
          ],
        }
      : {
          type: 'text',
          properties: [
            { text: fmt(snap.timeLeft) },
            { fontSize: 30 },
            { fontWeight: 'bold' },
            { monospaced: true },
            { color },
            { alignment: 'trailing' },
          ],
        };

  return {
    type: 'container',
    properties: [
      { direction: 'horizontal' },
      { spacing: 10 },
      { padding: 16 },
      { insideAlignment: 'center' },
    ],
    children: [
      {
        type: 'image',
        properties: [{ systemName: symbol }, { color }, { width: 22 }, { height: 22 }],
      },
      {
        type: 'container',
        properties: [{ direction: 'vertical' }, { spacing: 2 }],
        children: [
          {
            type: 'text',
            properties: [
              { text: label },
              { fontSize: 16 },
              { fontWeight: 'bold' },
              { color },
            ],
          },
          {
            type: 'text',
            properties: [
              { text: snap.taskName || 'Frogodoro' },
              { fontSize: 12 },
              { color: '#8e8e93' },
            ],
          },
        ],
      },
      { type: 'spacer', properties: [] },
      snap.isRunning ? timeElement : wrapPaused(timeElement),
    ],
  };
}

/** Stack the static time over a small "Paused" caption when paused. */
function wrapPaused(timeElement: any): any {
  return {
    type: 'container',
    properties: [{ direction: 'vertical' }, { spacing: 0 }, { insideAlignment: 'trailing' }],
    children: [
      timeElement,
      {
        type: 'text',
        properties: [{ text: 'Paused' }, { fontSize: 11 }, { color: '#8e8e93' }],
      },
    ],
  };
}

/** Dynamic Island layout — compact pill + expanded view. */
function buildIsland(snap: LiveTimerSnapshot): any {
  const { label, color, symbol } = phaseMeta(snap.phase);
  const compactTime =
    snap.isRunning && snap.endTime
      ? { type: 'timer', properties: [{ endTime: snap.endTime }, { style: 'timer' }, { color }, { monospaced: true }] }
      : { type: 'text', properties: [{ text: fmt(snap.timeLeft) }, { color }, { monospaced: true }] };

  return {
    expanded: {
      leading: {
        type: 'image',
        properties: [{ systemName: symbol }, { color }, { width: 24 }, { height: 24 }],
      },
      center: {
        type: 'text',
        properties: [{ text: label }, { fontSize: 15 }, { fontWeight: 'bold' }, { color }],
      },
      trailing: {
        type: snap.isRunning && snap.endTime ? 'timer' : 'text',
        properties:
          snap.isRunning && snap.endTime
            ? [{ endTime: snap.endTime }, { style: 'timer' }, { fontSize: 22 }, { fontWeight: 'bold' }, { color }, { monospaced: true }]
            : [{ text: fmt(snap.timeLeft) }, { fontSize: 22 }, { fontWeight: 'bold' }, { color }, { monospaced: true }],
      },
    },
    compactLeading: {
      type: 'image',
      properties: [{ systemName: symbol }, { color }],
    },
    compactTrailing: compactTime,
    minimal: {
      type: 'image',
      properties: [{ systemName: symbol }, { color }],
    },
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

  // iOS: the timer element is baked into the layout, so recreate on change.
  if (activityId) {
    try {
      await LiveActivities.endActivity({ activityId, data: {} });
    } catch (err) {
      console.error('endActivity failed:', err);
    }
    activityId = null;
  }

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
    taskName: '',
  });
}
