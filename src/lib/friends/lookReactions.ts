export const LOOK_REACTIONS = ['fire', 'heart', 'star', 'laugh'] as const;
export type LookReactionKind = (typeof LOOK_REACTIONS)[number];

export const REACTION_EMOJI: Record<LookReactionKind, string> = {
  fire: '🔥',
  heart: '💚',
  star: '⭐',
  laugh: '😂',
};

export type ReceivedReaction = {
  id: string;
  fromUserId: string;
  fromName: string;
  kind: LookReactionKind;
  itemId: string | null;
  itemName: string | null;
  seen: boolean;
  createdAt: string;
};
