'use client';

import { Capacitor } from '@capacitor/core';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import type { AdMobPlugin } from '@capacitor-community/admob';

export type RewardedAdResult = 'rewarded' | 'dismissed' | 'failed';

type AdUnitKey =
  | 'daily_flies'
  | 'gift_double'
  | 'reward_double'
  | 'shop_reroll'
  | 'trade_reroll';

const REWARDED_AD_UNITS: Record<'ios' | 'android', Record<AdUnitKey, string>> = {
  ios: {
    daily_flies: 'ca-app-pub-9295411240414755/6724678646',
    gift_double: 'ca-app-pub-9295411240414755/1788424034',
    reward_double: 'ca-app-pub-9295411240414755/5727669049',
    shop_reroll: 'ca-app-pub-9295411240414755/2638471275',
    trade_reroll: 'ca-app-pub-9295411240414755/5411596977',
  },
  android: {
    daily_flies: 'ca-app-pub-9295411240414755/5536097357',
    gift_double: 'ca-app-pub-9295411240414755/5073062929',
    reward_double: 'ca-app-pub-9295411240414755/1284649700',
    shop_reroll: 'ca-app-pub-9295411240414755/8971568030',
    trade_reroll: 'ca-app-pub-9295411240414755/8846560473',
  },
};

/** Placements with a unit of their own. Every other placement is a "double
 *  your reward" prompt, which the server also budgets as `reward_double`. */
const PLACEMENT_AD_UNITS: Record<string, AdUnitKey> = {
  daily_flies: 'daily_flies',
  gift_double: 'gift_double',
  shop_reroll: 'shop_reroll',
  trade_reroll: 'trade_reroll',
};

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

let consentBlocked = false;
let privacyOptionsRequired = false;

const consentListeners = new Set<() => void>();

export function subscribeAdConsent(listener: () => void) {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

function notifyAdConsentChanged() {
  consentListeners.forEach((listener) => listener());
}

export function rewardedAdsAvailable() {
  return Capacitor.isNativePlatform() && !consentBlocked;
}

/** True once the UMP flow has told us this user is entitled to a "Privacy
 *  options" entry point, which Google requires us to surface for them. */
export function privacyOptionsAvailable() {
  return Capacitor.isNativePlatform() && privacyOptionsRequired;
}

function testDeviceIdentifiers() {
  return (process.env.NEXT_PUBLIC_ADMOB_TEST_DEVICE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function rewardedAdUnitId(placement: string) {
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  const key = PLACEMENT_AD_UNITS[placement] ?? 'reward_double';
  return REWARDED_AD_UNITS[platform][key];
}

async function runConsentFlow(AdMob: AdMobPlugin) {
  const { AdmobConsentStatus, AdmobConsentDebugGeography } = await import(
    '@capacitor-community/admob'
  );
  const testDevices = testDeviceIdentifiers();

  try {
    let info = await AdMob.requestConsentInfo(
      testDevices.length
        ? {
            debugGeography: AdmobConsentDebugGeography.EEA,
            testDeviceIdentifiers: testDevices,
          }
        : undefined,
    );

    if (
      info.status === AdmobConsentStatus.REQUIRED &&
      info.isConsentFormAvailable
    ) {
      info = await AdMob.showConsentForm();
    }

    privacyOptionsRequired =
      String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
    consentBlocked = info.canRequestAds === false;
    notifyAdConsentChanged();

    trackAnalyticsEvent('ad_consent_resolved', {
      status: info.status,
      can_request_ads: info.canRequestAds,
    });
  } catch (err) {
    console.error('AdMob consent flow failed', err);
    trackAnalyticsEvent('ad_consent_failed', {});
  }
}

/** Re-opens the UMP privacy options form so a user can change their choice.
 *  Consent state may flip either way, so ad availability is re-read after. */
export async function openPrivacyOptions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const AdMob = await ensureInitialized();
    await AdMob.showPrivacyOptionsForm();
    const info = await AdMob.requestConsentInfo();
    consentBlocked = info.canRequestAds === false;
    if (consentBlocked) resetPreload();
    notifyAdConsentChanged();
    return true;
  } catch (err) {
    console.error('Privacy options form failed', err);
    return false;
  }
}

let initPromise: Promise<AdMobPlugin> | null = null;

async function ensureInitialized(): Promise<AdMobPlugin> {
  const { AdMob } = await import('@capacitor-community/admob');
  if (!initPromise) {
    initPromise = (async () => {
      await runConsentFlow(AdMob);

      if (Capacitor.getPlatform() === 'ios') {
        try {
          const info = await AdMob.trackingAuthorizationStatus();
          if (info.status === 'notDetermined') {
            await AdMob.requestTrackingAuthorization();
          }
          const { refreshNativeAttribution } = await import('@/lib/purchases');
          void refreshNativeAttribution();
        } catch {
          /* tracking prompt is best-effort */
        }
      }

      const testDevices = testDeviceIdentifiers();
      await AdMob.initialize(
        testDevices.length
          ? { testingDevices: testDevices, initializeForTesting: true }
          : {},
      );
      return AdMob;
    })();
  }
  return initPromise;
}

let preloadPromise: Promise<boolean> | null = null;
let preloadedUnit: string | null = null;

function resetPreload() {
  preloadedUnit = null;
  preloadPromise = null;
}

/** Loads a rewarded ad ahead of the tap that spends it. Safe to call often —
 *  concurrent callers share one load and an already-loaded ad resolves at once.
 *  Only one ad can be pending, so a different placement's unit replaces it. */
export function preloadRewardedAd(placement: string): Promise<boolean> {
  if (!rewardedAdsAvailable()) return Promise.resolve(false);

  const unitId = rewardedAdUnitId(placement);
  if (preloadedUnit === unitId) return Promise.resolve(true);
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    try {
      const AdMob = await ensureInitialized();
      if (consentBlocked) return false;
      await AdMob.prepareRewardVideoAd({ adId: unitId });
      preloadedUnit = unitId;
      return true;
    } catch (err) {
      console.error('Rewarded ad preload failed', err);
      preloadedUnit = null;
      return false;
    } finally {
      preloadPromise = null;
    }
  })();

  return preloadPromise;
}

export async function showRewardedAd(placement = 'unknown'): Promise<RewardedAdResult> {
  trackAnalyticsEvent('ad_requested', { placement });
  if (!Capacitor.isNativePlatform()) {
    trackAnalyticsEvent('ad_failed', { placement, reason: 'unsupported_platform' });
    return 'failed';
  }
  try {
    const AdMob = await ensureInitialized();
    if (consentBlocked) {
      trackAnalyticsEvent('ad_failed', { placement, reason: 'consent' });
      return 'failed';
    }

    const wasPreloaded = preloadedUnit === rewardedAdUnitId(placement);
    if (!(await preloadRewardedAd(placement))) {
      trackAnalyticsEvent('ad_failed', { placement, reason: 'load' });
      return 'failed';
    }
    trackAnalyticsEvent('ad_ready', { placement, preloaded: wasPreloaded });

    const { RewardAdPluginEvents } = await import('@capacitor-community/admob');

    return await new Promise<RewardedAdResult>((resolve) => {
      let settled = false;
      let rewarded = false;
      let impressionTracked = false;
      const handles: Array<{ remove: () => Promise<void> }> = [];
      const finish = (result: RewardedAdResult) => {
        if (settled) return;
        settled = true;
        resetPreload();
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
        void preloadRewardedAd(placement);
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
