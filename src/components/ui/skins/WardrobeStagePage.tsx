'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { WardrobePageContent, type WardrobeSection } from '@/components/ui/skins/WardrobePanel';
import { useInventory } from '@/hooks/useInventory';
import { useIsFrogHungry } from '@/hooks/useFrogHunger';
import { DEFAULT_BACKGROUND_IMAGES, useBackgrounds } from '@/hooks/useBackgrounds';
import { useWardrobeTryOn, WARDROBE_EQUIPPED_EVENT } from '@/lib/wardrobeTryOnStore';
import { pickEmote } from '@/lib/frogEmotes';
import { byId as staticById, type WardrobeSlot } from '@/lib/skins/catalog';
import { BackgroundCrossfade } from '@/components/ui/BackgroundCrossfade';
import {
  PurchaseBurst,
  usePurchaseCelebration,
} from '@/components/ui/skins/PurchaseBurst';

export function WardrobeStagePage({ section }: { section: WardrobeSection }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const { data } = useInventory(true);
  const isFrogHungry = useIsFrogHungry(true);
  const { data: bgData } = useBackgrounds(true);
  const requestedTab = searchParams.get('tab');
  const defaultTab = section === 'shop' ? 'shop' : requestedTab === 'trade' ? 'trade' : 'inventory';
  const focusItemId = searchParams.get('item') || null;
  const focusItemKind =
    searchParams.get('kind') === 'background' ? 'background' : 'item';

  const previewIndices = useMemo(() => {
    const catalogById = Object.fromEntries(
      (data?.catalog ?? []).map((item) => [item.id, item]),
    );
    const equipped = data?.wardrobe?.equipped ?? {};

    const getIndex = (slot: WardrobeSlot) => {
      const itemId = equipped[slot];
      if (!itemId) return 0;
      return (catalogById[itemId] ?? staticById[itemId])?.riveIndex ?? 0;
    };

    return {
      skin: getIndex('skin'),
      mood: isFrogHungry ? 1 : 0,
      hat: getIndex('hat'),
      body: getIndex('body'),
      hand_item: getIndex('hand_item'),
    };
  }, [data?.catalog, data?.wardrobe?.equipped, isFrogHungry]);

  const tryOn = useWardrobeTryOn((s) => s.tryOn);
  const setTryOn = useWardrobeTryOn((s) => s.setTryOn);
  useEffect(() => () => setTryOn(null), [setTryOn]);

  const stageIndices = useMemo(
    () =>
      tryOn?.kind === 'item'
        ? { ...previewIndices, [tryOn.slot]: tryOn.riveIndex }
        : previewIndices,
    [previewIndices, tryOn],
  );

  const equippedBgImages = useMemo(() => {
    const bgItem = (bgData?.catalog ?? []).find((b) => b.id === bgData?.equipped);
    return bgItem?.images ?? DEFAULT_BACKGROUND_IMAGES;
  }, [bgData?.equipped, bgData?.catalog]);
  const stageImages = tryOn?.kind === 'bg' ? tryOn.images : equippedBgImages;
  const stageBackgroundId =
    tryOn?.kind === 'bg' ? tryOn.id : (bgData?.equipped ?? 'default-bg');

  const purchaseBurst = usePurchaseCelebration();

  const tryOnKey = !tryOn
    ? null
    : tryOn.kind === 'item'
      ? `${tryOn.slot}:${tryOn.riveIndex}`
      : tryOn.id;
  useEffect(() => {
    if (tryOnKey) frogRef.current?.fireEmote(pickEmote('tryOn'), { soft: true });
  }, [tryOnKey]);

  useEffect(() => {
    const onEquipped = () => frogRef.current?.fireEmote(pickEmote('equip'));
    window.addEventListener(WARDROBE_EQUIPPED_EVENT, onEquipped);
    return () => window.removeEventListener(WARDROBE_EQUIPPED_EVENT, onEquipped);
  }, []);

  const stage = (
    <div className="relative shrink-0">
      <div
        data-fly-hero
        className={`relative flex items-end justify-center pointer-events-none md:h-[calc(302px+env(safe-area-inset-top))] ${
          section === 'wardrobe'
            ? 'h-[calc(252px+env(safe-area-inset-top))]'
            : 'h-[calc(204px+env(safe-area-inset-top))]'
        }`}
      >
        <div
          ref={frogBoxRef}
          className="relative translate-y-[73px] pointer-events-none md:translate-y-[5.21rem]"
        >
          {purchaseBurst && (
            <PurchaseBurst
              key={purchaseBurst.key}
              rarity={purchaseBurst.rarity}
              className="top-[76%]"
            />
          )}
          <div data-fly-hero-frog>
            <div className={purchaseBurst ? 'purchase-hop' : undefined}>
              <Frog
                ref={frogRef}
                indices={stageIndices}
                paused={false}
                stage
                fidget
              />
            </div>
          </div>
          <PremiumFrogAura />
        </div>
      </div>
    </div>
  );

  const stageBackground = (
    <div className="absolute inset-x-0 top-0 h-[calc(440px+env(safe-area-inset-top))] md:h-[600px]">
      <BackgroundCrossfade id={stageBackgroundId} images={stageImages} />
    </div>
  );

  return (
    <main className="relative min-h-[100dvh] md:min-h-[calc(100vh-4rem)] flex flex-col overflow-x-clip">
      <div className="relative z-10 flex flex-1 flex-col w-full min-h-[100dvh] md:min-h-[calc(100vh-4rem)] mx-auto px-4 md:px-6 max-w-3xl">
        <section data-fly-sheet className="relative z-10 flex flex-col flex-1 px-4 -mx-4 md:-mx-6 md:px-6">
          <WardrobePageContent
            section={section}
            defaultTab={defaultTab}
            focusItemId={focusItemId}
            focusItemKind={focusItemKind}
            stage={section === 'shop' ? undefined : stage}
            stageBackground={stageBackground}
            onClose={() => router.push('/')}
          />
        </section>
      </div>
    </main>
  );
}
