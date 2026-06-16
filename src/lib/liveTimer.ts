'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { LiveActivities } from 'capacitor-live-activities';
import {
  buildLiveActivityData,
  phaseMeta,
  type LiveTimerSnapshot,
} from '@/lib/liveActivityData';

export type { LiveTimerSnapshot } from '@/lib/liveActivityData';

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
const IOS_LAYOUT_VERSION = 2;

let activityId: string | null = null;
let signature: string | null = null;
let iosActivityLayoutVersion: number | null = null;
let tokenListenerReady = false;

async function putPushToken(id: string, token: string): Promise<void> {
  if (!id || !token) return;
  try {
    await fetch('/api/frogodoro/live-activity', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ activityId: id, pushToken: token }),
    });
  } catch {
    void 0;
  }
}

async function deletePushToken(): Promise<void> {
  try {
    await fetch('/api/frogodoro/live-activity', {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {
    void 0;
  }
}

function ensureTokenListener(): void {
  if (tokenListenerReady) return;
  tokenListenerReady = true;
  try {
    (LiveActivities as any).addListener?.(
      'pushToken',
      (event: { activityId?: string; token?: string }) => {
        if (event?.token) void putPushToken(event.activityId ?? activityId ?? '', event.token);
      },
    );
  } catch {
    void 0;
  }
}

function ringElement(size: number, lineWidth: number, animated = true): any {
  const properties: any[] = [
    { color: '{{color}}' },
    { size },
    { lineWidth },
    { paused: '{{paused}}' },
    { value: '{{ringValue}}' },
    { total: '{{ringTotal}}' },
    { startTime: '{{ringStart}}' },
    { endTime: '{{ringEnd}}' },
  ];
  if (!animated) properties.push({ animated: false });
  return { type: 'circular-timer', properties };
}

function buildLayout(snap: LiveTimerSnapshot): any {
  const lockScreenRing = ringElement(36, 4);
  const bigTime =
    snap.isRunning && snap.endTime
      ? {
          type: 'timer',
          properties: [
            { endTime: '{{endTime}}' },
            { style: 'countdown' },
            { fontSize: 40 },
            { fontWeight: 'bold' },
            { monospacedDigit: true },
            { color: '{{color}}' },
            { alignment: 'leading' },
          ],
        }
      : {
          type: 'text',
          properties: [
            { text: '{{timeText}}' },
            { fontSize: 40 },
            { fontWeight: 'bold' },
            { monospacedDigit: true },
            { color: '{{color}}' },
            { alignment: 'leading' },
          ],
        };

  const subtitle = {
    type: 'container',
    properties: [{ direction: 'horizontal' }, { spacing: 6 }, { insideAlignment: 'center' }],
    children: [
      {
        type: 'text',
        properties: [{ text: '{{label}}' }, { fontSize: 15 }, { fontWeight: 'semibold' }, { color: '{{color}}' }],
      },
      {
        type: 'text',
        properties: [{ text: '{{subtitle}}' }, { fontSize: 14 }, { color: '#8e8e93' }],
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
      { ...lockScreenRing, properties: [...lockScreenRing.properties, { offset: { x: -10, y: 0 } }] },
    ],
  };
}

function buildIsland(snap: LiveTimerSnapshot): any {
  const COMPACT_TIME_WIDTH = 54;
  const compactTime =
    snap.isRunning && snap.endTime
      ? {
          type: 'timer',
          properties: [
            { endTime: '{{endTime}}' },
            { style: 'countdown' },
            { color: '{{color}}' },
            { monospacedDigit: true },
            { width: COMPACT_TIME_WIDTH },
            { frameAlignment: 'trailing' },
            { alignment: 'trailing' },
          ],
        }
      : {
          type: 'text',
          properties: [
            { text: '{{timeText}}' },
            { color: '{{color}}' },
            { monospacedDigit: true },
            { width: COMPACT_TIME_WIDTH },
            { frameAlignment: 'trailing' },
          ],
        };

  const TIME_BOX_HEIGHT = 52;
  const bigTime =
    snap.isRunning && snap.endTime
      ? {
          type: 'timer',
          properties: [
            { endTime: '{{endTime}}' },
            { style: 'countdown' },
            { fontSize: '{{timeFont}}' },
            { fontWeight: 'light' },
            { color: '{{color}}' },
            { monospacedDigit: true },
            { lineLimit: 1 },
            { minimumScaleFactor: 0.6 },
            { height: TIME_BOX_HEIGHT },
          ],
        }
      : {
          type: 'text',
          properties: [
            { text: '{{timeText}}' },
            { fontSize: '{{timeFont}}' },
            { fontWeight: 'light' },
            { color: '{{color}}' },
            { monospacedDigit: true },
            { lineLimit: 1 },
            { minimumScaleFactor: 0.6 },
            { height: TIME_BOX_HEIGHT },
          ],
        };

  const isRTL =
    typeof document !== 'undefined' &&
    (document.documentElement.dir === 'rtl' || document.dir === 'rtl');
  const LABEL_NUDGE_X = 12;
  const phaseLabel = {
    type: 'text',
    properties: [
      { text: '{{label}}' },
      { fontSize: 16 },
      { fontWeight: 'semibold' },
      { color: '{{color}}' },
      { lineLimit: 1 },
      { minimumScaleFactor: 0.7 },
      { offset: { x: isRTL ? -LABEL_NUDGE_X : LABEL_NUDGE_X, y: 0 } },
    ],
  };

  const EXPANDED_RING_SIZE = 34;
  const baseRing = ringElement(EXPANDED_RING_SIZE, 5, true);
  const expandedRing = {
    ...baseRing,
    properties: [...baseRing.properties, { height: TIME_BOX_HEIGHT }, { paddingHorizontal: 12 }],
  };

  return {
    expanded: {
      leading: expandedRing,
      center: phaseLabel,
      trailing: bigTime,
    },
    compactLeading: ringElement(20, 2.5),
    compactTrailing: compactTime,
    minimal: ringElement(20, 2.5),
  };
}

function computeSignature(snap: LiveTimerSnapshot): string | null {
  if (!snap.active) return null;
  if (snap.isRunning && snap.endTime) {
    return `run:${snap.phase}:${snap.endTime}`;
  }
  return `pause:${snap.phase}:${Math.round(snap.timeLeft)}`;
}

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
  iosActivityLayoutVersion = null;
}

async function getCurrentIosActivityId(): Promise<string | null> {
  if (activityId) return activityId;
  try {
    const result = await LiveActivities.getAllActivities();
    const activities = ((result as any).activities ?? []) as any[];
    const active = activities.find((a: any) => a.state === 'active') ?? activities[0];
    const id = active?.id;
    activityId = typeof id === 'string' ? id : null;
    return activityId;
  } catch {
    return null;
  }
}

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

  if (!desiredSig) {
    await endAllIosActivities();
    void deletePushToken();
    return;
  }

  ensureTokenListener();

  try {
    const existingId = await getCurrentIosActivityId();
    if (existingId && iosActivityLayoutVersion === IOS_LAYOUT_VERSION) {
      await LiveActivities.updateActivity({
        activityId: existingId,
        data: buildLiveActivityData(snap),
      } as any);
      return;
    }

    if (existingId) {
      await endAllIosActivities();
    }

    const { activityId: id } = await LiveActivities.startActivity({
      layout: buildLayout(snap),
      dynamicIslandLayout: buildIsland(snap),
      behavior: {
        widgetUrl: '',
        keyLineTint: phaseMeta(snap.phase).color,
      },
      data: buildLiveActivityData(snap),
      staleDate: snap.endTime ?? undefined,
    } as any);
    activityId = id;
    iosActivityLayoutVersion = IOS_LAYOUT_VERSION;
  } catch (err) {
    console.error('startActivity failed:', err);
    signature = null;
  }
}

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
