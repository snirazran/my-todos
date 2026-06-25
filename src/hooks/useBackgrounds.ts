import useSWR, { mutate as mutateGlobal } from 'swr';

export type BackgroundRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type BackgroundImages = {
  mobile: string;
  tablet: string;
  web: string;
  webLarge: string;
};

export type BackgroundItem = {
  id: string;
  name: string;
  rarity: BackgroundRarity;
  priceFlies: number;
  images: BackgroundImages;
  hidden?: boolean;
};

export type BackgroundsApiData = {
  catalog: BackgroundItem[];
  equipped: string | null;
  inventory: Record<string, number>;
  flies: number;
};

export const BACKGROUNDS_KEY = '/api/backgrounds';
export const DEFAULT_BACKGROUND_IMAGES: BackgroundImages = {
  mobile: '/bg-mobile.webp',
  tablet: '/bg-tablet.webp',
  web: '/bg-web.webp',
  webLarge: '/bg-web-large.webp',
};

const LAST_BACKGROUND_KEY = 'frogress.lastEquippedBackground';

export type CachedBackground = {
  id: string;
  images: BackgroundImages;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function mutateBackgrounds(data?: BackgroundsApiData) {
  if (data) {
    mutateGlobal(BACKGROUNDS_KEY, data, { revalidate: false });
    return;
  }
  mutateGlobal(BACKGROUNDS_KEY);
}

export function readCachedBackground(): CachedBackground | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_BACKGROUND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBackground;
    if (!parsed?.id || !parsed.images?.mobile) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedBackground(background: CachedBackground) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_BACKGROUND_KEY, JSON.stringify(background));
  } catch {
    /* ignore */
  }
}

export function useBackgrounds(active: boolean = true) {
  const { data, mutate, isLoading, error } = useSWR<BackgroundsApiData>(
    active ? BACKGROUNDS_KEY : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  return { data, mutate, isLoading, error };
}
