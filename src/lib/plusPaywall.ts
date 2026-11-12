import type { IconName } from '@/components/ui/Icon';
import { SAVED_LOOKS_FREE, SAVED_LOOKS_PLUS } from '@/lib/skins/looks';
import { FREE_TAG_LIMIT, PREMIUM_TAG_LIMIT } from '@/lib/tags/limits';
import { DEFAULT_SHOP_SALES } from '@/lib/skins/shopSales';

export type PlusBenefit = { icon: IconName; title: string; body: string };
export type PlusPerk = { label: string; free: string; plus: string };
export type PaywallContext = {
  headline: string;
  accent: string;
  sub: string;
  benefits: PlusBenefit[];
  perks: PlusPerk[];
};

export const TRIAL_REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;

export const ONBOARDING_PLUS_OFFERING = 'onboarding_welcome';

export function trialReminderPush(when: string, renewDate: string) {
  return {
    title: `Your free trial ends ${when}`,
    body: `As promised, a heads-up: Plus renews on ${renewDate}. Staying? Do nothing. Leaving? Cancel before then in Settings → Frogress Plus.`,
  };
}

export function skipAdsPlacement(placement: string): string {
  return `skip_ads_${placement}`;
}

export function afterAdPlacement(placement: string): string {
  return `after_ad_${placement}`;
}

const COACH: PlusBenefit = {
  icon: 'patterns',
  title: 'Know what keeps you going',
  body: 'A weekly coach read, with one thing to try.',
};
const SUPPORT: PlusBenefit = {
  icon: 'community',
  title: 'Support a small indie team',
  body: 'Help us keep making Frogress better.',
};

const SHOP_TOTAL = DEFAULT_SHOP_SALES.freeSlots + DEFAULT_SHOP_SALES.plusSlots;
export const INCLUDED = 'Included';
export const NOT_INCLUDED = '—';

export const PLUS_PERKS = {
  flies: { label: 'Flies from quests', free: '1×', plus: '2×' },
  gifts: { label: 'Prizes in every gift', free: '1', plus: '2' },
  special: {
    label: 'Special items a day',
    free: String(DEFAULT_SHOP_SALES.freeSlots),
    plus: String(SHOP_TOTAL),
  },
  sale: {
    label: `Daily ${DEFAULT_SHOP_SALES.saleDiscountPercent}% off pick`,
    free: NOT_INCLUDED,
    plus: INCLUDED,
  },
  season: { label: 'Season Plus rewards', free: NOT_INCLUDED, plus: INCLUDED },
  lilyPad: { label: 'Free Lily Pads a month', free: NOT_INCLUDED, plus: '1' },
  league: { label: 'Weekly league gifts', free: '1', plus: '2' },
  coach: { label: 'Weekly coach read', free: NOT_INCLUDED, plus: INCLUDED },
  looks: {
    label: 'Saved looks',
    free: String(SAVED_LOOKS_FREE),
    plus: String(SAVED_LOOKS_PLUS),
  },
  wishlist: { label: 'Wishlist slots', free: '4', plus: '10' },
  tags: {
    label: 'Tags for your tasks',
    free: String(FREE_TAG_LIMIT),
    plus: String(PREMIUM_TAG_LIMIT),
  },
  tradeReroll: { label: 'Trade rerolls', free: 'Ad', plus: 'Free' },
  shopRefresh: {
    label: 'Shop refreshes a day',
    free: `${DEFAULT_SHOP_SALES.adRerolls} ad`,
    plus: String(DEFAULT_SHOP_SALES.plusRefreshes),
  },
} satisfies Record<string, PlusPerk>;

type PerkId = keyof typeof PLUS_PERKS;
const CORE: PerkId[] = ['flies', 'gifts', 'special', 'season'];

function perksLed(...lead: PerkId[]): PlusPerk[] {
  const ids = [...lead, ...CORE.filter((id) => lead.indexOf(id) < 0)].slice(0, 4);
  return ids.map((id) => PLUS_PERKS[id]);
}

export function getPlusContext(placement: string, frogName?: string): PaywallContext {
  const base = placement.replace(/^(skip_ads|after_ad)_/, '');
  if (base !== placement) return getPlusContext(base, frogName);
  const name = frogName?.trim() || 'your frog';
  const context: PaywallContext = {
    headline: 'You do the work.',
    accent: 'Get twice the rewards.',
    sub: `Double flies from quests, two prizes in every gift and every Special outfit for ${name}.`,
    benefits: [],
    perks: perksLed(),
  };
  if (placement === 'onboarding') return {
    ...context,
    benefits: [COACH, { icon: 'x2', title: 'Twice the reward for your effort', body: 'Double flies from quests, two prizes per gift.' }, SUPPORT],
  };
  if (placement === 'plus_preview_ended') return {
    ...context,
    headline: 'Your 3 days are up.',
    accent: `Keep Plus for ${name}?`,
    sub: 'Nothing was charged. Join to keep earning double.',
  };
  if (placement.startsWith('plus_preview')) return {
    ...context,
    headline: 'Enjoying Plus?',
    accent: 'Keep it after your preview.',
    sub: 'Your preview ends by itself. Join to keep earning double.',
  };
  if (placement === 'plus_trial_ended') return {
    ...context,
    headline: 'You kept showing up.',
    accent: 'Get double for it again.',
  };
  if (placement === 'first_gift') return {
    ...context,
    headline: 'Loved that gift?',
    accent: 'Get two prizes every time.',
    sub: `Two prizes in every gift, double flies and every Special outfit for ${name}.`,
    perks: perksLed('gifts'),
  };
  if (placement === 'wardrobe_looks') return {
    ...context,
    headline: 'A look for every mood.',
    accent: 'Keep your favorites.',
    sub: 'More room for the outfits you’ve made your own.',
    perks: perksLed('looks', 'special'),
  };
  if (placement === 'season_plus_track') return {
    ...context,
    headline: 'Same progress.',
    accent: 'Twice the rewards.',
    sub: 'Add the Plus track and collect a second reward at every tier you reach.',
    perks: perksLed('season'),
  };
  if (placement === 'leap_leagues') return {
    ...context,
    headline: 'Same habits.',
    accent: 'Two gifts a week.',
    sub: 'You already keep your habits. Open a second gift every week you hit your goal.',
    perks: perksLed('league', 'flies', 'lilyPad'),
  };
  if (placement === 'streak_rescue' || placement === 'shield_offer') return {
    ...context,
    headline: 'Life happens.',
    accent: 'Your streak can stay.',
    sub: 'A free Lily Pad every month covers a day off, so one rough day never costs your streak.',
    perks: perksLed('lilyPad'),
  };
  if (placement === 'trade_reroll' || placement === 'shop_reroll') return {
    ...context,
    headline: 'Not quite your style?',
    accent: 'Try something new.',
    sub: placement === 'trade_reroll' ? 'Another chance to find a trade reward you love.' : 'Refresh today’s picks and find your next look.',
    perks: placement === 'trade_reroll' ? perksLed('tradeReroll') : perksLed('shopRefresh', 'special', 'sale'),
  };
  if (placement === 'shop_plus_slot' || placement === 'shop_plus_sale') return {
    ...context,
    headline: placement === 'shop_plus_sale' ? `${DEFAULT_SHOP_SALES.saleDiscountPercent}% off, every day.` : 'Love that look?',
    accent: placement === 'shop_plus_sale' ? 'Only with Plus.' : 'Unlock every Special slot.',
    sub: `All ${SHOP_TOTAL} Special items and a daily sale for ${name}.`,
    perks: placement === 'shop_plus_sale' ? perksLed('sale', 'special') : perksLed('special', 'sale'),
  };
  if (placement.includes('tag_limit')) return {
    ...context,
    headline: 'Room for all your plans.',
    accent: `Up to ${PREMIUM_TAG_LIMIT} tags.`,
    sub: 'Keep your tasks organized as your routine grows.',
    perks: perksLed('tags', 'flies', 'gifts', 'coach'),
  };
  if (placement.includes('wishlist')) return {
    ...context,
    headline: 'So many looks to love.',
    accent: 'Make room for more.',
    sub: 'Keep your next outfit goals close as you get things done.',
    perks: perksLed('wishlist', 'special'),
  };
  if (placement === 'insights_weekly') return {
    ...context,
    headline: 'Know what keeps you going.',
    accent: 'A coach read every week.',
    sub: 'One clear read of your own week, with one thing to try next.',
    perks: perksLed('coach'),
  };
  return context;
}

export type TrialPeriod = { unit: 'D' | 'W' | 'M' | 'Y'; count: number };

/** Store periods are calendar units; never turn a month into a made-up day count. */
export function parseTrialPeriod(period: string | null | undefined, cycles = 1): TrialPeriod | null {
  const match = period?.match(/^P(\d+)([DWMY])$/);
  if (!match || !Number.isFinite(cycles) || cycles < 1) return null;
  const count = Number(match[1]) * cycles;
  if (!count) return null;
  return { unit: match[2] as TrialPeriod['unit'], count };
}

export function formatTrialPeriod(trial: TrialPeriod | null): string | null {
  if (!trial) return null;
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[trial.unit];
  return `${trial.count} ${unit}${trial.count === 1 ? '' : 's'}`;
}

export function trialDays(trial: TrialPeriod | null | undefined): number | null {
  if (!trial) return null;
  if (trial.unit === 'D') return trial.count;
  if (trial.unit === 'W') return trial.count * 7;
  return null;
}

export function trialEndsAt(trial: TrialPeriod, from: Date): Date {
  const end = new Date(from);
  if (trial.unit === 'D') end.setDate(end.getDate() + trial.count);
  else if (trial.unit === 'W') end.setDate(end.getDate() + trial.count * 7);
  else if (trial.unit === 'M') end.setMonth(end.getMonth() + trial.count);
  else end.setFullYear(end.getFullYear() + trial.count);
  return end;
}
