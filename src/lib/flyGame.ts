export const FLY_GAME_DURATION_MS = 30_000;
export const FLY_GAME_MAX_REWARD = 150;
export const FLY_GAME_STORAGE_KEY = 'frogress.fly-game.v1';

export type FlyGameKind = 'normal' | 'gold' | 'time' | 'trap';

export type FlyGameStats = {
  score: number;
  catches: number;
  misses: number;
  goldHits: number;
  timeHits: number;
  trapHits: number;
  maxCombo: number;
  durationMs: number;
};

export type FlyGameEvent = {
  t: number;
  action: 'hit' | 'miss';
  slot?: number;
  kind?: FlyGameKind;
};

export function seededFlyGameRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function selectFlyGameKind(roll: number, elapsed: number): FlyGameKind {
  const trapChance = elapsed > 5_000 ? Math.min(0.18, 0.08 + elapsed / 300_000) : 0;
  if (roll < trapChance) return 'trap';
  if (roll < trapChance + 0.12) return 'gold';
  if (roll < trapChance + 0.18) return 'time';
  return 'normal';
}

export function calculateFlyGameScore(stats: Omit<FlyGameStats, 'score' | 'durationMs' | 'maxCombo'>) {
  const regularHits = stats.catches - stats.goldHits - stats.timeHits;
  return Math.max(
    0,
    regularHits + stats.goldHits * 3 + stats.timeHits - stats.misses - stats.trapHits * 4,
  );
}

export function sanitizeFlyGameName(value: unknown) {
  if (typeof value !== 'string') return 'Tiny Frog';
  const clean = value.replace(/[<>\n\r\t]/g, '').replace(/\s+/g, ' ').trim().slice(0, 22);
  return clean || 'Tiny Frog';
}

export function flyGameReward(score: number) {
  return Math.min(FLY_GAME_MAX_REWARD, Math.max(0, Math.floor(score)));
}
