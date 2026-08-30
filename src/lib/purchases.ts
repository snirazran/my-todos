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
  return { Purchases };
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
  const { Purchases } = await getNativePurchases(uid);
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
  const { Purchases } = await getNativePurchases(uid);
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
      const { Purchases } = await getNativePurchases(uid);
      const { PURCHASES_ERROR_CODE } = await import('@revenuecat/purchases-capacitor');
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        (entry) =>
          entry.identifier === pack.packageId ||
          entry.product.identifier === pack.productId,
      );
      if (!pkg) throw new Error(`RevenueCat package ${pack.packageId} is not configured`);
      try {
        console.log('[flybuy] purchasing', pack.productId);
        await Purchases.purchasePackage({ aPackage: pkg });
        console.log('[flybuy] purchasePackage resolved');
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

/**
 * Buy any store product by its identifier, whether or not the fly shop sells
 * it — the offer-only SKUs a campaign exists to sell.
 *
 * On a device the store is asked for the product directly, so a product that
 * belongs to no RevenueCat offering still works. On the web there is no such
 * escape hatch: web billing only sells packages, so every offering is searched
 * and an unknown identifier is a real error rather than a silent no-op.
 */
export async function purchaseStoreProduct(
  productId: string,
  placement = 'campaign',
): Promise<PurchaseOutcome> {
  const uid = requireUid();
  const id = productId.trim();
  if (!id) throw new Error('No product id');
  const store = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';

  trackAnalyticsEvent('store_product_purchase_started', {
    product_id: id,
    store,
    placement,
  });

  try {
    if (Capacitor.isNativePlatform()) {
      const { Purchases } = await getNativePurchases(uid);
      const { PURCHASES_ERROR_CODE, PRODUCT_CATEGORY } = await import(
        '@revenuecat/purchases-capacitor'
      );

      // A consumable and a subscription are fetched differently on Android, and
      // asking for the wrong category returns nothing rather than an error.
      let product = (
        await Purchases.getProducts({
          productIdentifiers: [id],
          type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
        })
      ).products[0];
      if (!product) {
        product = (
          await Purchases.getProducts({
            productIdentifiers: [id],
            type: PRODUCT_CATEGORY.SUBSCRIPTION,
          })
        ).products[0];
      }
      if (!product) throw new Error(`The store does not offer "${id}"`);

      try {
        await Purchases.purchaseStoreProduct({ product });
      } catch (error: any) {
        if (
          error?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
          error?.userCancelled
        ) {
          trackAnalyticsEvent('store_product_purchase_cancelled', {
            product_id: id,
            store,
            placement,
          });
          return 'cancelled';
        }
        throw error;
      }
    } else {
      const purchases = await getWebPurchases(uid);
      const { ErrorCode, PurchasesError } = await import('@revenuecat/purchases-js');
      const offerings = await purchases.getOfferings();
      const candidates = [
        ...(offerings.current ? [offerings.current] : []),
        ...Object.values(offerings.all ?? {}),
      ];
      const pkg = candidates
        .flatMap((offering) => offering.availablePackages)
        .find(
          (entry) =>
            entry.identifier === id || entry.webBillingProduct.identifier === id,
        );
      if (!pkg) throw new Error(`No web package sells "${id}"`);
      try {
        await purchases.purchase({
          rcPackage: pkg,
          customerEmail: auth?.currentUser?.email ?? undefined,
        });
      } catch (error) {
        if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) {
          trackAnalyticsEvent('store_product_purchase_cancelled', {
            product_id: id,
            store,
            placement,
          });
          return 'cancelled';
        }
        throw error;
      }
    }

    await syncPremiumWithServer();
    trackAnalyticsEvent('store_product_purchase_completed', {
      product_id: id,
      store,
      placement,
    });
    return 'purchased';
  } catch (error) {
    trackAnalyticsEvent('store_product_purchase_failed', {
      product_id: id,
      store,
      placement,
      reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    });
    throw error;
  }
}

/**
 * Every product identifier this build can actually sell, read from the live
 * store. The admin picker uses it so a campaign can never point at a SKU that
 * does not exist — the failure mode that only shows up in production.
 */
export async function listStoreProducts(): Promise<
  { id: string; label: string; price: string; offering: string }[]
> {
  const uid = requireUid();
  const rows: { id: string; label: string; price: string; offering: string }[] = [];

  if (Capacitor.isNativePlatform()) {
    const { Purchases } = await getNativePurchases(uid);
    const offerings = await Purchases.getOfferings();
    for (const [key, offering] of Object.entries(offerings.all ?? {})) {
      for (const pkg of offering.availablePackages) {
        rows.push({
          id: pkg.product.identifier,
          label: pkg.product.title || pkg.identifier,
          price: pkg.product.priceString,
          offering: key,
        });
      }
    }
  } else {
    const purchases = await getWebPurchases(uid);
    const offerings = await purchases.getOfferings();
    for (const [key, offering] of Object.entries(offerings.all ?? {})) {
      for (const pkg of offering.availablePackages) {
        rows.push({
          id: pkg.webBillingProduct.identifier,
          label: pkg.webBillingProduct.title || pkg.identifier,
          price: pkg.webBillingProduct.price.formattedPrice,
          offering: key,
        });
      }
    }
  }

  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.id) && seen.add(row.id));
}

export async function getFlyPackPrices(): Promise<Partial<Record<FlyPackId, string>>> {
  const uid = requireUid();
  const prices: Partial<Record<FlyPackId, string>> = {};
  if (Capacitor.isNativePlatform()) {
    const { Purchases } = await getNativePurchases(uid);
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

export type PlusPriceInfo = {
  priceString: string;
  amount: number;
  currency: string;
  pricePerMonthString: string | null;
};

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      amount,
    );
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * The live store price for each Plus plan. The paywall must never print a
 * hardcoded figure: outside the US the store charges something else entirely,
 * and a price the checkout sheet contradicts is an App Review rejection.
 */
export async function getPlusPricing(): Promise<
  Partial<Record<PlusPlan, PlusPriceInfo>>
> {
  const uid = requireUid();
  const prices: Partial<Record<PlusPlan, PlusPriceInfo>> = {};

  if (Capacitor.isNativePlatform()) {
    const { Purchases } = await getNativePurchases(uid);
    const offering = (await Purchases.getOfferings()).current;
    for (const [plan, pkg] of [
      ['yearly', offering?.annual],
      ['monthly', offering?.monthly],
    ] as const) {
      if (!pkg) continue;
      prices[plan] = {
        priceString: pkg.product.priceString,
        amount: pkg.product.price,
        currency: pkg.product.currencyCode,
        pricePerMonthString:
          pkg.product.pricePerMonthString ??
          (typeof pkg.product.pricePerMonth === 'number'
            ? formatMoney(pkg.product.pricePerMonth, pkg.product.currencyCode)
            : null),
      };
    }
    return prices;
  }

  const purchases = await getWebPurchases(uid);
  const offering = (await purchases.getOfferings()).current;
  for (const [plan, pkg] of [
    ['yearly', offering?.annual],
    ['monthly', offering?.monthly],
  ] as const) {
    if (!pkg) continue;
    const price = pkg.webBillingProduct.price;
    const amount = price.amountMicros / 1_000_000;
    prices[plan] = {
      priceString: price.formattedPrice,
      amount,
      currency: price.currency,
      pricePerMonthString:
        plan === 'yearly' ? formatMoney(amount / 12, price.currency) : null,
    };
  }
  return prices;
}

export function formatPlusPrice(amount: number, currency: string): string {
  return formatMoney(amount, currency);
}
