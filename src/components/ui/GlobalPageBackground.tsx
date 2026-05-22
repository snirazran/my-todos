'use client';

import { useMemo } from 'react';
import { useBackgrounds } from '@/hooks/useBackgrounds';

export function GlobalPageBackground() {
  const { data } = useBackgrounds();

  const equippedBackground = useMemo(() => {
    if (!data?.equipped) return null;
    return data.catalog.find((item) => item.id === data.equipped) ?? null;
  }, [data?.equipped, data?.catalog]);

  const images = {
    mobile: equippedBackground?.images?.mobile || '/bg-mobile.png',
    tablet: equippedBackground?.images?.tablet || '/bg-tablet.png',
    web: equippedBackground?.images?.web || '/bg-web.png',
    webLarge: equippedBackground?.images?.webLarge || '/bg-web-large.png',
  };

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
    </picture>
  );
}
