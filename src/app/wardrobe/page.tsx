'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { WardrobePageContent } from '@/components/ui/skins/WardrobePanel';
import { useInventory } from '@/hooks/useInventory';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { backgroundPreview } from '@/hooks/useBackgroundActions';
import { byId as staticById, type WardrobeSlot } from '@/lib/skins/catalog';
import { useUIStore } from '@/lib/uiStore';
import { cn } from '@/lib/utils';

function WardrobePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const frogRef = useRef<FrogHandle>(null);
  const { data } = useInventory(true);
  const { data: bgData } = useBackgrounds(true);
  const isStuck = useUIStore((s) => s.isWardrobeStuck);
  const wardrobeTab = useUIStore((s) => s.wardrobeTab);
  const defaultTab =
    (searchParams.get('tab') as 'inventory' | 'shop' | 'trade') || 'inventory';

  const equippedBgImage = useMemo(() => {
    const equippedId = bgData?.equipped;
    if (!equippedId) return null;
    const bgItem = (bgData?.catalog ?? []).find((b) => b.id === equippedId);
    return bgItem ? backgroundPreview(bgItem) || null : null;
  }, [bgData?.equipped, bgData?.catalog]);

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
      mood: 0,
      hat: getIndex('hat'),
      body: getIndex('body'),
      hand_item: getIndex('hand_item'),
    };
  }, [data?.catalog, data?.wardrobe?.equipped]);

  const dockControls = useAnimationControls();
  const indicesKey = useMemo(
    () => JSON.stringify(previewIndices),
    [previewIndices],
  );
  const prevIndicesKey = useRef(indicesKey);
  useEffect(() => {
    if (prevIndicesKey.current === indicesKey) return;
    prevIndicesKey.current = indicesKey;
    if (!isStuck) return;
    dockControls.start({
      scale: [1, 1.18, 1],
      transition: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] },
    });
  }, [indicesKey, isStuck, dockControls]);

  return (
    <main className="relative min-h-[100dvh] md:min-h-[calc(100vh-4rem)] flex flex-col overflow-x-clip">
      <div className="relative z-10 flex flex-1 flex-col w-full min-h-[100dvh] md:min-h-[calc(100vh-4rem)] max-w-3xl mx-auto px-4 md:px-6">
        <div
          className={cn(
            'relative flex shrink-0 items-end justify-center pointer-events-none h-[calc(204px+env(safe-area-inset-top))] md:h-[calc(222px+env(safe-area-inset-top))]',
            isStuck ? 'z-[5]' : 'z-40',
          )}
        >
          <div
            className={cn(
              'relative z-50 translate-y-[72px] pointer-events-none md:translate-y-[5.15rem]',
              'origin-bottom transition-[opacity,transform] duration-300 ease-out',
              isStuck && 'opacity-0 scale-95',
            )}
          >
            <Frog
              ref={frogRef}
              mouthOpen={false}
              indices={previewIndices}
              paused={false}
            />
          </div>
        </div>

        <section className="relative z-10 flex flex-col flex-1 px-4 -mx-4 md:-mx-6 md:px-6">
          <WardrobePageContent
            defaultTab={defaultTab}
            onClose={() => router.push('/')}
          />
        </section>
      </div>

      <AnimatePresence>
        {isStuck && wardrobeTab === 'inventory' && (
          <motion.button
            type="button"
            aria-label="Scroll to your frog"
            initial={{ opacity: 0, scale: 0.4, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.4, y: 24 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            whileTap={{ scale: 0.92 }}
            onClick={() =>
              document
                .getElementById('main-scroll')
                ?.scrollTo({ top: 0, behavior: 'smooth' })
            }
            className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+76px+0.75rem)] md:bottom-6 z-[70] h-[72px] w-[72px] overflow-hidden rounded-full border-[3px] border-primary/40 bg-card shadow-xl"
          >
            {equippedBgImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={equippedBgImage}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
            )}
            <motion.div
              animate={dockControls}
              className="relative flex h-full w-full items-end justify-center"
            >
              <FrogSnapshot
                indices={previewIndices}
                width={80}
                height={80}
                visualOffsetY={2}
                className="pointer-events-none"
              />
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>
    </main>
  );
}

export default function WardrobePage() {
  // useSearchParams() requires a Suspense boundary during prerender (Next 16).
  return (
    <Suspense fallback={null}>
      <WardrobePageInner />
    </Suspense>
  );
}
