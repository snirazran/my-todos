'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { PendingAction, WidgetPayload, WidgetPinState } from './types';

interface FrogWidgetPlugin {
  setState(options: { payload: string }): Promise<void>;
  clear(): Promise<void>;
  /** Reads and atomically empties the native quick-add queue. */
  drainQueue(): Promise<{ actions: string }>;
  getPinState(): Promise<{ state: WidgetPinState }>;
  /** Android only; resolves once the launcher has taken the request. */
  requestPin(): Promise<{ requested: boolean }>;
  addListener(
    event: 'widgetQueued',
    handler: () => void,
  ): Promise<PluginListenerHandle>;
}

const native = registerPlugin<FrogWidgetPlugin>('FrogWidget');

function available() {
  return Capacitor.isNativePlatform();
}

export async function pushWidgetState(payload: WidgetPayload): Promise<void> {
  if (!available()) return;
  try {
    await native.setState({ payload: JSON.stringify(payload) });
  } catch {
    /* widget is best-effort; never break the app for it */
  }
}

export async function clearWidgetState(): Promise<void> {
  if (!available()) return;
  try {
    await native.clear();
  } catch {
    /* ignore */
  }
}

export async function drainWidgetQueue(): Promise<PendingAction[]> {
  if (!available()) return [];
  try {
    const { actions } = await native.drainQueue();
    if (!actions) return [];
    const parsed: unknown = JSON.parse(actions);
    return Array.isArray(parsed) ? (parsed as PendingAction[]) : [];
  } catch {
    return [];
  }
}

export async function getWidgetPinState(): Promise<WidgetPinState> {
  if (!available()) return 'unsupported';
  try {
    const { state } = await native.getPinState();
    return state;
  } catch {
    return 'unsupported';
  }
}

export async function requestWidgetPin(): Promise<boolean> {
  if (!available()) return false;
  try {
    const { requested } = await native.requestPin();
    return requested;
  } catch {
    return false;
  }
}

/**
 * Fires when the native quick-add composer saves something. The app never
 * backgrounds while it is up, so there is no resume for the webview to react
 * to — without this the capture would sit in the queue until the next launch.
 */
export function onWidgetQueued(handler: () => void): () => void {
  if (!available()) return () => {};
  let handle: PluginListenerHandle | undefined;
  let cancelled = false;
  void native
    .addListener('widgetQueued', handler)
    .then((h) => {
      if (cancelled) void h.remove();
      else handle = h;
    })
    .catch(() => {
      /* listener is best-effort */
    });
  return () => {
    cancelled = true;
    void handle?.remove();
  };
}

/** True where the launcher can add the widget for us in one tap (Android 8+). */
export function canPinWidget(): boolean {
  return Capacitor.getPlatform() === 'android';
}
