'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { HomeFocusFlies } from '@/components/ui/HomeFocusFlies';
import { WardrobePageContent } from '@/components/ui/skins/WardrobePanel';
import { useInventory } from '@/hooks/useInventory';
import { useIsFrogHungry } from '@/hooks/useFrogHunger';
import { DEFAULT_BACKGROUND_IMAGES, useBackgrounds } from '@/hooks/useBackgrounds';
import { useWardrobeTryOn, WARDROBE_EQUIPPED_EVENT } from '@/lib/wardrobeTryOnStore';
import { byId as staticById, type WardrobeSlot } from '@/lib/skins/catalog';
import { useUIStore } from '@/lib/uiStore';
import { WardrobePageSkeleton } from '@/components/ui/Skeleton';
import { FlyCatchSwipeLauncher } from '@/components/ui/FlyCatchSwipeLauncher';
import { BackgroundCrossfade } from '@/components/ui/BackgroundCrossfade';
import {
  PurchaseBurst,
  usePurchaseCelebration,
} from '@/components/ui/skins/PurchaseBurst';

function WardrobePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const [frogMouthOpen, setFrogMouthOpen] = useState(false);
  const { data } = useInventory(true);
  const isFrogHungry = useIsFrogHungry(true);
  const { data: bgData } = useBackgrounds(true);
  const lastWardrobeTab = useUIStore((s) => s.lastWardrobeTab);
  const defaultTab = ((searchParams.get('tab') || lastWardrobeTab) ||
    'inventory') as 'inventory' | 'shop' | 'trade';
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

  useEffect(() => {
    const onEquipped = () => frogRef.current?.fireEmote('love');
    window.addEventListener(WARDROBE_EQUIPPED_EVENT, onEquipped);
    return () => window.removeEventListener(WARDROBE_EQUIPPED_EVENT, onEquipped);
  }, []);

  const stage = (
    <FlyCatchSwipeLauncher source="wardrobe" className="shrink-0">
      <div
        data-fly-hero
        className="relative flex h-[calc(204px+env(safe-area-inset-top))] items-end justify-center pointer-events-none md:h-[calc(222px+env(safe-area-inset-top))]"
      >
        <div
          ref={frogBoxRef}
          className="relative translate-y-[73px] pointer-events-none md:translate-y-[5.21rem]"
        >
          <HomeFocusFlies
            frogRef={frogRef}
            frogBoxRef={frogBoxRef}
            onGrabActive={setFrogMouthOpen}
          />
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
                mouthOpen={frogMouthOpen}
                indices={stageIndices}
                paused={false}
              />
            </div>
          </div>
          <PremiumFrogAura />
        </div>
      </div>
    </FlyCatchSwipeLauncher>
  );

  const stageBackground = (
    <div className="absolute inset-x-0 top-0 h-[calc(440px+env(safe-area-inset-top))] md:h-[480px]">
      <BackgroundCrossfade id={stageBackgroundId} images={stageImages} />
    </div>
  );

  return (
    <main className="relative min-h-[100dvh] md:min-h-[calc(100vh-4rem)] flex flex-col overflow-x-clip">
      <div className="relative z-10 flex flex-1 flex-col w-full min-h-[100dvh] md:min-h-[calc(100vh-4rem)] max-w-3xl mx-auto px-4 md:px-6">
        <section data-fly-sheet className="relative z-10 flex flex-col flex-1 px-4 -mx-4 md:-mx-6 md:px-6">
          <WardrobePageContent
            defaultTab={defaultTab}
            focusItemId={focusItemId}
            focusItemKind={focusItemKind}
            stage={stage}
            stageBackground={stageBackground}
            onClose={() => router.push('/')}
          />
        </section>
      </div>
    </main>
  );
}

export default function WardrobePage() {
  // useSearchParams() requires a Suspense boundary during prerender (Next 16).
  return (
    <Suspense fallback={<WardrobePageSkeleton />}>
      <WardrobePageInner />
    </Suspense>
  );
}
