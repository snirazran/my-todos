'use client';

import { Capacitor } from '@capacitor/core';
import { auth } from '@/lib/firebase';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { FLY_PACKS, getFlyPack, getFlyPackForProduct, type FlyPackId } from '@/lib/flyPacks';
import { parseProductRef, type ProductRef } from '@/lib/campaigns/productRef';
import type { PriceQuote } from '@/lib/campaigns/tokens';
import { markNegativeMoment } from '@/lib/rateApp';
import { formatTrialPeriod, parseTrialPeriod, type TrialPeriod } from '@/lib/plusPaywall';

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
    try {
      if (Capacitor.getPlatform() === 'ios') {
        await Purchases.enableAdServicesAttributionTokenCollection();
      }
      await Purchases.collectDeviceIdentifiers();
      const email = auth?.currentUser?.email;
      if (email) await Purchases.setEmail({ email });
    } catch (err) {
      console.error('RevenueCat attribution setup failed', err);
    }
  }
  return { Purchases };
}

export async function initNativePurchases() {
  if (!Capacitor.isNativePlatform()) return;
  const uid = auth?.currentUser?.uid;
  if (!uid || nativeConfiguredFor === uid) return;
  try {
    await getNativePurchases(uid);
  } catch (err) {
    console.error('RevenueCat early configure failed', err);
  }
}

export async function refreshNativeAttribution() {
  if (!Capacitor.isNativePlatform()) return;
  if (!nativeConfiguredFor) return;
  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    await Purchases.collectDeviceIdentifiers();
  } catch (err) {
    console.error('RevenueCat attribution refresh failed', err);
  }
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

type PlusPurchaseResult = { outcome: PurchaseOutcome; environment?: 'SANDBOX' | 'PRODUCTION' };

const PAYMENT_PENDING_CODE = '20';

export function purchaseErrorCode(error: unknown): string {
  const source = error as { code?: unknown; errorCode?: unknown } | null;
  const code = source?.code ?? source?.errorCode;
  if (typeof code === 'string' || typeof code === 'number') return String(code);
  return error instanceof Error ? error.name : 'unknown';
}

export function isPaymentPending(error: unknown) {
  return purchaseErrorCode(error) === PAYMENT_PENDING_CODE;
}

function plusEnvironment(isSandbox: boolean | undefined): PlusPurchaseResult['environment'] {
  if (isSandbox === undefined) return undefined;
  return isSandbox ? 'SANDBOX' : 'PRODUCTION';
}

async function purchasePlusNative(
  uid: string,
  plan: PlusPlan,
  placement: string,
  onSheet: () => void,
): Promise<PlusPurchaseResult> {
  const { Purchases } = await getNativePurchases(uid);
  const { PURCHASES_ERROR_CODE } = await import('@revenuecat/purchases-capacitor');
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current;
  const pkg = plan === 'yearly' ? offering?.annual : offering?.monthly;
  if (!pkg) throw new Error(`No ${plan} package available`);
  await Purchases.setAttributes({ paywall_placement: placement }).catch(() => {});
  onSheet();
  let isSandbox: boolean | undefined;
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    isSandbox = customerInfo.entitlements.active['plus']?.isSandbox;
  } catch (err: any) {
    if (
      err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
      err?.userCancelled
    ) {
      return { outcome: 'cancelled' };
    }
    throw err;
  }
  await syncPremiumWithServer();
  return { outcome: 'purchased', environment: plusEnvironment(isSandbox) };
}

async function purchasePlusWeb(
  uid: string,
  plan: PlusPlan,
  placement: string,
  onSheet: () => void,
): Promise<PlusPurchaseResult> {
  const purchases = await getWebPurchases(uid);
  const { ErrorCode, PurchasesError } = await import('@revenuecat/purchases-js');
  const offerings = await purchases.getOfferings();
  const offering = offerings.current;
  const pkg = plan === 'yearly' ? offering?.annual : offering?.monthly;
  if (!pkg) throw new Error(`No ${plan} package available`);
  await purchases.setAttributes({ paywall_placement: placement }).catch(() => {});
  onSheet();
  let isSandbox: boolean | undefined;
  try {
    const { customerInfo } = await purchases.purchase({
      rcPackage: pkg,
      customerEmail: auth?.currentUser?.email ?? undefined,
    });
    isSandbox = customerInfo.entitlements.active['plus']?.isSandbox;
  } catch (err) {
    if (
      err instanceof PurchasesError &&
      err.errorCode === ErrorCode.UserCancelledError
    ) {
      return { outcome: 'cancelled' };
    }
    throw err;
  }
  await syncPremiumWithServer();
  return { outcome: 'purchased', environment: plusEnvironment(isSandbox) };
}

export async function purchasePlus(
  plan: PlusPlan,
  placement = 'unknown',
  paywallSession?: string,
): Promise<PurchaseOutcome> {
  const uid = requireUid();
  const store = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  const context = { plan, store, placement, paywall_session: paywallSession };
  const progress: { stage: 'setup' | 'sheet' } = { stage: 'setup' };
  const onSheet = () => {
    progress.stage = 'sheet';
  };
  trackAnalyticsEvent('purchase_started', context);
  try {
    const result = Capacitor.isNativePlatform()
      ? await purchasePlusNative(uid, plan, placement, onSheet)
      : await purchasePlusWeb(uid, plan, placement, onSheet);
    trackAnalyticsEvent(
      result.outcome === 'purchased' ? 'purchase_completed' : 'purchase_cancelled',
      { ...context, environment: result.environment },
    );
    return result.outcome;
  } catch (error) {
    markNegativeMoment('purchase_failed');
    trackAnalyticsEvent('purchase_failed', {
      ...context,
      stage: progress.stage,
      error_code: purchaseErrorCode(error),
      reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
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
    markNegativeMoment('purchase_failed');
    trackAnalyticsEvent('fly_pack_purchase_failed', {
      pack_id: pack.id,
      store,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

export type ProductDiscount = { appleOfferId?: string; googleOfferId?: string };

type NativePurchases = Awaited<ReturnType<typeof getNativePurchases>>['Purchases'];
type NativeProduct = import('@revenuecat/purchases-capacitor').PurchasesStoreProduct;
type NativePackage = import('@revenuecat/purchases-capacitor').PurchasesPackage;
type WebPackage = import('@revenuecat/purchases-js').Package;

function packForRef(ref: ProductRef | null) {
  if (!ref) return undefined;
  if (ref.kind === 'pack') return getFlyPack(ref.packId);
  if (ref.kind === 'store') return getFlyPackForProduct(ref.productId);
  return undefined;
}

function googleOption(product: NativeProduct, offerId: string) {
  return (product.subscriptionOptions ?? []).find(
    (option) =>
      option.id === offerId || option.id.endsWith(`:${offerId}`) || option.tags.includes(offerId),
  );
}

async function applePromotion(Purchases: NativePurchases, product: NativeProduct, offerId: string) {
  const discount = (product.discounts ?? []).find((item) => item.identifier === offerId);
  if (!discount) return null;
  const signed = await Purchases.getPromotionalOffer({ product, discount }).catch(() => undefined);
  return signed ? { discount, signed } : null;
}

async function purchaseNativePackage(
  Purchases: NativePurchases,
  pkg: NativePackage,
  discount?: ProductDiscount,
) {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' && discount?.appleOfferId) {
    const promotion = await applePromotion(Purchases, pkg.product, discount.appleOfferId);
    if (promotion) {
      return Purchases.purchaseDiscountedPackage({ aPackage: pkg, discount: promotion.signed });
    }
  }
  if (platform === 'android' && discount?.googleOfferId) {
    const option = googleOption(pkg.product, discount.googleOfferId);
    if (option) return Purchases.purchaseSubscriptionOption({ subscriptionOption: option });
  }
  return Purchases.purchasePackage({ aPackage: pkg });
}

async function nativePackageFor(Purchases: NativePurchases, ref: ProductRef) {
  const offerings = await Purchases.getOfferings();
  if (ref.kind === 'package') {
    return (
      offerings.all?.[ref.offeringId]?.availablePackages.find(
        (entry) => entry.identifier === ref.packageId,
      ) ?? null
    );
  }
  const pack = packForRef(ref);
  if (pack) {
    return (
      offerings.current?.availablePackages.find(
        (entry) => entry.identifier === pack.packageId || entry.product.identifier === pack.productId,
      ) ?? null
    );
  }
  if (ref.kind !== 'store') return null;
  return (
    Object.values(offerings.all ?? {})
      .flatMap((offering) => offering.availablePackages)
      .find((entry) => entry.product.identifier === ref.productId) ?? null
  );
}

async function webPackageFor(
  purchases: Awaited<ReturnType<typeof getWebPurchases>>,
  ref: ProductRef,
): Promise<WebPackage | null> {
  const offerings = await purchases.getOfferings();
  if (ref.kind === 'package') {
    return (
      offerings.all?.[ref.offeringId]?.availablePackages.find(
        (entry) => entry.identifier === ref.packageId,
      ) ?? null
    );
  }
  const pack = packForRef(ref);
  const candidates = [
    ...(offerings.current ? [offerings.current] : []),
    ...Object.values(offerings.all ?? {}),
  ].flatMap((offering) => offering.availablePackages);
  if (pack) return candidates.find((entry) => entry.identifier === pack.packageId) ?? null;
  if (ref.kind !== 'store') return null;
  return (
    candidates.find(
      (entry) =>
        entry.identifier === ref.productId || entry.webBillingProduct.identifier === ref.productId,
    ) ?? null
  );
}

export async function purchaseStoreProduct(
  productRef: string,
  placement = 'campaign',
  discount?: ProductDiscount,
): Promise<PurchaseOutcome> {
  const uid = requireUid();
  const id = productRef.trim();
  if (!id) throw new Error('No product id');
  const ref = parseProductRef(id);
  const pack = packForRef(ref);
  if (pack) return purchaseFlyPack(pack.id);
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

      const pkg = ref ? await nativePackageFor(Purchases, ref) : null;
      if (ref?.kind === 'package' && !pkg) {
        throw new Error(`RevenueCat package "${id}" is not available on this device`);
      }

      // A consumable and a subscription are fetched differently on Android, and
      // asking for the wrong category returns nothing rather than an error.
      let product: NativeProduct | undefined;
      if (!pkg) {
        product = (
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
      }

      try {
        if (pkg) await purchaseNativePackage(Purchases, pkg, discount);
        else if (product) await Purchases.purchaseStoreProduct({ product });
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
      const pkg = ref ? await webPackageFor(purchases, ref) : null;
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
    markNegativeMoment('purchase_failed');
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

function periodLabel(iso: string | null | undefined): string | undefined {
  const match = /^P(\d+)([DWMY])$/.exec(iso ?? '');
  if (!match) return undefined;
  const count = Number(match[1]);
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[match[2] as 'D' | 'W' | 'M' | 'Y'];
  if (unit === 'day' && count === 7) return 'week';
  if (unit === 'month' && count === 12) return 'year';
  return count === 1 ? unit : `${count} ${unit}s`;
}

function discounted(
  base: PriceQuote,
  formatted: string,
  amount: number,
  period: string | undefined,
): PriceQuote {
  if (!(amount < base.amount)) return { ...base, period };
  return {
    formatted,
    amount,
    currency: base.currency,
    regularFormatted: base.formatted,
    regularAmount: base.amount,
    period,
  };
}

async function nativeQuote(
  Purchases: NativePurchases,
  product: NativeProduct,
  discount: ProductDiscount | undefined,
): Promise<PriceQuote> {
  const base: PriceQuote = {
    formatted: product.priceString,
    amount: product.price,
    currency: product.currencyCode,
  };
  const subscription = !!product.subscriptionPeriod || !!product.defaultOption;
  if (!subscription) return base;
  const period = periodLabel(product.subscriptionPeriod ?? product.defaultOption?.billingPeriod?.iso8601);

  if (Capacitor.getPlatform() === 'ios') {
    if (discount?.appleOfferId) {
      const promotion = await applePromotion(Purchases, product, discount.appleOfferId);
      if (promotion) {
        return discounted(base, promotion.discount.priceString, promotion.discount.price, period);
      }
    }
    const intro = product.introPrice;
    if (intro && intro.price > 0) {
      const { INTRO_ELIGIBILITY_STATUS } = await import('@revenuecat/purchases-capacitor');
      const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility({
        productIdentifiers: [product.identifier],
      }).catch(() => null);
      if (
        eligibility?.[product.identifier]?.status ===
        INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
      ) {
        return discounted(base, intro.priceString, intro.price, period);
      }
    }
    return { ...base, period };
  }

  const option =
    (discount?.googleOfferId ? googleOption(product, discount.googleOfferId) : undefined) ??
    product.defaultOption;
  const full = option?.fullPricePhase?.price;
  const regular: PriceQuote = full
    ? { formatted: full.formatted, amount: full.amountMicros / 1_000_000, currency: full.currencyCode }
    : base;
  const intro = option?.introPhase?.price;
  return intro
    ? discounted(regular, intro.formatted, intro.amountMicros / 1_000_000, period)
    : { ...regular, period };
}

function webQuote(pkg: WebPackage): PriceQuote {
  const product = pkg.webBillingProduct;
  const base: PriceQuote = {
    formatted: product.price.formattedPrice,
    amount: product.price.amountMicros / 1_000_000,
    currency: product.price.currency,
  };
  if (!product.period && !product.normalPeriodDuration) return base;
  const period = periodLabel(product.normalPeriodDuration);
  const intro = product.introPricePhase?.price;
  return intro
    ? discounted(base, intro.formattedPrice, intro.amountMicros / 1_000_000, period)
    : { ...base, period };
}

const QUOTE_TTL_MS = 10 * 60_000;
const quoteCache: Record<string, { at: number; quote: PriceQuote | null }> = {};

export async function getPricesForRefs(
  refs: string[],
  discounts: Record<string, ProductDiscount> = {},
): Promise<Record<string, PriceQuote>> {
  const uid = requireUid();
  const quotes: Record<string, PriceQuote> = {};
  const wanted = refs.filter((ref, index) => !!ref && refs.indexOf(ref) === index);
  const keyOf = (ref: string) =>
    `${uid}|${ref}|${discounts[ref]?.appleOfferId ?? ''}|${discounts[ref]?.googleOfferId ?? ''}`;

  const missing = wanted.filter((ref) => {
    const hit = quoteCache[keyOf(ref)];
    if (!hit || Date.now() - hit.at > QUOTE_TTL_MS) return true;
    if (hit.quote) quotes[ref] = hit.quote;
    return false;
  });
  if (!missing.length) return quotes;

  const remember = (ref: string, quote: PriceQuote | null) => {
    quoteCache[keyOf(ref)] = { at: Date.now(), quote };
    if (quote) quotes[ref] = quote;
  };

  if (Capacitor.isNativePlatform()) {
    const { Purchases } = await getNativePurchases(uid);
    const { PRODUCT_CATEGORY } = await import('@revenuecat/purchases-capacitor');
    await Promise.all(
      missing.map(async (raw) => {
        const ref = parseProductRef(raw);
        if (!ref) return remember(raw, null);
        let product: NativeProduct | undefined = (await nativePackageFor(Purchases, ref))?.product;
        if (!product && ref.kind === 'store') {
          for (const type of [PRODUCT_CATEGORY.NON_SUBSCRIPTION, PRODUCT_CATEGORY.SUBSCRIPTION]) {
            if (product) break;
            product = (
              await Purchases.getProducts({ productIdentifiers: [ref.productId], type }).catch(() => ({
                products: [] as NativeProduct[],
              }))
            ).products[0];
          }
        }
        remember(raw, product ? await nativeQuote(Purchases, product, discounts[raw]) : null);
      }),
    );
    return quotes;
  }

  const purchases = await getWebPurchases(uid);
  await Promise.all(
    missing.map(async (raw) => {
      const ref = parseProductRef(raw);
      const pkg = ref ? await webPackageFor(purchases, ref) : null;
      remember(raw, pkg ? webQuote(pkg) : null);
    }),
  );
  return quotes;
}

export type PlusPriceInfo = {
  priceString: string;
  amount: number;
  currency: string;
  pricePerMonthString: string | null;
  /** Only populated when the store returns an eligible free introductory offer. */
  trialDuration: string | null;
  trialPeriod: TrialPeriod | null;
  /** A paid introductory phase can follow a free trial. Checkout shows its terms. */
  hasIntroPrice: boolean;
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
    const packages = [offering?.annual, offering?.monthly].filter((pkg) => !!pkg);
    const { INTRO_ELIGIBILITY_STATUS } = await import('@revenuecat/purchases-capacitor');
    // Unknown eligibility must not be presented as a guaranteed free trial.
    const eligibility = Capacitor.getPlatform() === 'ios'
      ? await Purchases.checkTrialOrIntroductoryPriceEligibility({
          productIdentifiers: packages.map((pkg) => pkg.product.identifier),
        }).catch(() => ({} as Awaited<ReturnType<typeof Purchases.checkTrialOrIntroductoryPriceEligibility>>))
      : null;
    for (const [plan, pkg] of [
      ['yearly', offering?.annual],
      ['monthly', offering?.monthly],
    ] as const) {
      if (!pkg) continue;
      const intro = pkg.product.introPrice;
      const eligible = eligibility?.[pkg.product.identifier]?.status ===
        INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
      const option = pkg.product.defaultOption;
      const freePhase = option?.freePhase;
      const trial = Capacitor.getPlatform() === 'ios'
        ? eligible && intro?.price === 0
          ? parseTrialPeriod(intro.period, intro.cycles)
          : null
        : freePhase
          ? parseTrialPeriod(freePhase.billingPeriod.iso8601, freePhase.billingCycleCount || 1)
          : null;
      prices[plan] = {
        priceString: pkg.product.priceString,
        amount: pkg.product.price,
        currency: pkg.product.currencyCode,
        pricePerMonthString:
          pkg.product.pricePerMonthString ??
          (typeof pkg.product.pricePerMonth === 'number'
            ? formatMoney(pkg.product.pricePerMonth, pkg.product.currencyCode)
            : null),
        trialDuration: formatTrialPeriod(trial),
        trialPeriod: trial,
        hasIntroPrice: Capacitor.getPlatform() === 'ios'
          ? eligible && !!intro && intro.price > 0
          : !!option?.introPhase,
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
    // getOfferings returns customer-eligible options, matching purchasePlusWeb.
    const option = pkg.webBillingProduct.defaultSubscriptionOption;
    const trial = option?.trial
      ? parseTrialPeriod(option.trial.periodDuration, option.trial.cycleCount || 1)
      : null;
    prices[plan] = {
      priceString: price.formattedPrice,
      amount,
      currency: price.currency,
      pricePerMonthString:
        plan === 'yearly' ? formatMoney(amount / 12, price.currency) : null,
      trialDuration: formatTrialPeriod(trial),
      trialPeriod: trial,
      hasIntroPrice: !!option?.introPrice,
    };
  }
  return prices;
}

export function formatPlusPrice(amount: number, currency: string): string {
  return formatMoney(amount, currency);
}
