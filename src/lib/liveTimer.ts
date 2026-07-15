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
    fliesCaught?: number;
    fliesPotential?: number;
    deepFocus?: boolean;
    sound?: string;
  }): Promise<void>;
  stop(): Promise<void>;
  setControlConfig(opts: { origin: string; token: string }): Promise<void>;
}

interface FrogLiveActivityPlugin {
  show(opts: {
    data: LiveActivityData;
  }): Promise<{ activityId?: string; skipped?: boolean; reason?: string }>;
  end(): Promise<void>;
  getState(): Promise<
    ({ active: false } | ({ active: true; activityId?: string } & LiveActivityData))
  >;
  registerPushToStart(): Promise<void>;
  setApiOrigin(opts: { origin: string }): Promise<void>;
  setControlToken(opts: { token: string }): Promise<void>;
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

function isDocumentForegrounded(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

// Hand the stable per-install FCM token to the native Live Activity button
// intent (via the App Group) so it can authenticate /control without depending
// on the volatile activity push token.
export async function setLiveActivityControlToken(token: string): Promise<void> {
  if (!token || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return;
  }
  try {
    await FrogLiveActivity.setControlToken({ token });
  } catch {
    void 0;
  }
}

export async function getCurrentLiveActivityState(): Promise<
  ({ active: false } | ({ active: true; activityId?: string } & LiveActivityData)) | null
> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return null;
  }
  try {
    return await FrogLiveActivity.getState();
  } catch {
    return null;
  }
}

// Hand the FCM token + API origin to the Android notification action buttons so
// their BroadcastReceiver can authenticate /control while the app is minimized
// or killed (it can't read the webview's cookie or location).
export async function setTimerControlConfig(token: string): Promise<void> {
  if (
    !token ||
    typeof window === 'undefined' ||
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== 'android'
  ) {
    return;
  }
  try {
    await FrogTimer.setControlConfig({ origin: window.location.origin, token });
  } catch {
    void 0;
  }
}

async function putLiveActivity(body: Record<string, string | number>): Promise<void> {
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

// Asks the server to create/refresh the island via APNs when the local
// creation was skipped (the app left the foreground between Start and the
// native call). Deduped per signature so backgrounded reconciles can't spam
// the APNs budget.
let remoteStartRequestedSig: string | null = null;

async function requestRemoteStart(sig: string): Promise<void> {
  if (remoteStartRequestedSig === sig) return;
  remoteStartRequestedSig = sig;
  const attempt = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/frogodoro/live-activity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ needsRemoteStart: true }),
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      return data?.remoteStart !== false;
    } catch {
      return false;
    }
  };
  if (await attempt()) return;
  // The /active PUT this start belongs to may not have landed yet — one
  // delayed retry covers the race (if the webview gets suspended first, the
  // timeout fires on resume, where the fallback is a harmless reconcile).
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (remoteStartRequestedSig !== sig) return;
  if (!(await attempt())) {
    remoteStartRequestedSig = null;
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
        void putLiveActivity({
          activityId: event.activityId ?? '',
          pushToken: event.token,
          clientNow: Date.now(),
        });
      }
    });
    void FrogLiveActivity.addListener('pushToStartToken', (event) => {
      if (event?.token) {
        void putLiveActivity({ pushToStartToken: event.token, clientNow: Date.now() });
      }
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
  // Hunt state is part of the signature so a mid-run catch or a broken
  // deep-focus pledge refreshes the island/notification in place.
  const hunt = `${snap.fliesCaught ?? 0}/${snap.fliesPotential ?? 0}:${snap.deepFocus ? 1 : 0}`;
  if (snap.finished) return `done:${snap.phase}:${hunt}`;
  if (snap.isRunning && snap.endTime) {
    return `run:${snap.phase}:${snap.endTime}:${hunt}`;
  }
  return `pause:${snap.phase}:${Math.round(snap.timeLeft)}:${hunt}`;
}

export async function reconcileLiveTimer(snap: LiveTimerSnapshot): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const platform = Capacitor.getPlatform();

  if (platform === 'ios') ensureIosListeners();

  const desiredSig = computeSignature(snap);

  if (desiredSig === signature) return;

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
          fliesCaught: snap.fliesCaught ?? 0,
          fliesPotential: snap.fliesPotential ?? 0,
          deepFocus: snap.deepFocus === true,
          sound: snap.sound ?? '',
        });
      }
    } catch (err) {
      console.error('FrogTimer failed:', err);
      signature = null;
    }
    return;
  }

  if (platform !== 'ios') return;

  // iOS only allows creating a Live Activity from the app while it is in the
  // foreground. Cross-device/background starts are handled by APNs push-to-start
  // from the server; keep the local signature unchanged so foregrounding retries.
  if (desiredSig && !isDocumentForegrounded()) {
    if (snap.isRunning && snap.endTime && !snap.finished) {
      void requestRemoteStart(desiredSig);
    }
    return;
  }

  signature = desiredSig;

  try {
    if (!desiredSig) {
      await FrogLiveActivity.end();
      void deletePushToken();
      return;
    }
    // The native widget renders run vs paused from the content-state, so a
    // run<->pause change is a plain in-place update — no end-and-recreate.
    const result = await FrogLiveActivity.show({ data: buildLiveActivityData(snap) });
    if (result?.skipped) {
      signature = null;
      if (snap.isRunning && snap.endTime && !snap.finished) {
        void requestRemoteStart(desiredSig);
      }
    }
  } catch (err) {
    console.error('FrogLiveActivity failed:', err);
    signature = null;
  }
}
