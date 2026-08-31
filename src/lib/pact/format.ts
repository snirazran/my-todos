import type { QuestReward } from '@/lib/quests/types';
import type { ActivePactView, PactBonusReward } from './types';

/**
 * What the week will actually hand over, as tiles. While every session is
 * still reachable — moving one to a free day included — that is the whole
 * prize; once it is not, the completion gift and the rest of the flies are
 * gone no matter what happens next, and a tile still advertising them is the
 * card lying about the only number on it.
 */
export function pactWeekRewardTiles(active: ActivePactView): QuestReward[] {
  if (active.canStillFinish || active.canFinishWithMoves) {
    return [
      { type: 'FLIES', amount: active.rewardFlies },
      ...active.completionRewards,
    ];
  }
  return [{ type: 'FLIES', amount: active.payoutFlies }];
}

/**
 * The rate as a chip: `×2` while it is whole, `×1.25` once it is not. Trailing
 * zeroes are dropped because a rate that reads `×1.50` invites the reader to
 * look for the precision it is implying, and there is none.
 */
export function formatPactRate(multiplier: number) {
  const rounded = Math.round(multiplier * 100) / 100;
  return `×${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, '')}`;
}

/** Plain words beat symbols in a sentence; symbols beat words on a chip. */
export function pactRateWord(multiplier: number) {
  const rounded = Math.round(multiplier * 100) / 100;
  if (rounded <= 1) return 'normal';
  if (rounded === 2) return 'double';
  if (rounded === 3) return 'triple';
  return `${formatPactRate(rounded)}`;
}

/**
 * Milestone lanes carry two entries the reward tiles cannot draw — a Lily Pad
 * and a guaranteed-rarity draw. They are named in words beside the tiles rather
 * than dropped, because "a guaranteed epic" is the half of a milestone worth
 * climbing three weeks for.
 */
export function pactBonusLabel(reward: PactBonusReward): string | null {
  if (reward.type === 'SHIELD') {
    const amount = Math.max(1, Math.floor(reward.amount ?? 1));
    return `${amount} Lily Pad${amount === 1 ? '' : 's'}`;
  }
  if (reward.type === 'RARITY_ITEM') {
    const amount = Math.max(1, Math.floor(reward.amount ?? 1));
    const rarity = reward.rarity;
    const article = rarity === 'epic' || rarity === 'uncommon' ? 'an' : 'a';
    return amount === 1
      ? `${article} guaranteed ${rarity}`
      : `${amount} guaranteed ${rarity}s`;
  }
  return null;
}

/** Only the entries a reward tile can actually render. */
export function pactTileRewards(rewards: PactBonusReward[]) {
  return rewards.filter(
    (reward) => reward.type !== 'SHIELD' && reward.type !== 'RARITY_ITEM',
  ) as Exclude<PactBonusReward, { type: 'SHIELD' } | { type: 'RARITY_ITEM' }>[];
}
