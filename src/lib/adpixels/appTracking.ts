'use client';

import { Capacitor } from '@capacitor/core';

export type AppTrackingStatus = 'authorized' | 'denied' | 'restricted' | 'notDetermined' | 'unavailable';

async function loadAdMob() {
  const { AdMob } = await import('@capacitor-community/admob');
  // Capacitor plugins are proxies: resolving one directly from an async
  // function probes its `then` property as though it were a native method.
  return { AdMob };
}

export async function appTrackingStatus(): Promise<AppTrackingStatus> {
  if (Capacitor.getPlatform() !== 'ios') return 'unavailable';
  try {
    const { AdMob } = await loadAdMob();
    const { status } = await AdMob.trackingAuthorizationStatus();
    return status;
  } catch {
    return 'unavailable';
  }
}

export async function requestAppTracking(): Promise<AppTrackingStatus> {
  const before = await appTrackingStatus();
  if (before !== 'notDetermined') return before;
  try {
    const { AdMob } = await loadAdMob();
    await AdMob.requestTrackingAuthorization();
  } catch {
    return 'unavailable';
  }
  return appTrackingStatus();
}
