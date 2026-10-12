import type { IconName } from '@/components/ui/Icon';
import { SAVED_LOOKS_PLUS } from '@/lib/skins/looks';
import { PREMIUM_TAG_LIMIT } from '@/lib/tags/limits';

export type PlusBenefit = { icon: IconName; title: string; body: string };
export type PaywallContext = {
  headline: string;
  accent: string;
  sub: string;
  benefits: PlusBenefit[];
  proof?: { label: string; free: string; plus: string; caption: string };
};

const REWARDS: PlusBenefit = {
  icon: 'x2',
  title: 'Get to your next look sooner',
  body: 'Earn 2× flies from daily quests to spend on outfits.',
};
const GIFTS: PlusBenefit = {
  icon: 'store',
  title: 'Find more in every gift',
  body: 'Get two prizes instead of one.',
};
const STREAK: PlusBenefit = {
  icon: 'lilyPad',
  title: 'Miss a day. Keep your progress.',
  body: 'Habits take practice. A free monthly Lily Pad protects your streak when you miss a day.',
};

export function getPlusContext(placement: string, frogName?: string): PaywallContext {
  const name = frogName?.trim() || 'your frog';
  const context: PaywallContext = {
    headline: 'Make getting things done',
    accent: 'more rewarding.',
    sub: `Grow ${name === 'your frog' ? 'your frog’s' : `${name}’s`} wardrobe as you build your routine.`,
    benefits: [REWARDS, GIFTS, STREAK],
  };
  if (placement === 'wardrobe_looks') return {
    ...context,
    headline: 'A look for every mood.',
    accent: 'Keep your favorites.',
    sub: 'More room for the outfits you’ve made your own.',
    benefits: [{ icon: 'saved', title: `Save up to ${SAVED_LOOKS_PLUS} favorite looks`, body: 'Keep your outfits ready. Switch with a tap.' }, REWARDS, GIFTS],
    proof: { label: 'Favorite outfits saved', free: '3', plus: String(SAVED_LOOKS_PLUS), caption: 'A look for every mood' },
  };
  if (placement === 'gift_double') return {
    ...context,
    headline: 'A little more surprise.',
    accent: 'In every gift.',
    sub: 'Open a second prize from this gift—and every gift after it.',
    benefits: [GIFTS, REWARDS, STREAK],
    proof: { label: 'Open a gift', free: '1', plus: '2', caption: 'Prizes in every gift box' },
  };
  if (placement === 'season_plus_track') return {
    ...context,
    headline: 'Same progress.',
    accent: 'More to collect.',
    sub: 'Add the Plus reward track to your season. Every tier you reach has more to discover.',
    benefits: [
      { icon: 'quests', title: 'Unlock the Plus reward track', body: 'Claim Plus rewards at tiers you’ve already reached. Earn future tiers by completing tasks.' },
      REWARDS,
      GIFTS,
    ],
    proof: { label: 'Reach a season tier', free: '1', plus: '2', caption: 'Reward tracks: Free + Plus' },
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
    benefits: [{ icon: 'shuffle', title: placement === 'trade_reroll' ? 'Reroll trade rewards for free' : 'Refresh shop deals without ads', body: placement === 'trade_reroll' ? 'Not feeling the prize? Try another.' : 'Use your daily rerolls with no ad break.' }, REWARDS, GIFTS],
  };
  if (placement.includes('tag_limit')) return {
    ...context,
    headline: 'Room for all your plans.',
    accent: 'And all your interests.',
    sub: 'Keep your tasks organized as your routine grows.',
    benefits: [{ icon: 'planner', title: `Organize with up to ${PREMIUM_TAG_LIMIT} tags`, body: 'Give every project and part of your life its place.' }, REWARDS, STREAK],
  };
  if (placement.includes('wishlist')) return {
    ...context,
    headline: 'So many looks to love.',
    accent: 'Make room for more.',
    sub: 'Keep your next outfit goals close as you get things done.',
    benefits: [{ icon: 'wardrobe', title: 'Keep 10 items on your wishlist', body: 'More space for the pieces you’re collecting.' }, REWARDS, GIFTS],
  };
  if (placement === 'fly_shop_free_flies' || placement === 'premium_daily_deal' || placement.endsWith('_double')) return {
    ...context,
    headline: 'Your next look is calling.',
    accent: 'Make more of each quest.',
    sub: 'Earn double the flies from daily quests toward outfits you love.',
  };
  return context;
}

/** Store periods are calendar units; never turn a month into a made-up day count. */
export function formatTrialDuration(period: string | null | undefined, cycles = 1): string | null {
  const match = period?.match(/^P(\d+)([DWMY])$/);
  if (!match || !Number.isFinite(cycles) || cycles < 1) return null;
  const count = Number(match[1]) * cycles;
  if (!count) return null;
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[match[2]];
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
