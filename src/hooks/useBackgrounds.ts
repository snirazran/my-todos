import useSWR, { mutate as mutateGlobal } from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_BACKGROUND_IMAGES as SHARED_DEFAULT_BACKGROUND_IMAGES,
  isLegacyLocalBackground,
  normalizeAccent,
  type BackgroundAccent,
} from '@/lib/backgrounds/constants';

export type { BackgroundAccent };

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
  accent?: BackgroundAccent | null;
  hidden?: boolean;
};

export type BackgroundsApiData = {
  catalog: BackgroundItem[];
  equipped: string | null;
  inventory: Record<string, number>;
  flies: number;
};

export const BACKGROUNDS_KEY = '/api/backgrounds';
export const DEFAULT_BACKGROUND_IMAGES: BackgroundImages =
  SHARED_DEFAULT_BACKGROUND_IMAGES;

const LAST_BACKGROUND_KEY = 'frogress.lastEquippedBackground';

export type CachedBackground = {
  id: string;
  images: BackgroundImages;
  accent?: BackgroundAccent | null;
};

const fetcher = bootstrapFetcher;

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
    const accent = normalizeAccent(parsed.accent);
    if (
      parsed.id === DEFAULT_BACKGROUND_ID ||
      isLegacyLocalBackground(parsed.images.mobile)
    ) {
      return { id: parsed.id, images: DEFAULT_BACKGROUND_IMAGES, accent };
    }
    return { ...parsed, accent };
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
