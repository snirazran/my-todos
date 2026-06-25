'use client';

import { getApps, getApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported,
} from 'firebase/messaging';
import { notifyTaskSync } from '@/lib/taskSyncClient';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const PREF_KEY = 'frogress.webPushPref';

/** User intent for web push on this device. 'off' means they toggled it off. */
export function getWebPushPref(): 'on' | 'off' | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(PREF_KEY);
  return v === 'on' || v === 'off' ? v : null;
}

function setWebPushPref(v: 'on' | 'off') {
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    /* ignore */
  }
}

function swUrl() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };
  return `/firebase-messaging-sw.js?${new URLSearchParams(cfg).toString()}`;
}

export async function isWebPushSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }
  if (!VAPID_KEY) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export function webPushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

let foregroundBound = false;

function bindForeground() {
  if (foregroundBound) return;
  foregroundBound = true;
  try {
    const messaging = getMessaging(getApps().length ? getApp() : undefined);
    onMessage(messaging, (payload) => {
      const n = payload.notification ?? {};
      const data = (payload.data ?? {}) as Record<string, string>;
      if (data.type === 'task_sync') {
        notifyTaskSync({ reason: 'remote-message', changedAt: data.changedAt });
        return;
      }
      const title = n.title || data.title || 'Frogress';
      void navigator.serviceWorker.ready
        .then((reg) =>
          reg.showNotification(title, {
            body: n.body || data.body || '',
            icon: '/192x192.png',
            badge: '/192x192.png',
            data,
          }),
        )
        .catch(() => {});
    });
  } catch {
    /* ignore */
  }
}

async function activeRegistration() {
  const registration = await navigator.serviceWorker.register(swUrl());
  // getToken's PushManager.subscribe needs an ACTIVE worker; a fresh
  // register() resolves while it's still installing, so wait for activation.
  if (!registration.active) {
    await new Promise<void>((resolve) => {
      const sw = registration.installing || registration.waiting;
      if (!sw) {
        resolve();
        return;
      }
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve();
      });
    });
  }
  await navigator.serviceWorker.ready;
  return registration;
}

async function mintToken(registration: ServiceWorkerRegistration) {
  const messaging = getMessaging(getApps().length ? getApp() : undefined);
  return getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
}

async function registerToken() {
  try {
    let registration = await activeRegistration();
    let token: string;
    try {
      token = await mintToken(registration);
    } catch (err) {
      // A subscription minted with a previously-wrong VAPID key sticks to the
      // worker and keeps failing. Drop it + the worker, then retry once.
      console.warn('Retrying web push after clearing stale subscription:', err);
      const sub = await registration.pushManager.getSubscription();
      await sub?.unsubscribe().catch(() => {});
      await registration.unregister().catch(() => {});
      registration = await activeRegistration();
      token = await mintToken(registration);
    }
    if (token) {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await fetch('/api/notifications/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fcmToken: token, timezone, platform: 'web' }),
      });
      bindForeground();
    }
  } catch (err) {
    console.error('Web push registration failed:', err);
  }
}

/**
 * Request permission (if needed), mint a web FCM token and register it with the
 * server. Web tokens land in notificationPrefs.fcmTokens, so the existing
 * timer / scheduled-task / smart-reminder send paths deliver to them as-is.
 * Returns the resulting browser permission state.
 */
export async function enableWebPush(): Promise<NotificationPermission> {
  if (!(await isWebPushSupported())) {
    return webPushPermission() as NotificationPermission;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return permission;

  setWebPushPref('on');
  await registerToken();
  return permission;
}

/**
 * Turn web push off on this device: remove its token from the server so the
 * send paths skip it. The browser permission stays granted, so re-enabling
 * never re-prompts.
 */
export async function disableWebPush(): Promise<void> {
  setWebPushPref('off');
  try {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    const messaging = getMessaging(getApps().length ? getApp() : undefined);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration ?? undefined,
    }).catch(() => null);
    if (token) {
      await fetch('/api/notifications/register', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fcmToken: token }),
      });
    }
    await deleteToken(messaging).catch(() => {});
  } catch (err) {
    console.error('Web push disable failed:', err);
  }
}

/**
 * On-load setup when permission was already granted in a previous session:
 * refresh the server token and (re)bind the foreground message listener.
 * Never prompts; respects an explicit "off" choice.
 */
export async function initWebPush(): Promise<void> {
  if (!(await isWebPushSupported())) return;
  if (Notification.permission !== 'granted') return;
  if (getWebPushPref() === 'off') return;
  await registerToken();
}
