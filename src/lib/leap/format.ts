import type { QuestReward } from '@/lib/quests/types';
import type { BonusReward } from './types';

export function bonusRewardLabel(reward: BonusReward): string | null {
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

export function tileRewards(rewards: BonusReward[]): QuestReward[] {
  return rewards.filter(
    (reward) => reward.type !== 'SHIELD' && reward.type !== 'RARITY_ITEM',
  ) as QuestReward[];
}

export function leapsWord(count: number) {
  return `${count} Leap${count === 1 ? '' : 's'}`;
}

export function hopsWord(count: number) {
  return `${count} hop${count === 1 ? '' : 's'}`;
}
