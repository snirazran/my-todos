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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function mutateBackgrounds() {
  mutateGlobal(BACKGROUNDS_KEY);
}

export function useBackgrounds(active: boolean = true) {
  const { data, mutate, isLoading, error } = useSWR<BackgroundsApiData>(
    active ? BACKGROUNDS_KEY : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  return { data, mutate, isLoading, error };
}
