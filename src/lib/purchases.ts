'use client';

import { Capacitor } from '@capacitor/core';
import { auth } from '@/lib/firebase';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { FLY_PACKS, getFlyPack, type FlyPackId } from '@/lib/flyPacks';

export type PlusPlan = 'yearly' | 'monthly';
export type PurchaseOutcome = 'purchased' | 'cancelled';

let nativeConfiguredFor: string | null = null;
let webConfiguredFor: string | null = null;

function requireUid(): string {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in to purchase');
  return uid;
}

async function getNativePurchases(uid: string) {
  const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
  if (nativeConfiguredFor !== uid) {
    const apiKey =
      Capacitor.getPlatform() === 'ios'
        ? process.env.NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY
        : process.env.NEXT_PUBLIC_REVENUECAT_GOOGLE_API_KEY;
    if (!apiKey) throw new Error('RevenueCat API key not configured');
    if (process.env.NODE_ENV !== 'production') {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    }
    await Purchases.configure({ apiKey, appUserID: uid });
    nativeConfiguredFor = uid;
  }
  return Purchases;
}

async function getWebPurchases(uid: string) {
  const { Purchases } = await import('@revenuecat/purchases-js');
  if (webConfiguredFor === uid && Purchases.isConfigured()) {
    return Purchases.getSharedInstance();
  }
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY;
  if (!apiKey) throw new Error('RevenueCat API key not configured');
  const instance = Purchases.configure({ apiKey, appUserId: uid });
  webConfiguredFor = uid;
  return instance;
}

async function syncPremiumWithServer() {
  try {
    await fetch('/api/purchases/sync', { method: 'POST' });
  } catch (err) {
    console.error('Failed to sync premium status', err);
  }
}

async function purchasePlusNative(uid: string, plan: PlusPlan): Promise<PurchaseOutcome> {
  const Purchases = await getNativePurchases(uid);
  const { PURCHASES_ERROR_CODE } = await import('@revenuecat/purchases-capacitor');
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current;
  const pkg = plan === 'yearly' ? offering?.annual : offering?.monthly;
  if (!pkg) throw new Error(`No ${plan} package available`);
  try {
    await Purchases.purchasePackage({ aPackage: pkg });
  } catch (err: any) {
    if (
      err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
      err?.userCancelled
    ) {
      return 'cancelled';
    }
    throw err;
  }
  await syncPremiumWithServer();
  return 'purchased';
}

async function purchasePlusWeb(uid: string, plan: PlusPlan): Promise<PurchaseOutcome> {
  const purchases = await getWebPurchases(uid);
  const { ErrorCode, PurchasesError } = await import('@revenuecat/purchases-js');
  const offerings = await purchases.getOfferings();
  const offering = offerings.current;
  const pkg = plan === 'yearly' ? offering?.annual : offering?.monthly;
  if (!pkg) throw new Error(`No ${plan} package available`);
  try {
    await purchases.purchase({
      rcPackage: pkg,
      customerEmail: auth?.currentUser?.email ?? undefined,
    });
  } catch (err) {
    if (
      err instanceof PurchasesError &&
      err.errorCode === ErrorCode.UserCancelledError
    ) {
      return 'cancelled';
    }
    throw err;
  }
  await syncPremiumWithServer();
  return 'purchased';
}

export async function purchasePlus(plan: PlusPlan, placement = 'unknown'): Promise<PurchaseOutcome> {
  const uid = requireUid();
  const store = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  trackAnalyticsEvent('purchase_started', { plan, store, placement });
  try {
    const outcome = Capacitor.isNativePlatform()
      ? await purchasePlusNative(uid, plan)
      : await purchasePlusWeb(uid, plan);
    trackAnalyticsEvent(
      outcome === 'purchased' ? 'purchase_completed' : 'purchase_cancelled',
      { plan, store, placement },
    );
    return outcome;
  } catch (error) {
    trackAnalyticsEvent('purchase_failed', {
      plan,
      store,
      placement,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

export async function restorePlusPurchases(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const uid = requireUid();
  const Purchases = await getNativePurchases(uid);
  const { customerInfo } = await Purchases.restorePurchases();
  await syncPremiumWithServer();
  return !!customerInfo.entitlements.active['plus'];
}

export async function purchaseFlyPack(packId: FlyPackId): Promise<PurchaseOutcome> {
  const uid = requireUid();
  const pack = getFlyPack(packId);
  if (!pack) throw new Error('Unknown fly pack');
  const store = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  trackAnalyticsEvent('fly_pack_selected', {
    pack_id: pack.id,
    fly_amount: pack.amount,
    price_usd: pack.priceUsd,
    store,
  });
  trackAnalyticsEvent('fly_pack_purchase_started', {
    pack_id: pack.id,
    fly_amount: pack.amount,
    price_usd: pack.priceUsd,
    store,
  });

  try {
    if (Capacitor.isNativePlatform()) {
      const Purchases = await getNativePurchases(uid);
      const { PURCHASES_ERROR_CODE } = await import('@revenuecat/purchases-capacitor');
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        (entry) =>
          entry.identifier === pack.packageId ||
          entry.product.identifier === pack.productId,
      );
      if (!pkg) throw new Error(`RevenueCat package ${pack.packageId} is not configured`);
      try {
        await Purchases.purchasePackage({ aPackage: pkg });
      } catch (error: any) {
        if (
          error?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
          error?.userCancelled
        ) {
          trackAnalyticsEvent('fly_pack_purchase_cancelled', { pack_id: pack.id, store });
          return 'cancelled';
        }
        throw error;
      }
    } else {
      const purchases = await getWebPurchases(uid);
      const { ErrorCode, PurchasesError } = await import('@revenuecat/purchases-js');
      const offerings = await purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        (entry) =>
          entry.identifier === pack.packageId ||
          entry.webBillingProduct.identifier === pack.productId,
      );
      if (!pkg) throw new Error(`RevenueCat package ${pack.packageId} is not configured`);
      try {
        await purchases.purchase({
          rcPackage: pkg,
          customerEmail: auth?.currentUser?.email ?? undefined,
        });
      } catch (error) {
        if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) {
          trackAnalyticsEvent('fly_pack_purchase_cancelled', { pack_id: pack.id, store });
          return 'cancelled';
        }
        throw error;
      }
    }
    return 'purchased';
  } catch (error) {
    trackAnalyticsEvent('fly_pack_purchase_failed', {
      pack_id: pack.id,
      store,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

export async function getFlyPackPrices(): Promise<Partial<Record<FlyPackId, string>>> {
  const uid = requireUid();
  const prices: Partial<Record<FlyPackId, string>> = {};
  if (Capacitor.isNativePlatform()) {
    const Purchases = await getNativePurchases(uid);
    const offerings = await Purchases.getOfferings();
    for (const pack of FLY_PACKS) {
      const pkg = offerings.current?.availablePackages.find(
        (entry) => entry.identifier === pack.packageId || entry.product.identifier === pack.productId,
      );
      if (pkg) prices[pack.id] = pkg.product.priceString;
    }
    return prices;
  }
  const purchases = await getWebPurchases(uid);
  const offerings = await purchases.getOfferings();
  for (const pack of FLY_PACKS) {
    const pkg = offerings.current?.availablePackages.find(
      (entry) => entry.identifier === pack.packageId || entry.webBillingProduct.identifier === pack.productId,
    );
    if (pkg) prices[pack.id] = pkg.webBillingProduct.price.formattedPrice;
  }
  return prices;
}
