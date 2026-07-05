'use client';

import { Capacitor } from '@capacitor/core';

const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';

export type RewardedAdResult = 'rewarded' | 'dismissed' | 'failed';

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

export async function showRewardedAd(): Promise<RewardedAdResult> {
  if (!rewardedAdsAvailable()) return 'failed';
  try {
    const AdMob = await ensureInitialized();
    const { RewardAdPluginEvents } = await import('@capacitor-community/admob');

    return await new Promise<RewardedAdResult>((resolve) => {
      let settled = false;
      let rewarded = false;
      const handles: Array<{ remove: () => Promise<void> }> = [];
      const finish = (result: RewardedAdResult) => {
        if (settled) return;
        settled = true;
        for (const h of handles) void h.remove();
        resolve(result);
      };

      void (async () => {
        try {
          handles.push(
            await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
              rewarded = true;
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
    return 'failed';
  }
}
