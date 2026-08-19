'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  Crown,
  Hand,
  Image as ImageIcon,
  Paintbrush,
  Shirt,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import Frog from '@/components/ui/frog';
import { CATALOG, type ItemDef, type WardrobeSlot } from '@/lib/skins/catalog';
import { ItemCard } from '@/components/ui/skins/ItemCard';
import { BackgroundCard } from '@/components/ui/skins/BackgroundCard';
import { FilterBar, type FilterCategory } from '@/components/ui/skins/FilterBar';
import {
  DEFAULT_BACKGROUND_IMAGES,
  type BackgroundImages,
  type BackgroundItem,
} from '@/hooks/useBackgrounds';

const WEARABLE_SLOTS = ['skin', 'hat', 'body', 'hand_item'] as const;
type WearableSlot = (typeof WEARABLE_SLOTS)[number];

const wearables = CATALOG.filter((item) =>
  (WEARABLE_SLOTS as readonly WardrobeSlot[]).includes(item.slot),
);
const byId = Object.fromEntries(wearables.map((item) => [item.id, item]));
const bySlot = (slot: WearableSlot) => wearables.filter((item) => item.slot === slot);

const lookCount = WEARABLE_SLOTS.reduce(
  (total, slot) => total * (bySlot(slot).length + 1),
  1,
);
const lookLabel = `${(Math.floor(lookCount / 100) * 100).toLocaleString()}+`;

const FILTER_SLOT: Partial<Record<FilterCategory, WearableSlot>> = {
  skin: 'skin',
  hat: 'hat',
  body: 'body',
  held: 'hand_item',
};

const filterOptions = [
  { id: 'all', label: 'All Items', icon: <Sparkles className="h-5 w-5" /> },
  { id: 'skin', label: 'Skins', icon: <Paintbrush className="h-5 w-5" /> },
  { id: 'hat', label: 'Hats', icon: <Crown className="h-5 w-5" /> },
  { id: 'body', label: 'Body', icon: <Shirt className="h-5 w-5" /> },
  { id: 'held', label: 'Held', icon: <Hand className="h-5 w-5" /> },
  { id: 'background', label: 'Backgrounds', icon: <ImageIcon className="h-5 w-5" /> },
];

const START_EQUIPPED: Partial<Record<WardrobeSlot, number>> = {
  skin: byId.skin_rainbow?.riveIndex ?? 0,
  hat: byId.hat_wizard?.riveIndex ?? 0,
  body: 0,
  hand_item: 0,
};

const fallbackBackgrounds: BackgroundItem[] = [
  {
    id: 'bg_default',
    name: 'Swamp',
    rarity: 'common',
    priceFlies: 0,
    images: DEFAULT_BACKGROUND_IMAGES,
  },
];

export function MarketingWardrobePreview() {
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [equipped, setEquipped] =
    useState<Partial<Record<WardrobeSlot, number>>>(START_EQUIPPED);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>(fallbackBackgrounds);

  const scene = backgrounds[sceneIndex] ?? backgrounds[0];
  const sceneSrc = scene.images.mobile || scene.images.tablet || scene.images.web;

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/backgrounds', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          payload: {
            catalog?: Array<{
              id: string;
              name: string;
              rarity: BackgroundItem['rarity'];
              priceFlies: number;
              images?: Partial<BackgroundImages>;
            }>;
          } | null,
        ) => {
          const catalog = payload?.catalog
            ?.filter((item) => item.images?.mobile)
            .map((item) => ({
              id: item.id,
              name: item.name,
              rarity: item.rarity,
              priceFlies: item.priceFlies,
              images: {
                mobile: item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.mobile,
                tablet:
                  item.images?.tablet ?? item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.tablet,
                web: item.images?.web ?? item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.web,
                webLarge:
                  item.images?.webLarge ??
                  item.images?.web ??
                  item.images?.mobile ??
                  DEFAULT_BACKGROUND_IMAGES.webLarge,
              },
            }));
          if (catalog?.length) {
            setBackgrounds(catalog);
            setSceneIndex(0);
          }
        },
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const slotFilter = FILTER_SLOT[filter];
  const visibleItems = useMemo(
    () => (slotFilter ? bySlot(slotFilter) : wearables),
    [slotFilter],
  );

  const equip = (item: ItemDef) => {
    setEquipped((current) => ({
      ...current,
      [item.slot]: current[item.slot] === item.riveIndex ? 0 : item.riveIndex,
    }));
  };

  const shuffle = () => {
    const pick = (slot: WearableSlot) => {
      const options = bySlot(slot);
      const roll = Math.floor(Math.random() * (options.length + 1));
      return roll === 0 ? 0 : options[roll - 1].riveIndex;
    };
    setEquipped({
      skin: pick('skin'),
      hat: pick('hat'),
      body: pick('body'),
      hand_item: pick('hand_item'),
    });
    setSceneIndex(Math.floor(Math.random() * backgrounds.length));
  };

  const equippedCount = WEARABLE_SLOTS.filter((slot) => (equipped[slot] ?? 0) > 0).length;

  return (
    <div className="flex max-h-[min(760px,82svh)] flex-col overflow-hidden rounded-[30px] border border-border/60 bg-card shadow-xl shadow-emerald-950/10">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Wardrobe
          </p>
          <p className="mt-0.5 text-sm font-black">Dress your frog, then set the pond</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-emerald-400/10 to-amber-300/20 px-3 py-2 shadow-sm">
          <span className="text-xl font-black leading-none tracking-tight text-primary tabular-nums">
            {lookLabel}
          </span>
          <span className="max-w-[7ch] text-[8px] font-black uppercase leading-tight tracking-[0.12em] text-foreground/70">
            Frog looks
          </span>
        </div>
      </div>

      <div className="relative h-[232px] shrink-0 overflow-hidden sm:h-[264px]">
        <Image
          key={sceneSrc}
          src={sceneSrc}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/25"
        />

        <button
          type="button"
          onClick={shuffle}
          className="group absolute left-1/2 top-4 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#1f5526] shadow-lg shadow-emerald-950/25 ring-1 ring-black/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-xl hover:shadow-emerald-950/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-0 dark:bg-[#0d2118]/90 dark:text-[#b7e39c] dark:ring-white/10"
        >
          <Shuffle
            className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180"
            aria-hidden
          />
          Style shuffle
        </button>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center">
          <div className="relative h-[275px] w-[245px]">
            <Frog
              className="absolute inset-x-0 bottom-[-25px] z-10"
              width="100%"
              height={300}
              visualOffsetY={0}
              indices={{ mood: 0, container: 0, ...equipped }}
              ignoreIdlePause
            />
          </div>
        </div>
      </div>

      <div className="relative z-20 -mt-6 flex min-h-0 flex-1 flex-col rounded-t-[28px] bg-card p-4 pt-6 sm:p-5 sm:pt-7">
        <div className="shrink-0">
          <FilterBar
            active={filter}
            onChange={setFilter}
            options={filterOptions}
            centerActiveOnMount={false}
          />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            {filter === 'background'
              ? `${backgrounds.length} ponds`
              : `${visibleItems.length} items`}
          </p>
          <p className="text-[10px] font-bold text-muted-foreground">
            {equippedCount > 0 ? `${equippedCount} equipped` : 'Tap to try one on'}
          </p>
        </div>

        <div className="no-scrollbar mt-1 min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          {filter === 'background' ? (
            <div
              className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
              aria-label="Pond backgrounds"
            >
              {backgrounds.map((background, index) => (
                <BackgroundCard
                  key={background.id}
                  item={background}
                  owned
                  ownedCount={0}
                  isEquipped={index === sceneIndex}
                  canAfford
                  mode="inventory"
                  actionLoading={false}
                  onAction={() => setSceneIndex(index)}
                />
              ))}
            </div>
          ) : (
            <div
              className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
              aria-label="Wardrobe items"
            >
              {visibleItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  mode="inventory"
                  ownedCount={0}
                  isEquipped={equipped[item.slot] === item.riveIndex}
                  canAfford
                  actionLoading={false}
                  onAction={() => equip(item)}
                  centerFrogPreview
                  deferPreview
                  pausePreview
                  previewRootMargin="700px"
                  hideDropRates
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
