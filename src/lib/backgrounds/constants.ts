export const DEFAULT_BACKGROUND_ID = 'bg_default';

export const DEFAULT_BACKGROUND_NAME = 'Swamp';

export const BACKGROUND_SIZE_KEYS = [
  'mobile',
  'tablet',
  'web',
  'webLarge',
] as const;

export type BackgroundSize = (typeof BACKGROUND_SIZE_KEYS)[number];

export function backgroundFileUrl(id: string, size: BackgroundSize) {
  return `/api/background-files/${encodeURIComponent(id)}/${size}`;
}

export const DEFAULT_BACKGROUND_IMAGES = {
  mobile: backgroundFileUrl(DEFAULT_BACKGROUND_ID, 'mobile'),
  tablet: backgroundFileUrl(DEFAULT_BACKGROUND_ID, 'tablet'),
  web: backgroundFileUrl(DEFAULT_BACKGROUND_ID, 'web'),
  webLarge: backgroundFileUrl(DEFAULT_BACKGROUND_ID, 'webLarge'),
};

const LEGACY_LOCAL_BACKGROUND = /^\/bg-(mobile|tablet|web|web-large|shop)\.(webp|png|jpg|jpeg)$/;

export function isLegacyLocalBackground(url: unknown): boolean {
  return typeof url === 'string' && LEGACY_LOCAL_BACKGROUND.test(url.trim());
}

export function stripQuery(url: string) {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export type BackgroundAccent = {
  hue: number;
  hslHue: number;
  chroma: number;
  hex: string;
  mode: 'auto' | 'manual';
};

export const DEFAULT_ACCENT: BackgroundAccent = {
  hue: 149.2,
  hslHue: 142,
  chroma: 0.062,
  hex: '#16a249',
  mode: 'auto',
};

export const ACCENT_MIN_CHROMA = 0.035;
export const ACCENT_MAX_CHROMA = 0.115;

export function normalizeAccent(input: unknown): BackgroundAccent | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<BackgroundAccent>;
  if (typeof raw.hue !== 'number' || !Number.isFinite(raw.hue)) return null;
  if (typeof raw.chroma !== 'number' || !Number.isFinite(raw.chroma)) return null;
  const hue = ((raw.hue % 360) + 360) % 360;
  return {
    hue,
    hslHue:
      typeof raw.hslHue === 'number' && Number.isFinite(raw.hslHue)
        ? ((raw.hslHue % 360) + 360) % 360
        : hue,
    chroma: Math.min(ACCENT_MAX_CHROMA, Math.max(0, raw.chroma)),
    hex: typeof raw.hex === 'string' ? raw.hex : DEFAULT_ACCENT.hex,
    mode: raw.mode === 'manual' ? 'manual' : 'auto',
  };
}
