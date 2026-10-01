export type RotationInterval = 'disabled' | '1m' | '5m' | '10m' | '1h' | '1d';

export const ROTATION_INTERVAL_MS: Record<RotationInterval, number> = {
  disabled: 0,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export function isRotationInterval(value: unknown): value is RotationInterval {
  return (
    value === 'disabled' ||
    value === '1m' ||
    value === '5m' ||
    value === '10m' ||
    value === '1h' ||
    value === '1d'
  );
}

export type ShuffleLock = 'skin' | 'hat' | 'body' | 'hand_item' | 'background';

export const SHUFFLE_LOCKS: ShuffleLock[] = [
  'skin',
  'hat',
  'body',
  'hand_item',
  'background',
];

export function isShuffleLock(value: unknown): value is ShuffleLock {
  return SHUFFLE_LOCKS.includes(value as ShuffleLock);
}

export type ShuffleSource = 'wardrobe' | 'looks';

export function isShuffleSource(value: unknown): value is ShuffleSource {
  return value === 'wardrobe' || value === 'looks';
}

export function isLocalDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
