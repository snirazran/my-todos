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
