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
