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
function ringElement(
  snap: LiveTimerSnapshot,
  size: number,
  lineWidth: number,
  animated = true,
): any {
  const { color } = phaseMeta(snap.phase);
  const properties: any[] = [
    { color },
    { size },
    { lineWidth },
    { paused: !snap.isRunning },
    // Fraction remaining, captured at reconcile time (used for the paused/static
    // snapshot ring).
    { value: Math.max(0, snap.timeLeft) },
    { total: Math.max(1, snap.totalSeconds) },
  ];

  // While running, also hand over the full start…end window so the native ring
  // can self-animate via ProgressView(timerInterval:) — no per-second activity
  // recreation needed. startTime is anchored off the phase's total duration.
  if (snap.isRunning && snap.endTime) {
    const startTime = snap.endTime - Math.max(1, snap.totalSeconds) * 1000;
    properties.push({ startTime }, { endTime: snap.endTime });
  }

  // Opt out of the live animation when an exact size matters (the big expanded
  // ring): the system circular ProgressView can't be sized precisely, so we use
  // the static, exactly-sized snapshot ring there instead.
  if (!animated) properties.push({ animated: false });

  return { type: 'circular-timer', properties };
}

/** Dynamic Island layout — compact pill + expanded view. */
function buildIsland(snap: LiveTimerSnapshot): any {
  const { label, color } = phaseMeta(snap.phase);
  // A self-counting `timer` reserves its worst-case (HH:MM:SS) width, which
  // bloats the compact pill to full width and clips the digits. Pin both states
  // to the same fixed MM:SS width so running and paused render identically, and
  // trailing-align so the time hugs the pill edge (`.trailing` flips on RTL)
  // instead of floating in the middle of the reserved frame.
  const COMPACT_TIME_WIDTH = 54;
  // Note: unlike a plain text, a `Text(timerInterval:)` fills its fixed-width
  // frame and renders its digits leading, ignoring the frame's alignment — so
  // the running timer also needs `alignment: 'trailing'` (multilineTextAlignment)
  // to push the digits to the edge, matching the paused text.
  const compactTime =
    snap.isRunning && snap.endTime
      ? { type: 'timer', properties: [{ endTime: snap.endTime }, { style: 'countdown' }, { color }, { monospacedDigit: true }, { width: COMPACT_TIME_WIDTH }, { frameAlignment: 'trailing' }, { alignment: 'trailing' }] }
      : { type: 'text', properties: [{ text: fmt(snap.timeLeft) }, { color }, { monospacedDigit: true }, { width: COMPACT_TIME_WIDTH }, { frameAlignment: 'trailing' }] };

  // Big Apple-style countdown headline. It lives ALONE in the trailing region
  // (the phase label is in `center`, under the camera), so nothing competes for
  // width and it can render large — the trailing region spans to the screen edge
  // and the headline grows leftward into the camera gap as it widens. lineLimit 1
  // + minimumScaleFactor are a safety net for the paused (plain-text) state.
  // A live `Text(timerInterval:)` does NOT honor `minimumScaleFactor` — it
  // reserves fixed geometry and TRUNCATES ("114:...") instead of shrinking when
  // the value is too wide for its region. (The paused state is plain `Text`, so
  // it would scale, but the running timer won't.) So the only reliable way to
  // avoid the crop is to choose the font from how wide the value will be.
  //
  // The timer only ever counts DOWN from when the activity is (re)created, so the
  // widest value it will display is the current remaining time. We pick the font
  // off that value's character count, calibrated against the real trailing-region
  // width (verified on device): "M:SS"/"MM:SS" (<=5 chars, under 100 min) fit big
  // at 66; "MMM:SS" (6 chars, 100–999 min) and beyond step down with margin to
  // spare so they never sit at the clip boundary. Sub-100-minute timers are never
  // shrunk.
  const widestSeconds =
    snap.isRunning && snap.endTime
      ? Math.max(0, Math.round((snap.endTime - Date.now()) / 1000))
      : snap.timeLeft;
  const TIME_MAX_FONT = 66;
  const timeLen = fmt(widestSeconds).length;
  const EXPANDED_TIME_FONT = timeLen <= 5 ? TIME_MAX_FONT : timeLen === 6 ? 48 : 40;
  const EXPANDED_TIME_WEIGHT = 'light';
  // Pin the ring, label, and headline to a constant-height box so they stay
  // VERTICALLY CENTERED on one line at every value (the regions are otherwise
  // top-aligned, so a shorter font would float up). `.frame(height:)` centers
  // content within the box (default alignment `.center`).
  //
  // The box is kept as SHORT as possible so the Dynamic Island isn't taller than
  // it needs to be — the island sizes to this box. It only has to contain the
  // 52pt ring (the tallest fully-visible element) plus a little margin; the 66pt
  // digits' visible cap height is ~48pt, well within it, and the font's empty
  // ascender/descender slack (which would otherwise force a ~79pt line) is
  // clipped harmlessly since digits have no ascenders/descenders.
  const TIME_BOX_HEIGHT = 52;
  const bigTime =
    snap.isRunning && snap.endTime
      ? {
          type: 'timer',
          properties: [
            { endTime: snap.endTime },
            { style: 'countdown' },
            { fontSize: EXPANDED_TIME_FONT },
            { fontWeight: EXPANDED_TIME_WEIGHT },
            { color },
            { monospacedDigit: true },
            { lineLimit: 1 },
            { minimumScaleFactor: 0.6 },
            { height: TIME_BOX_HEIGHT },
          ],
        }
      : {
          type: 'text',
          properties: [
            { text: fmt(snap.timeLeft) },
            { fontSize: EXPANDED_TIME_FONT },
            { fontWeight: EXPANDED_TIME_WEIGHT },
            { color },
            { monospacedDigit: true },
            { lineLimit: 1 },
            { minimumScaleFactor: 0.6 },
            { height: TIME_BOX_HEIGHT },
          ],
        };

  // Phase label ("Break"/"Focus"), phase-colored to match the digits. It sits in
  // the CENTER region — the space UNDER the camera — so it doesn't compete for the
  // narrow leading region's width (which truncated "Focus" -> "Foc...") and
  // doesn't steal width from the big trailing digits.
  //
  // Crucially it carries NO height constraint. A fixed-height box here would force
  // the under-camera band taller and grow the whole island; with only its natural
  // text height it tucks into the space that already exists below the camera
  // without pushing the minimum expanded height up. `minimumScaleFactor` is a
  // safety net so it scales rather than truncates if ever pinched. The x-offset
  // nudges it toward the digits, RTL-aware (digits are on the right in LTR, left
  // in RTL — iOS mirrors the regions — so flip the sign by document direction).
  const isRTL =
    typeof document !== 'undefined' &&
    (document.documentElement.dir === 'rtl' || document.dir === 'rtl');
  const LABEL_NUDGE_X = 12; // toward the digits
  const phaseLabel = {
    type: 'text',
    properties: [
      { text: label },
      { fontSize: 16 },
      { fontWeight: 'semibold' },
      { color },
      { lineLimit: 1 },
      { minimumScaleFactor: 0.7 },
      { offset: { x: isRTL ? -LABEL_NUDGE_X : LABEL_NUDGE_X, y: 0 } },
    ],
  };

  // Leading ring — ANIMATED (self-counting system `ProgressView(.circular)`) so it
  // ticks live like the compact pill instead of freezing mid-run.
  //
  // The native side enlarges this ring with `scaleEffect(size / 20)`, assuming the
  // system circular ProgressView is ~20pt. On iOS 26 its natural size is bigger,
  // so passing the real 52 overshoots into a giant clipped ring. We instead pass a
  // SMALLER `size` to dial the scale down so the *visual* ring lands near 52pt.
  // `EXPANDED_RING_SIZE` is the tuning knob: lower = smaller on screen. The frame
  // shrinks with it too, but the height box (52) re-centers the scaled ring and
  // the horizontal padding keeps the stroke off the island edge so it isn't
  // clipped. (Trade-off: the system ring is the thin style — no faded track /
  // rounded cap — so it won't perfectly match the paused trim ring's look.)
  const EXPANDED_RING_SIZE = 34;
  const baseRing = ringElement(snap, EXPANDED_RING_SIZE, 5, true);
  const expandedRing = {
    ...baseRing,
    properties: [...baseRing.properties, { height: TIME_BOX_HEIGHT }, { paddingHorizontal: 12 }],
  };

  return {
    // Ring on the LEADING edge and the big countdown alone on the TRAILING edge —
    // both in the band beside the camera, each in a fixed-height box so they stay
    // vertically centered at every value. The phase label goes in CENTER (under
    // the camera) with no height box, so it doesn't widen-crowd either region or
    // grow the island. Keeping the time alone in trailing lets it render large
    // without truncating (it owns the full trailing width and grows leftward into
    // the camera gap as the digits widen). The ring is the static, exactly-sized
    // snapshot (animated: false) — the live ring can't be sized reliably
    // (scaleEffect overshot); the always-visible compact pill keeps the animation.
    expanded: {
      leading: expandedRing,
      center: phaseLabel,
      trailing: bigTime,
    },
    // Apple's compact pill puts the progress ring on the leading side and the
    // countdown on the trailing side. We use leading/trailing (not hard-coded
    // left/right) so the OS mirrors it per device language: LTR shows ring-left
    // / timer-right, RTL flips to ring-right / timer-left.
    compactLeading: ringElement(snap, 20, 2.5),
    compactTrailing: compactTime,
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
