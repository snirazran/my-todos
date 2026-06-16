'use client';

import { useMemo } from 'react';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useUIStore } from '@/lib/uiStore';

export function GlobalPageBackground() {
  const isLoadingScreenVisible = useUIStore((state) => state.isLoadingScreenVisible);
  const { data } = useBackgrounds();

  const equippedBackground = useMemo(() => {
    if (!data?.equipped) return null;
    return data.catalog.find((item) => item.id === data.equipped) ?? null;
  }, [data?.equipped, data?.catalog]);

  const images = {
    mobile: equippedBackground?.images?.mobile || '/bg-mobile.webp',
    tablet: equippedBackground?.images?.tablet || '/bg-tablet.webp',
    web: equippedBackground?.images?.web || '/bg-web.webp',
    webLarge: equippedBackground?.images?.webLarge || '/bg-web-large.webp',
  };

  if (isLoadingScreenVisible) return null;

  return (
    <picture
      key={equippedBackground?.id ?? 'default-bg'}
      aria-hidden
      className="pointer-events-none absolute left-0 right-0 top-0 -z-10 block h-[400px] w-full overflow-hidden md:h-[440px]"
    >
      {images.webLarge && (
        <source media="(min-width: 1920px)" srcSet={images.webLarge} />
      )}
      {images.web && <source media="(min-width: 1280px)" srcSet={images.web} />}
      {images.tablet && (
        <source media="(min-width: 768px)" srcSet={images.tablet} />
      )}
      <img
        src={images.mobile}
        alt=""
        className="h-full w-full object-cover object-top"
      />
      {/* Inset "recessed" feel on the whole image. Same tight-inset style top
          and bottom; the bottom uses a higher opacity only to compensate for
          the dark, busy water — so it reads the SAME amount of inset as the top
          inset that lands on the flat light sky. */}
      <div className="absolute inset-0 shadow-[rgba(0,0,0,0.06)_0px_2px_4px_0px_inset,rgba(0,0,0,0.15)_0px_-2px_5px_0px_inset]" />
    </picture>
  );
}
