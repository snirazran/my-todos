import type {
  QuestAmountMode,
  QuestReward,
  QuestRewards,
  QuestRewardType,
} from '@/lib/quests/types';

const VALID_AMOUNT_MODES = new Set<QuestAmountMode>(['fixed', 'random']);
const VALID_REWARD_TYPES = new Set<QuestRewardType>([
  'FLIES',
  'ITEM',
  'BOX',
  'BACKGROUND',
]);

function sanitizeReward(input: any): QuestReward | null {
  if (!input || !VALID_REWARD_TYPES.has(input.type)) return null;
  const reward: QuestReward = { type: input.type };

  if (input.type === 'FLIES') {
    const amountMode = VALID_AMOUNT_MODES.has(input.amountMode)
      ? input.amountMode
      : 'fixed';
    reward.amountMode = amountMode;
    if (amountMode === 'fixed') {
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      reward.amount = Math.floor(amount);
    } else {
      const fallbackAmount = Number(input.amount);
      const minAmount = Number.isFinite(Number(input.minAmount))
        ? Number(input.minAmount)
        : 1;
      const maxAmount = Number.isFinite(Number(input.maxAmount))
        ? Number(input.maxAmount)
        : Number.isFinite(fallbackAmount) && fallbackAmount > 0
          ? fallbackAmount
          : NaN;
      if (
        !Number.isFinite(minAmount) ||
        !Number.isFinite(maxAmount) ||
        minAmount <= 0 ||
        maxAmount < minAmount
      ) {
        return null;
      }
      reward.minAmount = Math.floor(minAmount);
      reward.maxAmount = Math.floor(maxAmount);
    }
  }

  if (input.type === 'ITEM' || input.type === 'BOX') {
    if (typeof input.itemId !== 'string' || !input.itemId.trim()) return null;
    reward.itemId = input.itemId.trim();
  }

  if (input.type === 'BACKGROUND') {
    if (typeof input.backgroundId !== 'string' || !input.backgroundId.trim()) return null;
    reward.backgroundId = input.backgroundId.trim();
  }

  return reward;
}

export function sanitizeRewards(input: any): QuestRewards {
  const rewards = Array.isArray(input)
    ? input.map(sanitizeReward).filter(Boolean)
    : [];
  return rewards as QuestReward[];
}

