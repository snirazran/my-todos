import type { AnalyticsEventName } from '@/lib/analytics/events';

type PixelMapping = {
  meta?: string;
  tiktok?: string;
};

export const PIXEL_EVENTS: Partial<Record<AnalyticsEventName, PixelMapping>> = {
  page_viewed: { meta: 'PageView', tiktok: 'Pageview' },
  paywall_viewed: { meta: 'ViewContent', tiktok: 'ViewContent' },
  fly_shop_viewed: { meta: 'ViewContent', tiktok: 'ViewContent' },
  home_shop_rail_viewed: { meta: 'ViewContent', tiktok: 'ViewContent' },
  try_signup_completed: { meta: 'CompleteRegistration', tiktok: 'CompleteRegistration' },
  purchase_started: { meta: 'InitiateCheckout', tiktok: 'InitiateCheckout' },
  fly_pack_purchase_started: { meta: 'InitiateCheckout', tiktok: 'InitiateCheckout' },
  store_product_purchase_started: { meta: 'InitiateCheckout', tiktok: 'InitiateCheckout' },
};

const CONTENT_FALLBACK: Partial<Record<AnalyticsEventName, string>> = {
  paywall_viewed: 'plus',
  fly_shop_viewed: 'flies',
  home_shop_rail_viewed: 'flies',
};

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function pixelParams(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
) {
  const props = properties ?? {};
  const contentId =
    str(props.pack_id) ??
    str(props.product_id) ??
    str(props.plan) ??
    CONTENT_FALLBACK[name];
  const value = num(props.price_usd);

  const meta: Record<string, unknown> = {};
  const tiktok: Record<string, unknown> = {};

  if (contentId) {
    meta.content_type = 'product';
    meta.content_ids = [contentId];
    meta.content_name = contentId;
    tiktok.content_type = 'product';
    tiktok.contents = [
      { content_id: contentId, content_name: contentId, quantity: 1, price: value },
    ];
  }

  if (value !== undefined) {
    meta.value = value;
    meta.currency = 'USD';
    tiktok.value = value;
    tiktok.currency = 'USD';
  }

  return { meta, tiktok };
}
