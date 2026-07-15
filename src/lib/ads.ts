'use client';

import { Capacitor } from '@capacitor/core';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';

export type RewardedAdResult = 'rewarded' | 'dismissed' | 'failed';

const PLUS_OFFER_AD_COUNT_KEY = 'plusOffer.rewardedAdCount';
const PLUS_OFFER_LAST_SHOWN_KEY = 'plusOffer.lastShownAt';
const PLUS_OFFER_AD_THRESHOLD = 3;
const PLUS_OFFER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function readStoredNumber(key: string) {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeStoredNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* storage is best-effort */
  }
}

function recordRewardedAdCompleted() {
  writeStoredNumber(
    PLUS_OFFER_AD_COUNT_KEY,
    readStoredNumber(PLUS_OFFER_AD_COUNT_KEY) + 1,
  );
}

/** Frequency-capped Plus pitch: true once per 24h at most, and only after the
 *  user has completed a few rewarded ads since the last pitch. Consuming the
 *  offer resets the counter, so callers should show the paywall when it
 *  returns true. */
export function takePlusOfferAfterAd(): boolean {
  if (readStoredNumber(PLUS_OFFER_AD_COUNT_KEY) < PLUS_OFFER_AD_THRESHOLD) {
    return false;
  }
  const lastShown = readStoredNumber(PLUS_OFFER_LAST_SHOWN_KEY);
  if (Date.now() - lastShown < PLUS_OFFER_COOLDOWN_MS) return false;
  writeStoredNumber(PLUS_OFFER_AD_COUNT_KEY, 0);
  writeStoredNumber(PLUS_OFFER_LAST_SHOWN_KEY, Date.now());
  return true;
}

export function rewardedAdsAvailable() {
  return Capacitor.isNativePlatform();
}

function rewardedAdUnitId() {
  if (Capacitor.getPlatform() === 'ios') {
    return process.env.NEXT_PUBLIC_ADMOB_REWARDED_AD_UNIT_IOS || TEST_REWARDED_IOS;
  }
  return (
    process.env.NEXT_PUBLIC_ADMOB_REWARDED_AD_UNIT_ANDROID || TEST_REWARDED_ANDROID
  );
}

let initPromise: Promise<void> | null = null;

async function ensureInitialized() {
  const { AdMob } = await import('@capacitor-community/admob');
  if (!initPromise) {
    initPromise = (async () => {
      await AdMob.initialize();
      if (Capacitor.getPlatform() === 'ios') {
        try {
          const info = await AdMob.trackingAuthorizationStatus();
          if (info.status === 'notDetermined') {
            await AdMob.requestTrackingAuthorization();
          }
        } catch {
          /* tracking prompt is best-effort */
        }
      }
    })();
  }
  await initPromise;
  return AdMob;
}

export async function showRewardedAd(placement = 'unknown'): Promise<RewardedAdResult> {
  trackAnalyticsEvent('ad_requested', { placement });
  if (!rewardedAdsAvailable()) {
    trackAnalyticsEvent('ad_failed', { placement, reason: 'unsupported_platform' });
    return 'failed';
  }
  try {
    const AdMob = await ensureInitialized();
    const { RewardAdPluginEvents } = await import('@capacitor-community/admob');

    return await new Promise<RewardedAdResult>((resolve) => {
      let settled = false;
      let rewarded = false;
      let impressionTracked = false;
      const handles: Array<{ remove: () => Promise<void> }> = [];
      const finish = (result: RewardedAdResult) => {
        if (settled) return;
        settled = true;
        if (result === 'rewarded') recordRewardedAdCompleted();
        trackAnalyticsEvent(
          result === 'rewarded'
            ? 'ad_completed'
            : result === 'dismissed'
              ? 'ad_dismissed'
              : 'ad_failed',
          { placement },
        );
        for (const h of handles) void h.remove();
        resolve(result);
      };

      void (async () => {
        try {
          handles.push(
            await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
              rewarded = true;
            }),
            await AdMob.addListener(RewardAdPluginEvents.Showed, () => {
              if (impressionTracked) return;
              impressionTracked = true;
              trackAnalyticsEvent('ad_impression', { placement });
            }),
            await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
              finish(rewarded ? 'rewarded' : 'dismissed');
            }),
            await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
              finish('failed');
            }),
          );
          await AdMob.prepareRewardVideoAd({ adId: rewardedAdUnitId() });
          await AdMob.showRewardVideoAd();
        } catch (err) {
          console.error('Rewarded ad failed', err);
          finish('failed');
        }
      })();
    });
  } catch (err) {
    console.error('Rewarded ad init failed', err);
    trackAnalyticsEvent('ad_failed', { placement, reason: 'initialization' });
    return 'failed';
  }
}
