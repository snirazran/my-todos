import {
  CTA_ACTION_NEEDS,
  ELEMENT_LABELS,
  PURCHASING_ACTIONS,
  isClickableElement,
  type CampaignCanvas,
  type CampaignCaps,
  type CampaignCta,
  type CampaignElement,
  type CampaignOffer,
  type CampaignRive,
  type CampaignStatus,
  type CampaignTargeting,
  type CampaignTemplate,
  type CampaignTriggerRule,
  type CtaAction,
} from './types';
import {
  HARDCODED_PRICE,
  campaignProductRefs,
  pricedTexts,
  usesCompareTokens,
} from './tokens';
import type { OfferProductKind, OfferStore } from './offerProducts';

/**
 * `error` is something that cannot work at all — the campaign would show
 * nothing, or a button would do nothing. `warning` is something that works but
 * will probably be regretted. `tip` is craft.
 *
 * The split matters because only errors block going live: an admin who is
 * warned about everything equally soon stops reading.
 */
export type ReviewLevel = 'error' | 'warning' | 'tip';

export type ReviewNote = {
  level: ReviewLevel;
  message: string;
  /** Set when the note is about one element, so the editor can jump to it. */
  elementId?: string;
};

export type ReviewableCampaign = {
  name: string;
  template: CampaignTemplate;
  status: CampaignStatus;
  imageUrl?: string;
  copy: { headline: string; ctaLabel: string };
  cta: CampaignCta;
  offer: CampaignOffer;
  rive: CampaignRive;
  canvas: CampaignCanvas;
  assets: { id: string }[];
  triggers: CampaignTriggerRule[];
  targeting: CampaignTargeting;
  caps: CampaignCaps;
  startAt: string | null;
  endAt: string | null;
};

export type ReviewProduct = {
  ref: string;
  label: string;
  kind: OfferProductKind;
  stores: OfferStore[];
  missing: boolean;
};

const STORE_NAMES: Partial<Record<OfferStore, string>> = {
  app_store: 'iOS',
  play_store: 'Android',
  paddle: 'the web',
};

const elementName = (element: CampaignElement) =>
  element.label || ELEMENT_LABELS[element.type];

/** Whether an action has everything it needs to actually do something. */
export function actionIsComplete(
  action: CtaAction,
  config: {
    path?: string;
    packId?: string;
    productId?: string;
    reward?: { grants: { kind: string; id?: string; amount: number }[] };
  },
): boolean {
  switch (CTA_ACTION_NEEDS[action]) {
    case 'path':
      return !!config.path?.trim();
    case 'product':
      return !!config.productId?.trim();
    case 'reward':
      return (config.reward?.grants.length ?? 0) > 0;
    // A pack is optional for `open_fly_shop` (it just skips the highlight) but
    // required for `buy_pack`, which has nothing to charge for without one.
    case 'pack':
      return action === 'buy_pack' ? !!config.packId?.trim() : true;
    default:
      return true;
  }
}

/** Everything worth saying out loud before a campaign goes live. */
export function reviewCampaign(
  campaign: ReviewableCampaign,
  context: { products?: ReviewProduct[] } = {},
): ReviewNote[] {
  const notes: ReviewNote[] = [];
  const add = (level: ReviewLevel, message: string, elementId?: string) =>
    notes.push({ level, message, elementId });

  const isCanvas = campaign.template === 'canvas';
  const elements = campaign.canvas.elements;

  if (!campaign.name.trim()) add('error', 'The campaign has no name.');
  if (!campaign.triggers.length) {
    add('error', 'No trigger — there is no moment where this can ever show.');
  }

  const duplicateTriggers = campaign.triggers
    .map((rule) => rule.event)
    .filter((event, index, all) => all.indexOf(event) !== index);
  if (duplicateTriggers.length) {
    add('warning', `"${duplicateTriggers[0]}" is listed twice — the extra copy does nothing.`);
  }

  if (isCanvas) {
    if (!elements.length) {
      add(
        'error',
        campaign.imageUrl
          ? 'Nothing is placed on the artwork — not even a button.'
          : 'No artwork and nothing placed, so there is nothing to show.',
      );
    } else if (!campaign.imageUrl) {
      add(
        'tip',
        'No background artwork, so it sits on a plain card that follows light and dark mode — check white text in both.',
      );
    }

    const closers = elements.filter(
      (element) => isClickableElement(element.type) && element.action === 'dismiss',
    );
    if (!closers.length) {
      add(
        'warning',
        'No way out except the dark background. Give people a close button they can see.',
      );
    }

    for (const element of elements) {
      const label = elementName(element);

      if (isClickableElement(element.type)) {
        if (!actionIsComplete(element.action ?? 'dismiss', element)) {
          add('error', `"${label}" has an action that is missing its setting.`, element.id);
        }
        if (element.w < 8 || element.h < 5) {
          add(
            'warning',
            `"${label}" is smaller than a fingertip — hard to hit and easy to miss.`,
            element.id,
          );
        }
      }

      if (element.type === 'image' && !element.assetId) {
        add('error', `"${label}" has no image picked.`, element.id);
      }

      if (element.type === 'rive' && !element.assetId && !element.libraryPath) {
        add('error', `"${label}" has no animation picked.`, element.id);
      }

      if (element.type === 'timer') {
        if (element.timerMode === 'schedule' && !campaign.endAt) {
          add(
            'error',
            `"${label}" counts down to the end date, but no end date is set.`,
            element.id,
          );
        }
        if (!element.text?.includes('{time}')) {
          add('warning', `"${label}" has no {time} in its text, so no clock shows.`, element.id);
        }
        if (element.timerMode === 'per_user') {
          add(
            'tip',
            `"${label}" is a personal countdown, and it is kept: once it runs out for someone, this popup never shows to them again.`,
            element.id,
          );
        }
      }

      if (
        element.type !== 'close' &&
        isClickableElement(element.type) &&
        !element.text?.trim() &&
        !element.background
      ) {
        add(
          'tip',
          `"${label}" has no label and no fill — make sure the artwork underneath reads as a button.`,
          element.id,
        );
      }

      const opacity = element.opacity ?? 100;
      if (opacity === 0 && isClickableElement(element.type)) {
        add('tip', `"${label}" is fully transparent — an invisible tap target.`, element.id);
      }
    }

    const overlappingBuyButtons = elements.filter(
      (element) =>
        isClickableElement(element.type) &&
        PURCHASING_ACTIONS.includes(element.action ?? 'dismiss'),
    );
    for (const buy of overlappingBuyButtons) {
      const closeNearby = elements.find(
        (other) =>
          other.id !== buy.id &&
          other.action === 'dismiss' &&
          Math.abs(other.x - buy.x) < 6 &&
          Math.abs(other.y - buy.y) < 6,
      );
      if (closeNearby) {
        add(
          'warning',
          `"${elementName(buy)}" charges money and sits on top of a close button — a mis-tap becomes a purchase.`,
          buy.id,
        );
      }
    }
  } else {
    if (!campaign.copy.headline.trim()) add('error', 'The banner has no headline.');
    if (!campaign.copy.ctaLabel.trim()) add('warning', 'The banner button has no label.');
    if (!actionIsComplete(campaign.cta.action, campaign.cta)) {
      add('error', 'The banner button has an action that is missing its setting.');
    }
  }

  for (const button of campaign.rive.buttons) {
    if (!button.signal.trim()) {
      add('error', 'A Rive button has no signal name, so nothing can ever fire it.');
      continue;
    }
    const inherits = button.action === 'cta';
    const action = button.action === 'cta' ? campaign.cta.action : button.action;
    const resolved = {
      path: inherits ? campaign.cta.path : button.path || campaign.cta.path,
      packId: inherits ? campaign.offer.packId : button.packId || campaign.offer.packId,
      productId: inherits
        ? campaign.cta.productId || campaign.offer.productId
        : button.productId || campaign.offer.productId,
      reward: inherits ? campaign.cta.reward : button.reward,
    };
    if (!actionIsComplete(action, resolved)) {
      add('error', `Rive button "${button.signal}" is missing a setting for what it does.`);
    }
  }

  const duplicateSignals = campaign.rive.buttons
    .map((button) => `${button.source}:${button.signal}`)
    .filter((key, index, all) => all.indexOf(key) !== index);
  if (duplicateSignals.length) {
    add('warning', `Two Rive buttons listen for ${duplicateSignals[0]} — only the first wins.`);
  }

  for (const element of elements) {
    for (const ticker of element.tickers ?? []) {
      if (!ticker.name.trim()) {
        add('error', `"${elementName(element)}" has a repeating trigger with no name.`, element.id);
      }
      if (ticker.everyMs < 250) {
        add(
          'warning',
          `"${ticker.name}" fires more than four times a second — that will burn battery.`,
          element.id,
        );
      }
    }
    for (const input of element.inputs ?? []) {
      if (!input.name.trim()) {
        add('error', `"${elementName(element)}" has an animation value with no name.`, element.id);
      }
    }
  }

  if (campaign.targeting.rollout === 0) {
    add('error', 'Rollout is 0% — nobody is in the audience.');
  }

  const { minDaysSinceSignup: minDays, maxDaysSinceSignup: maxDays } = campaign.targeting;
  if (minDays != null && maxDays != null && minDays > maxDays) {
    add('error', `Account age ${minDays}–${maxDays} days is an impossible range.`);
  }
  const { balanceAbove: above, balanceBelow: below } = campaign.targeting;
  if (above != null && below != null && above >= below) {
    add('error', `Flies above ${above} and below ${below} can never both be true.`);
  }

  if (campaign.caps.perUser === 0 && campaign.caps.cooldownHours === 0) {
    add('warning', 'No impression cap and no cooldown — this can repeat without end.');
  }
  if (campaign.caps.delayMs > 5000) {
    add('warning', 'A delay over 5s usually lands after the user has moved on.');
  }

  if (campaign.startAt && campaign.endAt) {
    if (new Date(campaign.startAt) >= new Date(campaign.endAt)) {
      add('error', 'The schedule ends before it starts.');
    }
  }
  if (campaign.endAt && new Date(campaign.endAt) < new Date()) {
    add('warning', 'The schedule has already ended, so this will not show.');
  }

  const hasPurchase =
    elements.some(
      (element) => element.action && PURCHASING_ACTIONS.includes(element.action),
    ) || PURCHASING_ACTIONS.includes(campaign.cta.action);
  if (hasPurchase && campaign.targeting.platform === 'any') {
    add(
      'tip',
      'This charges money on every platform. Store rules and prices differ — consider splitting web and native.',
    );
  }

  reviewPrices(campaign, context.products, add);

  const rewardButtons = elements.filter((element) => element.action === 'claim_reward');
  if (rewardButtons.length > 1) {
    add(
      'tip',
      'More than one reward button on one popup — each is capped separately, which is rarely what is meant.',
    );
  }

  return notes;
}

function reviewPrices(
  campaign: ReviewableCampaign,
  products: ReviewProduct[] | undefined,
  add: (level: ReviewLevel, message: string, elementId?: string) => void,
) {
  const isCanvas = campaign.template === 'canvas';
  const copy = campaign.copy as Record<string, string>;
  const texts: { text: string; elementId?: string }[] = isCanvas
    ? campaign.canvas.elements.map((element) => ({ text: element.text ?? '', elementId: element.id }))
    : ['eyebrow', 'headline', 'body', 'ctaLabel'].map((key) => ({ text: copy[key] ?? '' }));

  for (const { text, elementId } of texts) {
    if (HARDCODED_PRICE.test(text)) {
      add(
        'warning',
        `"${text.slice(0, 32)}" types a price by hand. Use {price} — the store charges in each person's own currency, and a price the checkout contradicts is a false price.`,
        elementId,
      );
    }
  }

  const priced = pricedTexts({ ...campaign, copy: campaign.copy as Record<string, string> });
  if (priced.some((entry) => !entry.priceRef)) {
    add(
      'error',
      'Some text quotes {price}, but nothing on this popup sells anything — pick the offer under Design → Offer & prices.',
    );
  }
  const compares = priced.filter((entry) => usesCompareTokens(entry.text));
  if (compares.length && !campaign.offer.compareRef) {
    const product = products?.find((item) => item.ref === compares[0].priceRef);
    if (product?.kind !== 'subscription') {
      add(
        'warning',
        '{was_price} and {save} need something to compare with. Set "Compare against", or the popup will not show at all.',
      );
    } else {
      add(
        'tip',
        '{was_price} and {save} use the subscription’s regular price, so they only fill in for people its introductory offer reaches — everyone else simply won’t see this popup.',
      );
    }
  }

  if (!products) return;
  const { charged } = campaignProductRefs(campaign);
  const platform = campaign.targeting.platform;
  const needed: OfferStore[] =
    platform === 'web'
      ? ['paddle']
      : platform === 'native'
        ? ['app_store', 'play_store']
        : ['app_store', 'play_store', 'paddle'];

  for (const ref of charged) {
    const product = products.find((item) => item.ref === ref);
    if (!product) continue;
    if (product.missing) {
      add('error', `"${product.label}" no longer exists in RevenueCat, so its button can't charge.`);
      continue;
    }
    const absent = product.stores.length
      ? needed.filter((store) => !product.stores.includes(store))
      : [];
    if (absent.length) {
      add(
        'warning',
        `"${product.label}" isn't sold on ${absent.map((store) => STORE_NAMES[store]).join(' or ')} yet — people there won't see this popup. Add the product to its RevenueCat package, or narrow the platform.`,
      );
    }
    if (product.kind === 'subscription' && campaign.targeting.plus !== 'not_plus') {
      add(
        'warning',
        `"${product.label}" sells Plus. Set Audience → Plus to "Not Plus", or people who already pay will be asked to pay again.`,
      );
    }
  }
}

export const countByLevel = (notes: ReviewNote[], level: ReviewLevel) =>
  notes.filter((note) => note.level === level).length;

export const blocksGoingLive = (notes: ReviewNote[]) => countByLevel(notes, 'error') > 0;
