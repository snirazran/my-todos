'use client';

import { Capacitor } from '@capacitor/core';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { auth } from '@/lib/firebase';
import { markNegativeMoment } from '@/lib/rateApp';
import type { AdMobPlugin } from '@capacitor-community/admob';

export type RewardedAdResult = 'rewarded' | 'dismissed' | 'failed';

export const REWARDED_ADS_ENABLED = true;

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

const BUDGET_PLACEMENTS: Record<string, string> = {
  daily_flies: 'daily_flies',
  gift_double: 'gift_double',
  shop_reroll: 'shop_reroll',
  trade_reroll: 'trade_reroll',
  double_reward: 'reward_double',
  quest_reward_double: 'reward_double',
  streak_commitment_double: 'reward_double',
};

const DEFAULT_AD_FAILURE_MESSAGE =
  'Ad not available right now — try again in a moment.';
const PRELOAD_MAX_AGE_MS = 50 * 60 * 1000;
const SHOW_TIMEOUT_MS = 20_000;
const REWARD_GRACE_MS = 800;

let lastFailureMessage = DEFAULT_AD_FAILURE_MESSAGE;

export function rewardedAdFailureMessage() {
  return lastFailureMessage;
}

function budgetRefusalMessage(reason: string, cooldownLeft: number) {
  if (reason === 'cooldown') {
    return `Next ad is ready in ${Math.max(1, cooldownLeft)}s.`;
  }
  if (reason === 'premium') {
    return 'Plus members skip ads — refresh to see your perks.';
  }
  return "You've watched all of today's ads for this — come back tomorrow.";
}

async function checkAdBudget(
  placement: string,
): Promise<{ ok: true } | { ok: false; message: string; reason: string }> {
  const budgetPlacement = BUDGET_PLACEMENTS[placement];
  if (!budgetPlacement) return { ok: true };
  try {
    const res = await fetch('/api/rewards/ad-budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placement: budgetPlacement }),
    });
    if (!res.ok) return { ok: true };
    const data = await res.json();
    if (data?.ok !== false) return { ok: true };
    const reason = String(data.reason ?? 'daily_cap');
    return {
      ok: false,
      reason,
      message: budgetRefusalMessage(reason, Number(data.cooldownLeft) || 0),
    };
  } catch {
    return { ok: true };
  }
}

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
  return (
    REWARDED_ADS_ENABLED && Capacitor.isNativePlatform() && !consentBlocked
  );
}

/** True once the UMP flow has told us this user is entitled to a "Privacy
 *  options" entry point, which Google requires us to surface for them. */
export function privacyOptionsAvailable() {
  return (
    REWARDED_ADS_ENABLED && Capacitor.isNativePlatform() && privacyOptionsRequired
  );
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

function rewardedAdKey(placement: string) {
  return `${rewardedAdUnitId(placement)}|${auth?.currentUser?.uid ?? ''}`;
}

let consentFormPending = false;
let trackingAsked = false;

type ConsentInfo = Awaited<ReturnType<AdMobPlugin['requestConsentInfo']>>;

function applyConsentInfo(info: ConsentInfo) {
  privacyOptionsRequired =
    String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
  consentFormPending =
    info.canRequestAds === false && info.isConsentFormAvailable === true;
  consentBlocked = info.canRequestAds === false && !consentFormPending;
  notifyAdConsentChanged();
}

async function refreshConsentInfo(AdMob: AdMobPlugin) {
  const { AdmobConsentDebugGeography } = await import(
    '@capacitor-community/admob'
  );
  const testDevices = testDeviceIdentifiers();
  try {
    const info = await AdMob.requestConsentInfo(
      testDevices.length
        ? {
            debugGeography: AdmobConsentDebugGeography.EEA,
            testDeviceIdentifiers: testDevices,
          }
        : undefined,
    );
    applyConsentInfo(info);
    trackAnalyticsEvent('ad_consent_resolved', {
      status: info.status,
      can_request_ads: info.canRequestAds,
    });
  } catch (err) {
    console.error('AdMob consent info failed', err);
    trackAnalyticsEvent('ad_consent_failed', {});
  }
}

async function resolvePendingConsent(AdMob: AdMobPlugin) {
  if (!consentFormPending) return;
  try {
    const info = await AdMob.showConsentForm();
    applyConsentInfo(info);
    trackAnalyticsEvent('ad_consent_resolved', {
      status: info.status,
      can_request_ads: info.canRequestAds,
    });
  } catch (err) {
    console.error('AdMob consent form failed', err);
    trackAnalyticsEvent('ad_consent_failed', {});
  }
}

async function requestTrackingOnce(AdMob: AdMobPlugin): Promise<boolean> {
  if (trackingAsked || Capacitor.getPlatform() !== 'ios') return false;
  trackingAsked = true;
  try {
    const { status } = await AdMob.trackingAuthorizationStatus();
    if (status !== 'notDetermined') return false;
    await AdMob.requestTrackingAuthorization();
    const { refreshNativeAttribution } = await import('@/lib/purchases');
    void refreshNativeAttribution();
    const after = await AdMob.trackingAuthorizationStatus();
    return after.status === 'authorized';
  } catch {
    return false;
  }
}

/** Re-opens the UMP privacy options form so a user can change their choice.
 *  Consent state may flip either way, so ad availability is re-read after. */
export async function openPrivacyOptions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { AdMob } = await ensureInitialized();
    await AdMob.showPrivacyOptionsForm();
    applyConsentInfo(await AdMob.requestConsentInfo());
    if (consentBlocked || consentFormPending) resetPreload();
    return true;
  } catch (err) {
    console.error('Privacy options form failed', err);
    return false;
  }
}

let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<{ AdMob: AdMobPlugin }> {
  const { AdMob } = await import('@capacitor-community/admob');
  if (!initPromise) {
    initPromise = (async () => {
      await refreshConsentInfo(AdMob);
      const testDevices = testDeviceIdentifiers();
      await AdMob.initialize(
        testDevices.length
          ? { testingDevices: testDevices, initializeForTesting: true }
          : {},
      );
    })();
  }
  await initPromise;
  return { AdMob };
}

let preloadPromise: Promise<boolean> | null = null;
let preloadingUnit: string | null = null;
let preloadedUnit: string | null = null;
let preloadedAt = 0;
let preloadSeq = 0;

function resetPreload() {
  preloadedUnit = null;
  preloadedAt = 0;
  preloadPromise = null;
  preloadingUnit = null;
}

/** Loads a rewarded ad ahead of the tap that spends it. Safe to call often —
 *  concurrent callers share one load and an already-loaded ad resolves at once.
 *  Only one ad can be pending, so a different placement's unit replaces it. */
export async function preloadRewardedAd(placement: string): Promise<boolean> {
  if (!rewardedAdsAvailable()) return false;

  const unitId = rewardedAdUnitId(placement);
  const adKey = rewardedAdKey(placement);
  const uid = auth?.currentUser?.uid;
  if (preloadPromise && preloadingUnit !== adKey) {
    await preloadPromise;
  }
  if (
    preloadedUnit === adKey &&
    Date.now() - preloadedAt < PRELOAD_MAX_AGE_MS
  ) {
    return true;
  }
  if (preloadPromise && preloadingUnit === adKey) return preloadPromise;

  preloadingUnit = adKey;
  const loadId = ++preloadSeq;
  const load = (async () => {
    try {
      const { AdMob } = await ensureInitialized();
      if (consentBlocked || consentFormPending) return false;
      await AdMob.prepareRewardVideoAd({
        adId: unitId,
        ...(uid
          ? { ssv: { userId: uid, customData: BUDGET_PLACEMENTS[placement] ?? placement } }
          : {}),
      });
      preloadedUnit = adKey;
      preloadedAt = Date.now();
      return true;
    } catch (err) {
      console.error('Rewarded ad preload failed', err);
      preloadedUnit = null;
      return false;
    } finally {
      if (preloadSeq === loadId) {
        preloadPromise = null;
        preloadingUnit = null;
      }
    }
  })();
  preloadPromise = load;
  return load;
}

export async function showRewardedAd(placement = 'unknown'): Promise<RewardedAdResult> {
  lastFailureMessage = DEFAULT_AD_FAILURE_MESSAGE;
  trackAnalyticsEvent('ad_requested', { placement });
  if (!rewardedAdsAvailable()) {
    trackAnalyticsEvent('ad_failed', { placement, reason: 'unsupported_platform' });
    return 'failed';
  }
  try {
    const budget = await checkAdBudget(placement);
    if (!budget.ok) {
      lastFailureMessage = budget.message;
      trackAnalyticsEvent('ad_failed', { placement, reason: budget.reason });
      return 'failed';
    }

    const { AdMob } = await ensureInitialized();
    await resolvePendingConsent(AdMob);
    if (consentBlocked || consentFormPending) {
      trackAnalyticsEvent('ad_failed', { placement, reason: 'consent' });
      return 'failed';
    }
    if (await requestTrackingOnce(AdMob)) resetPreload();

    const wasPreloaded =
      preloadedUnit === rewardedAdKey(placement) &&
      Date.now() - preloadedAt < PRELOAD_MAX_AGE_MS;
    if (!(await preloadRewardedAd(placement))) {
      markNegativeMoment('ad_failed');
      trackAnalyticsEvent('ad_failed', { placement, reason: 'load' });
      return 'failed';
    }
    trackAnalyticsEvent('ad_ready', { placement, preloaded: wasPreloaded });

    const { RewardAdPluginEvents } = await import('@capacitor-community/admob');

    return await new Promise<RewardedAdResult>((resolve) => {
      let settled = false;
      let rewarded = false;
      let dismissed = false;
      let impressionTracked = false;
      let showTimer: ReturnType<typeof setTimeout> | null = null;
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      const handles: Array<{ remove: () => Promise<void> }> = [];
      const finish = (result: RewardedAdResult) => {
        if (settled) return;
        settled = true;
        if (showTimer) clearTimeout(showTimer);
        if (graceTimer) clearTimeout(graceTimer);
        resetPreload();
        if (result === 'rewarded') recordRewardedAdCompleted();
        if (result === 'failed') markNegativeMoment('ad_failed');
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
      const markRewarded = () => {
        rewarded = true;
        if (dismissed) finish('rewarded');
      };

      void (async () => {
        try {
          handles.push(
            await AdMob.addListener(RewardAdPluginEvents.Rewarded, markRewarded),
            await AdMob.addListener(RewardAdPluginEvents.Showed, () => {
              if (showTimer) {
                clearTimeout(showTimer);
                showTimer = null;
              }
              if (impressionTracked) return;
              impressionTracked = true;
              trackAnalyticsEvent('ad_impression', { placement });
            }),
            await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
              dismissed = true;
              if (showTimer) {
                clearTimeout(showTimer);
                showTimer = null;
              }
              if (rewarded) {
                finish('rewarded');
                return;
              }
              graceTimer = setTimeout(
                () => finish(rewarded ? 'rewarded' : 'dismissed'),
                REWARD_GRACE_MS,
              );
            }),
            await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
              finish('failed');
            }),
          );
          showTimer = setTimeout(() => {
            if (!impressionTracked) finish('failed');
          }, SHOW_TIMEOUT_MS);
          const item = await AdMob.showRewardVideoAd();
          if (item) markRewarded();
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
