'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  buildLiveActivityData,
  type LiveActivityData,
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
  stop(): Promise<void>;
}

interface FrogLiveActivityPlugin {
  show(opts: { data: LiveActivityData }): Promise<{ activityId: string }>;
  end(): Promise<void>;
  registerPushToStart(): Promise<void>;
  setApiOrigin(opts: { origin: string }): Promise<void>;
  addListener(
    eventName: 'pushToken',
    cb: (event: { activityId?: string; token?: string }) => void,
  ): Promise<unknown>;
  addListener(
    eventName: 'pushToStartToken',
    cb: (event: { token?: string }) => void,
  ): Promise<unknown>;
}

const FrogTimer = registerPlugin<FrogTimerPlugin>('FrogTimer');
const FrogLiveActivity = registerPlugin<FrogLiveActivityPlugin>('FrogLiveActivity');

let signature: string | null = null;
let iosListenersReady = false;

async function putLiveActivity(body: Record<string, string>): Promise<void> {
  try {
    await fetch('/api/frogodoro/live-activity', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
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

function ensureIosListeners(): void {
  if (iosListenersReady) return;
  iosListenersReady = true;
  try {
    void FrogLiveActivity.addListener('pushToken', (event) => {
      if (event?.token) {
        void putLiveActivity({ activityId: event.activityId ?? '', pushToken: event.token });
      }
    });
    void FrogLiveActivity.addListener('pushToStartToken', (event) => {
      if (event?.token) void putLiveActivity({ pushToStartToken: event.token });
    });
    // Tell the Done/Pause/Stop button intent which server to call (this device's
    // current origin — prod or the dev server), since the intent runs natively
    // and can't read the webview's location.
    if (typeof window !== 'undefined') {
      void FrogLiveActivity.setApiOrigin({ origin: window.location.origin });
    }
    // Register once so the server can create the island via APNs even when the
    // app is closed (iOS 17.2+). No-op on older iOS.
    void FrogLiveActivity.registerPushToStart();
  } catch {
    void 0;
  }
}

function computeSignature(snap: LiveTimerSnapshot): string | null {
  if (!snap.active) return null;
  if (snap.finished) return `done:${snap.phase}`;
  if (snap.isRunning && snap.endTime) {
    return `run:${snap.phase}:${snap.endTime}`;
  }
  return `pause:${snap.phase}:${Math.round(snap.timeLeft)}`;
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

  ensureIosListeners();

  try {
    if (!desiredSig) {
      await FrogLiveActivity.end();
      void deletePushToken();
      return;
    }
    // The native widget renders run vs paused from the content-state, so a
    // run<->pause change is a plain in-place update — no end-and-recreate.
    await FrogLiveActivity.show({ data: buildLiveActivityData(snap) });
  } catch (err) {
    console.error('FrogLiveActivity failed:', err);
    signature = null;
  }
}
