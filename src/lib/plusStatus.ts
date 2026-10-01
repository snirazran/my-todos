'use client';

import useSWR from 'swr';
import { Capacitor } from '@capacitor/core';

export type PlusStore = 'app_store' | 'play_store' | 'web' | 'unknown';

export type PlusStatus = {
  isPremium: boolean;
  premiumUntil: string | null;
  source: 'subscription' | 'gift' | null;
  subscription: {
    plan: 'yearly' | 'monthly' | null;
    store: PlusStore;
    periodType: 'trial' | 'intro' | 'normal';
    expiresAt: string | null;
    startedAt: string | null;
    willRenew: boolean;
    billingIssue: boolean;
    managementUrl: string | null;
    productId: string | null;
  } | null;
};

export type PlusPhase =
  | 'trial'
  | 'trial_cancelled'
  | 'active'
  | 'cancelled'
  | 'billing_issue'
  | 'gift'
  | 'inactive';

export const PLUS_STATUS_KEY = '/api/plus/status';
const ANDROID_PACKAGE = 'io.frog.tasks';
const DAY_MS = 86_400_000;

async function fetchStatus(url: string): Promise<PlusStatus> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Plus status failed (${res.status})`);
  return res.json();
}

export function usePlusStatus(enabled = true) {
  return useSWR<PlusStatus>(enabled ? PLUS_STATUS_KEY : null, fetchStatus, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
}

export function prefetchPlusStatus() {
  return fetchStatus(PLUS_STATUS_KEY);
}

export function plusPhase(status: PlusStatus | undefined): PlusPhase {
  if (!status?.isPremium) return 'inactive';
  const sub = status.subscription;
  if (status.source === 'gift' || !sub) return 'gift';
  if (sub.billingIssue) return 'billing_issue';
  if (sub.periodType === 'trial') return sub.willRenew ? 'trial' : 'trial_cancelled';
  return sub.willRenew ? 'active' : 'cancelled';
}

export function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));
}

export function formatPlusDate(iso: string | null | undefined, withYear = false) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function storeName(store: PlusStore | undefined) {
  if (store === 'app_store') return 'Apple';
  if (store === 'play_store') return 'Google Play';
  if (store === 'web') return 'Frogress';
  return 'your store';
}

export function storeMatchesDevice(store: PlusStore | undefined) {
  const platform = Capacitor.getPlatform();
  if (store === 'app_store') return platform === 'ios';
  if (store === 'play_store') return platform === 'android';
  if (store === 'web') return !Capacitor.isNativePlatform();
  return false;
}

export type ManageTarget =
  | { kind: 'url'; url: string; label: string }
  | { kind: 'steps'; steps: string };

export function manageTarget(status: PlusStatus | undefined): ManageTarget | null {
  const sub = status?.subscription;
  if (!sub) return null;
  if (sub.store === 'app_store') {
    if (Capacitor.getPlatform() === 'ios') {
      return {
        kind: 'url',
        url: 'https://apps.apple.com/account/subscriptions',
        label: 'Manage in App Store',
      };
    }
    return {
      kind: 'steps',
      steps:
        'You subscribed with Apple. On your iPhone or iPad, open Settings → your name → Subscriptions → Frogress.',
    };
  }
  if (sub.store === 'play_store') {
    const sku = sub.productId?.split(':')[0];
    return {
      kind: 'url',
      url: `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}${sku ? `&sku=${encodeURIComponent(sku)}` : ''}`,
      label: 'Manage in Google Play',
    };
  }
  if (sub.managementUrl) {
    return { kind: 'url', url: sub.managementUrl, label: 'Manage subscription' };
  }
  return {
    kind: 'steps',
    steps:
      'Use the “Manage subscription” link in your Frogress receipt email, or contact support and we’ll sort it out.',
  };
}

export function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
