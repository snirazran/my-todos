'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import {
  DEFAULT_BACKGROUND_IMAGES,
  readCachedBackground,
  useBackgrounds,
  writeCachedBackground,
} from '@/hooks/useBackgrounds';
import { backgroundFadeMaskStyle } from '@/lib/backgrounds/fadeMask';
import { useUIStore } from '@/lib/uiStore';
import { BackgroundCrossfade } from '@/components/ui/BackgroundCrossfade';

export function GlobalPageBackground() {
  const pathname = usePathname();
  const isLoadingScreenVisible = useUIStore(
    (state) => state.isLoadingScreenVisible,
  );
  const { user, loading } = useAuth();
  const { data } = useBackgrounds(!!user && !loading);
  const [cachedBackground, setCachedBackground] =
    useState<ReturnType<typeof readCachedBackground>>(null);
  useEffect(() => {
    setCachedBackground(readCachedBackground());
  }, []);

  const equippedBackground = useMemo(() => {
    if (!data?.equipped) return null;
    return data.catalog.find((item) => item.id === data.equipped) ?? null;
  }, [data?.equipped, data?.catalog]);

  const activeBackground =
    user || loading
      ? equippedBackground
        ? { id: equippedBackground.id, images: equippedBackground.images }
        : cachedBackground
      : null;
  const shouldWaitForUserBackground = (loading || !!user) && !activeBackground && !data;
  const backgroundKey = activeBackground?.id ?? 'default-bg';
  const images = activeBackground?.images ?? DEFAULT_BACKGROUND_IMAGES;

  useEffect(() => {
    if (!equippedBackground) return;
    const next = {
      id: equippedBackground.id,
      images: equippedBackground.images,
    };
    setCachedBackground(next);
    writeCachedBackground(next);
  }, [equippedBackground]);

  // The wardrobe owns a full-width, sticky backdrop, including try-on previews.
  if (
    pathname === '/wardrobe' ||
    isLoadingScreenVisible ||
    shouldWaitForUserBackground
  ) return null;

  return (
    <div
      aria-hidden
      data-fly-page-bg
      style={backgroundFadeMaskStyle}
      className="pointer-events-none absolute left-0 right-0 top-0 -z-10 h-[calc(440px+env(safe-area-inset-top))] w-full overflow-hidden md:h-[480px]"
    >
      <BackgroundCrossfade id={backgroundKey} images={images} />
      <div className="absolute inset-0 shadow-[rgba(0,0,0,0.06)_0px_2px_4px_0px_inset]" />
    </div>
  );
}
