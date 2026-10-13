import type { FrogIndices } from './indices';

export const ROOM_DURATIONS = [15, 25, 45] as const;
export const ROOM_CAPACITY = 8;
export const SHARED_FOCUS_MIN_SECONDS = 300;

/** A new gift selection replaces the whole look, including empty slots. */
export function giftPreviewIndices(item?: { slot: string; riveIndex: number } | null): FrogIndices {
  const indices: FrogIndices = { skin: 0, hat: 0, body: 0, hand_item: 0 };
  if (item && (item.slot === 'skin' || item.slot === 'hat' || item.slot === 'body' || item.slot === 'hand_item')) indices[item.slot] = item.riveIndex;
  return indices;
}

export const KEEPSAKES = [
  { id: 'first-duo', name: 'First little win', emoji: '🌱', description: 'Complete your first habit together.', required: 1, kind: 'habits' },
  { id: 'seven-together', name: 'Better together', emoji: '🍀', description: 'Complete 7 habits with the same buddy.', required: 7, kind: 'habits' },
  { id: 'thirty-together', name: 'Pond legends', emoji: '🌟', description: 'Complete 30 habits with the same buddy.', required: 30, kind: 'habits' },
  { id: 'quiet-company', name: 'Quiet company', emoji: '🎧', description: 'Focus in a room with a friend for at least 5 minutes.', required: 1, kind: 'focus' },
] as const;

export type KeepsakeId = (typeof KEEPSAKES)[number]['id'] | `pond-party-${string}`;
export type Keepsake = {
  id: KeepsakeId;
  name: string;
  emoji: string;
  description: string;
  earnedAt: string | null;
  partnerName?: string;
  progress: number;
  required: number;
};

const PARTY_EMOJI = ['❄️', '💌', '🌷', '🌦️', '🌼', '☀️', '🐚', '🍉', '🍂', '🎃', '🍄', '🎁'];

export function partyKeepsake(monthKey: string): Omit<Keepsake, 'earnedAt'> {
  const [year, month] = monthKey.split('-').map(Number);
  const valid = Number.isInteger(year) && month >= 1 && month <= 12;
  const name = valid
    ? new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
    : 'Monthly';
  return {
    id: `pond-party-${monthKey}`,
    name: `${name} pond party`,
    emoji: PARTY_EMOJI[valid ? month - 1 : 0],
    description: 'Show up together on 3 different days this month. Keep a little memory of being here.',
    progress: 0,
    required: 3,
  };
}

export function keepsakeEmoji(id?: string | null): string | null {
  if (!id) return null;
  const known = KEEPSAKES.find((item) => item.id === id);
  if (known) return known.emoji;
  return /^pond-party-\d{4}-\d{2}$/.test(id) ? partyKeepsake(id.slice(11)).emoji : null;
}

export type PondHabit = {
  bondId: string;
  taskId: string | null;
  text: string;
  partnerId: string;
  partnerName: string;
  partnerIndices: FrogIndices;
  schedule: string;
  dueToday: boolean;
  mineDone: boolean;
  partnerDone: boolean;
  togetherCount: number;
  streak: number;
  weekProgress: number;
};

export type PondRoomMember = {
  userId: string;
  name: string;
  indices: FrogIndices;
  focusing: boolean;
  isYou: boolean;
};

export type PondRoom = {
  id: string;
  hostId: string;
  hostName: string;
  duration: number;
  endsAt: string;
  joined: boolean;
  members: PondRoomMember[];
};

export type PondData = {
  today: string;
  serverNow: number;
  habits: PondHabit[];
  completedToday?: number;
  rooms: PondRoom[];
  keepsakes: Keepsake[];
  pinnedKeepsakeId: KeepsakeId | null;
  weekReward: { required: number; giftName: string; giftRiveIndex?: number; progress?: number; enabled: boolean; earned: boolean };
};

/** A bond can contain duplicate completion dates; rewards count shared occurrences once. */
export function sharedOccurrences(from: readonly string[], to: readonly string[]): string[] {
  const other = new Set(to);
  return Array.from(new Set(from)).filter((date) => other.has(date)).sort();
}

export function sharedFocusOverlapSeconds(
  member: { joinedAt: Date | string; leftAt?: Date | string | null },
  other: { joinedAt: Date | string; leftAt?: Date | string | null },
  endsAt: Date | string,
): number {
  const end = new Date(endsAt).getTime();
  const start = Math.max(new Date(member.joinedAt).getTime(), new Date(other.joinedAt).getTime());
  const finish = Math.min(end, member.leftAt ? new Date(member.leftAt).getTime() : end, other.leftAt ? new Date(other.leftAt).getTime() : end);
  return Number.isFinite(start) && Number.isFinite(finish) ? Math.max(0, Math.floor((finish - start) / 1000)) : 0;
}
