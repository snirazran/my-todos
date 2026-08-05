import type { FrogIndices } from '@/lib/friends/indices';
import type { Rarity } from '@/lib/skins/catalog';

export const LOOK_REACTIONS = ['fire', 'heart', 'star', 'laugh'] as const;
export type LookReactionKind = (typeof LOOK_REACTIONS)[number];

export const REACTION_EMOJI: Record<LookReactionKind, string> = {
  fire: '🔥',
  heart: '💚',
  star: '⭐',
  laugh: '😂',
};

export const LOOK_SLOTS = ['skin', 'hat', 'body', 'hand_item'] as const;
export type LookSlot = (typeof LOOK_SLOTS)[number];

export const LOOK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type LookItem = { id: string; name: string; rarity: Rarity };

/** A whole outfit as it stood when someone reacted — never a single item. */
export type LookSnapshot = {
  key: string;
  indices: FrogIndices;
  items: LookItem[];
};

export type ReceivedReaction = {
  id: string;
  fromUserId: string;
  fromName: string;
  kind: LookReactionKind;
  look: LookSnapshot | null;
  isCurrentLook: boolean;
  seen: boolean;
  createdAt: string;
};

export function lookKeyOf(
  equipped: Partial<Record<string, string | null>> | undefined,
): string {
  return LOOK_SLOTS.map((slot) => `${slot}:${equipped?.[slot] ?? ''}`).join('|');
}

export function describeLook(items: LookItem[]): string {
  if (!items.length) return 'Bare frog, full confidence';
  return items.map((i) => i.name).join(' · ');
}

export function summarizeNames(names: string[]): string {
  if (names.length === 0) return 'Someone';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

export function shortTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}
