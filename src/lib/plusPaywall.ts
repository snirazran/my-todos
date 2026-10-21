import type { IconName } from '@/components/ui/Icon';
import { SAVED_LOOKS_PLUS } from '@/lib/skins/looks';
import { PREMIUM_TAG_LIMIT } from '@/lib/tags/limits';

export type PlusBenefit = { icon: IconName; title: string; body: string };
export type PaywallContext = {
  headline: string;
  accent: string;
  sub: string;
  benefits: PlusBenefit[];
};

export const TRIAL_REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;

export type PaywallMoment = 'onboarding' | 'first_gift';

export function paywallMomentFor(uid: string): PaywallMoment {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return hash % 2 === 0 ? 'onboarding' : 'first_gift';
}

export function skipAdsPlacement(placement: string): string {
  return `skip_ads_${placement}`;
}

export function afterAdPlacement(placement: string): string {
  return `after_ad_${placement}`;
}

const COACH: PlusBenefit = {
  icon: 'patterns',
  title: 'A weekly coach for your habits',
  body: 'See what worked, plus one thing to try next.',
};
const DOUBLE: PlusBenefit = {
  icon: 'x2',
  title: 'Double flies and gift prizes',
  body: 'From quests, habits and every gift.',
};
const SUPPORT: PlusBenefit = {
  icon: 'community',
  title: 'Support a small indie team',
  body: 'Help us keep making Frogress better.',
};
const REWARDS: PlusBenefit = {
  icon: 'x2',
  title: '2× flies from daily quests',
  body: 'Get to your next look sooner.',
};
const GIFTS: PlusBenefit = {
  icon: 'store',
  title: '2 prizes in every gift',
  body: 'A bonus surprise every time you open one.',
};
const STREAK: PlusBenefit = {
  icon: 'lilyPad',
  title: 'A free Lily Pad every month',
  body: 'Miss a day, keep your progress.',
};

export function getPlusContext(placement: string, frogName?: string): PaywallContext {
  const base = placement.replace(/^(skip_ads|after_ad)_/, '');
  if (base !== placement) return getPlusContext(base, frogName);
  const name = frogName?.trim() || 'your frog';
  const context: PaywallContext = {
    headline: 'Commit to your goals.',
    accent: 'Get 2× the rewards.',
    sub: `A weekly coach, double rewards and more outfits for ${name}.`,
    benefits: [COACH, DOUBLE, SUPPORT],
  };
  if (placement === 'first_gift') return {
    ...context,
    headline: 'Loved that gift?',
    accent: 'Get two prizes every time.',
    sub: 'Two prizes in every gift, double flies and a weekly coach.',
    benefits: [GIFTS, COACH, SUPPORT],
  };
  if (placement === 'wardrobe_looks') return {
    ...context,
    headline: 'A look for every mood.',
    accent: 'Keep your favorites.',
    sub: 'More room for the outfits you’ve made your own.',
    benefits: [{ icon: 'saved', title: `Save up to ${SAVED_LOOKS_PLUS} favorite looks`, body: 'Switch outfits with a tap.' }, REWARDS, GIFTS],
  };
  if (placement === 'gift_double') return {
    ...context,
    headline: 'A little more surprise.',
    accent: 'In every gift.',
    sub: 'Open a second prize from this gift—and every gift after it.',
    benefits: [GIFTS, REWARDS, STREAK],
  };
  if (placement === 'season_plus_track') return {
    ...context,
    headline: 'Same progress.',
    accent: 'More to collect.',
    sub: 'Add the Plus reward track to your season. Every tier you reach has more to discover.',
    benefits: [
      { icon: 'quests', title: 'The Plus reward track', body: 'Claim it at every tier you’ve already reached.' },
      REWARDS,
      GIFTS,
    ],
  };
  if (placement === 'leap_leagues') return {
    ...context,
    headline: 'Same habits.',
    accent: 'Bigger league prizes.',
    sub: 'Turn every habit into more outfits, faster.',
    benefits: [
      { icon: 'leap', title: 'Bonus prizes in every league', body: 'Extra gifts on unlock and every week.' },
      { icon: 'x2', title: '2× flies from every habit', body: 'Every repeating task pays double.' },
      STREAK,
    ],
  };
  if (placement === 'streak_rescue') return {
    ...context,
    headline: 'Life happens.',
    accent: 'Your streak can stay.',
    sub: 'Rescue your streak today, with a little backup for next month.',
    benefits: [STREAK, REWARDS, GIFTS],
  };
  if (placement === 'trade_reroll' || placement === 'shop_reroll') return {
    ...context,
    headline: 'Not quite your style?',
    accent: 'Try something new.',
    sub: placement === 'trade_reroll' ? 'Another chance to find a trade reward you love.' : 'Refresh today’s deals and find your next look.',
    benefits: [{ icon: 'shuffle', title: placement === 'trade_reroll' ? 'Free trade rerolls' : 'Shop rerolls without ads', body: placement === 'trade_reroll' ? 'Not feeling the prize? Try another.' : 'Fresh deals, no ad break.' }, REWARDS, GIFTS],
  };
  if (placement.includes('tag_limit')) return {
    ...context,
    headline: 'Room for all your plans.',
    accent: 'And all your interests.',
    sub: 'Keep your tasks organized as your routine grows.',
    benefits: [{ icon: 'planner', title: `Up to ${PREMIUM_TAG_LIMIT} tags`, body: 'A place for every project and interest.' }, REWARDS, STREAK],
  };
  if (placement.includes('wishlist')) return {
    ...context,
    headline: 'So many looks to love.',
    accent: 'Make room for more.',
    sub: 'Keep your next outfit goals close as you get things done.',
    benefits: [{ icon: 'wardrobe', title: '10 wishlist slots', body: 'Room for every piece you’re chasing.' }, REWARDS, GIFTS],
  };
  if (placement === 'fly_shop_free_flies' || placement === 'premium_daily_deal' || placement.endsWith('_double')) return {
    ...context,
    headline: 'Double every reward.',
    accent: 'Instantly, every time.',
    sub: 'Plus doubles your quest rewards and gifts for you.',
    benefits: [DOUBLE, COACH, SUPPORT],
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

export function trialEndsAt(trial: TrialPeriod, from: Date): Date {
  const end = new Date(from);
  if (trial.unit === 'D') end.setDate(end.getDate() + trial.count);
  else if (trial.unit === 'W') end.setDate(end.getDate() + trial.count * 7);
  else if (trial.unit === 'M') end.setMonth(end.getMonth() + trial.count);
  else end.setFullYear(end.getFullYear() + trial.count);
  return end;
}
