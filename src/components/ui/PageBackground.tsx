'use client';

import { useUIStore } from '@/lib/uiStore';

type PageBackgroundImages = {
  mobile: string;
  tablet: string;
  web: string;
  webLarge: string;
};

export function PageBackground({
  images,
  cacheKey,
}: {
  images: PageBackgroundImages;
  cacheKey?: string;
}) {
  const isLoadingScreenVisible = useUIStore((state) => state.isLoadingScreenVisible);

  if (isLoadingScreenVisible) return null;

  return (
    <picture
      key={cacheKey ?? 'page-bg'}
      aria-hidden
      className="pointer-events-none fixed left-0 right-0 top-0 -z-10 h-[clamp(220px,38vh,360px)]"
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
