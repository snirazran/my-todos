/**
 * Whether a reward's quantity chip carries information worth covering the art
 * for. A fly count always does. "x1" never does, and on a fanned stack of three
 * tiles three of them hide the thing the user is being shown.
 */
export function hasRewardQuantityBadge(reward: {
  type?: string;
  amount?: number;
}): boolean {
  if (reward?.type === 'FLIES') return true;
  return (reward?.amount ?? 1) > 1;
}
