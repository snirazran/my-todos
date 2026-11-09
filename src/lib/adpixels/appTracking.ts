'use client';

import { Capacitor } from '@capacitor/core';

export type AppTrackingStatus = 'authorized' | 'denied' | 'restricted' | 'notDetermined' | 'unavailable';

async function loadAdMob() {
  const { AdMob } = await import('@capacitor-community/admob');
  return AdMob;
}

export async function appTrackingStatus(): Promise<AppTrackingStatus> {
  if (Capacitor.getPlatform() !== 'ios') return 'unavailable';
  try {
    const { status } = await (await loadAdMob()).trackingAuthorizationStatus();
    return status;
  } catch {
    return 'unavailable';
  }
}

export async function requestAppTracking(): Promise<AppTrackingStatus> {
  const before = await appTrackingStatus();
  if (before !== 'notDetermined') return before;
  try {
    await (await loadAdMob()).requestTrackingAuthorization();
  } catch {
    return 'unavailable';
  }
  return appTrackingStatus();
}
