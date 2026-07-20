'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import Frog from '@/components/ui/frog';
import { byId, type ItemDef, type WardrobeSlot } from '@/lib/skins/catalog';
import { ItemCard } from '@/components/ui/skins/ItemCard';
import { BackgroundCard } from '@/components/ui/skins/BackgroundCard';
import {
  DEFAULT_BACKGROUND_IMAGES,
  type BackgroundImages,
  type BackgroundItem,
} from '@/hooks/useBackgrounds';

const showcaseIds = [
  'skin_rainbow',
  'skin_blue',
  'hat_wizard',
] as const;

const showcaseItems = showcaseIds
  .map((id) => byId[id])
  .filter((item): item is ItemDef => !!item);

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
  const [equipped, setEquipped] = useState<Partial<Record<WardrobeSlot, number>>>({
    skin: byId.skin_rainbow?.riveIndex ?? 3,
    hat: byId.hat_wizard?.riveIndex ?? 1,
    body: 0,
    hand_item: 0,
  });
  const [sceneIndex, setSceneIndex] = useState(0);
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>(fallbackBackgrounds);
  const scene = backgrounds[sceneIndex] ?? backgrounds[0];
  const sceneSrc = scene.images.mobile || scene.images.tablet || scene.images.web;

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/backgrounds', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { catalog?: Array<{
        id: string;
        name: string;
        rarity: BackgroundItem['rarity'];
        priceFlies: number;
        images?: Partial<BackgroundImages>;
      }> } | null) => {
        const catalog = payload?.catalog
          ?.filter((item) => item.images?.mobile)
          .map((item) => ({
            id: item.id,
            name: item.name,
            rarity: item.rarity,
            priceFlies: item.priceFlies,
            images: {
              mobile: item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.mobile,
              tablet: item.images?.tablet ?? item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.tablet,
              web: item.images?.web ?? item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.web,
              webLarge: item.images?.webLarge ?? item.images?.web ?? item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.webLarge,
            },
          }));
        if (catalog?.length) {
          setBackgrounds(catalog);
          setSceneIndex(0);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const equip = (item: ItemDef) => {
    setEquipped((current) => ({
      ...current,
      [item.slot]:
        item.slot !== 'skin' && current[item.slot] === item.riveIndex
          ? 0
          : item.riveIndex,
    }));
  };

  return (
    <div className="overflow-hidden rounded-[30px] border border-border/60 bg-card shadow-xl shadow-emerald-950/10">
      <div className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Wardrobe
          </p>
          <p className="mt-0.5 text-sm font-black">Mix skins, gear, and pond backgrounds</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-emerald-400/10 to-amber-300/20 px-3 py-2 shadow-sm">
          <span className="text-xl font-black leading-none tracking-tight text-primary tabular-nums">
            100+
          </span>
          <span className="max-w-[7ch] text-[8px] font-black uppercase leading-tight tracking-[0.12em] text-foreground/70">
            Frog looks
          </span>
        </div>
      </div>

      <div className="relative min-h-[300px] overflow-hidden">
        <Image
          key={sceneSrc}
          src={sceneSrc}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover object-center"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/25" />
        <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center">
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

      <div className="relative z-20 -mt-6 rounded-t-[28px] bg-card p-4 pt-7 sm:p-5 sm:pt-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Items</p>
          <p className="text-[10px] font-bold text-muted-foreground">Equip more than one</p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-3" aria-label="Try wardrobe items">
          {showcaseItems.map((item) => {
            const active = equipped[item.slot] === item.riveIndex;
            return (
              <ItemCard
                key={item.id}
                item={item}
                mode="inventory"
                ownedCount={0}
                isEquipped={active}
                canAfford
                actionLoading={false}
                onAction={() => equip(item)}
                compact
                centerFrogPreview
                pausePreview
                hidePrice
                hideDropRates
              />
            );
          })}
        </div>

        <p className="mt-4 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Backgrounds</p>
        <div className="mt-2 grid grid-cols-3 gap-2" aria-label="Try a background">
          {backgrounds.slice(0, 3).map((background, index) => (
            <BackgroundCard
              key={background.id}
              item={background}
              owned
              ownedCount={0}
              isEquipped={index === sceneIndex}
              canAfford
              mode="inventory"
              actionLoading={false}
              compact
              onAction={() => setSceneIndex(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
