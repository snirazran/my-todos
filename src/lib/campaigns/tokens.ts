import {
  PURCHASING_ACTIONS,
  isBlockingTemplate,
  type CampaignOffer,
  type CampaignTemplate,
  type CtaAction,
  type SignalAction,
} from './types';
import { packRef } from './productRef';

export const TEXT_TOKENS = [
  {
    token: '{price}',
    label: 'Price',
    help: "The live store price of this button's product, or of the popup's offer product, in the user's own currency.",
  },
  {
    token: '{regular_price}',
    label: 'Regular price',
    help: 'For a discounted subscription: what it renews at after the discounted period.',
  },
  { token: '{period}', label: 'Period', help: 'For a subscription: how often it bills, e.g. "year".' },
  {
    token: '{was_price}',
    label: 'Was price',
    help: 'The struck-out price: the compared product (Rules → Offer), or the regular price of a discounted subscription.',
  },
  {
    token: '{save}',
    label: 'Saving',
    help: 'How much cheaper {price} is than {was_price}, e.g. "50%", worked out from the live prices.',
  },
  { token: '{frog}', label: "Frog's name", help: "The user's frog name." },
  { token: '{flies}', label: 'Fly balance', help: 'How many flies the user has right now.' },
  { token: '{time}', label: 'Countdown', help: 'Timers only — the time left.' },
] as const;

export type PriceQuote = {
  formatted: string;
  amount: number;
  currency: string;
  regularFormatted?: string;
  regularAmount?: number;
  period?: string;
};

export type CampaignTokenValues = {
  prices: Record<string, PriceQuote>;
  frog: string;
  flies: string;
};

export const EMPTY_TOKEN_VALUES: CampaignTokenValues = { prices: {}, frog: '', flies: '' };

type OfferCampaign = { offer: CampaignOffer };

const PRICE_TOKEN = /\{(price|regular_price|period|was_price|save)\}/;

export const usesPriceTokens = (text: string | undefined) => !!text && PRICE_TOKEN.test(text);

export const usesCompareTokens = (text: string | undefined) =>
  !!text && /\{(was_price|save)\}/.test(text);

export function campaignOfferRef(campaign: OfferCampaign): string {
  if (campaign.offer.productId) return campaign.offer.productId;
  if (campaign.offer.packId) return packRef(campaign.offer.packId);
  return '';
}

export function actionPriceRef(
  action: CtaAction | undefined,
  config: { packId?: string; productId?: string },
  campaign: OfferCampaign,
): string {
  switch (action) {
    case 'buy_pack': {
      const packId = config.packId || campaign.offer.packId;
      return packId ? packRef(packId) : '';
    }
    case 'buy_product':
      return config.productId || campaign.offer.productId || '';
    case 'open_fly_shop':
      return config.packId ? packRef(config.packId) : '';
    default:
      return '';
  }
}

type ActionOwner = { action?: CtaAction; packId?: string; productId?: string };

type RefCampaign = OfferCampaign & {
  template: CampaignTemplate;
  cta: ActionOwner;
  canvas: { elements: ActionOwner[] };
  rive: { buttons: (Omit<ActionOwner, 'action'> & { action: SignalAction })[] };
};

export function campaignProductRefs(campaign: RefCampaign): { charged: string[]; quoted: string[] } {
  const charged: string[] = [];
  const quoted: string[] = [];
  const add = (list: string[], ref: string) => {
    if (ref && !list.includes(ref)) list.push(ref);
  };
  const consider = (owner: ActionOwner) => {
    if (!owner.action) return;
    const ref = actionPriceRef(owner.action, owner, campaign);
    add(PURCHASING_ACTIONS.includes(owner.action) ? charged : quoted, ref);
  };

  if (isBlockingTemplate(campaign.template)) {
    campaign.canvas.elements.forEach(consider);
  } else {
    consider(campaign.cta);
  }
  campaign.rive.buttons.forEach((button) =>
    consider(button.action === 'cta' ? campaign.cta : { ...button, action: button.action }),
  );

  const all = [...charged];
  quoted.forEach((ref) => add(all, ref));
  add(all, campaignOfferRef(campaign));
  add(all, campaign.offer.compareRef ?? '');
  return { charged, quoted: all };
}

export function textPriceRef(
  owner: { action?: CtaAction; packId?: string; productId?: string } | null,
  campaign: OfferCampaign,
) {
  const own = owner ? actionPriceRef(owner.action, owner, campaign) : '';
  return own || campaignOfferRef(campaign);
}

function savingFor(price?: PriceQuote, was?: { amount: number; currency: string }) {
  if (!price || !was || price.currency !== was.currency) return '';
  if (!(was.amount > price.amount) || !(was.amount > 0)) return '';
  return `${Math.round((1 - price.amount / was.amount) * 100)}%`;
}

function wasFor(price?: PriceQuote, compared?: PriceQuote) {
  if (compared) return compared;
  if (price?.regularFormatted && typeof price.regularAmount === 'number') {
    return { formatted: price.regularFormatted, amount: price.regularAmount, currency: price.currency };
  }
  return undefined;
}

export function fillTokens(
  text: string,
  values: CampaignTokenValues,
  priceRef: string,
  compareRef: string,
): string {
  if (!text || !text.includes('{')) return text;
  const price = priceRef ? values.prices[priceRef] : undefined;
  const was = wasFor(price, compareRef ? values.prices[compareRef] : undefined);
  return text
    .replace(/\{price\}/g, price?.formatted ?? '')
    .replace(/\{regular_price\}/g, price?.regularFormatted ?? price?.formatted ?? '')
    .replace(/\{period\}/g, price?.period ?? '')
    .replace(/\{was_price\}/g, was?.formatted ?? '')
    .replace(/\{save\}/g, savingFor(price, was))
    .replace(/\{frog\}/g, values.frog)
    .replace(/\{flies\}/g, values.flies);
}

export type PricedText = { text: string; priceRef: string; compareRef: string };

type TextOwner = ActionOwner & { text?: string; inputs?: { value?: unknown }[] };

type TextCampaign = OfferCampaign & {
  template: CampaignTemplate;
  cta: ActionOwner;
  copy: { eyebrow?: string; headline?: string; body?: string; ctaLabel?: string };
  canvas: { elements: TextOwner[] };
  rive: { inputs?: { value?: unknown }[] };
};

export function pricedTexts(campaign: TextCampaign): PricedText[] {
  const compareRef = campaign.offer.compareRef ?? '';
  const found: PricedText[] = [];
  const consider = (text: unknown, owner: ActionOwner | null) => {
    if (typeof text !== 'string' || !usesPriceTokens(text)) return;
    found.push({ text, priceRef: textPriceRef(owner, campaign), compareRef });
  };

  if (isBlockingTemplate(campaign.template)) {
    campaign.canvas.elements.forEach((element) => {
      const owner = element.action ? element : null;
      consider(element.text, owner);
      element.inputs?.forEach((input) => consider(input.value, owner));
    });
  } else {
    const { eyebrow, headline, body, ctaLabel } = campaign.copy;
    [eyebrow, headline, body, ctaLabel].forEach((text) => consider(text, campaign.cta));
  }
  campaign.rive.inputs?.forEach((input) => consider(input.value, campaign.cta));
  return found;
}

export function hasBlankPrice(entry: PricedText, values: CampaignTokenValues): boolean {
  const price = entry.priceRef ? values.prices[entry.priceRef] : undefined;
  const was = wasFor(price, entry.compareRef ? values.prices[entry.compareRef] : undefined);
  const checks: [RegExp, string][] = [
    [/\{price\}/, price?.formatted ?? ''],
    [/\{regular_price\}/, price?.regularFormatted ?? price?.formatted ?? ''],
    [/\{period\}/, price?.period ?? ''],
    [/\{was_price\}/, was?.formatted ?? ''],
    [/\{save\}/, savingFor(price, was)],
  ];
  return checks.some(([pattern, value]) => pattern.test(entry.text) && !value);
}

export const HARDCODED_PRICE = /(?:[$€£¥₪]\s?\d)|(?:\d[\d.,]*\s?(?:USD|EUR|GBP|ILS)\b)/i;
