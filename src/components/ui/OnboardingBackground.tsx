'use client';

import { useMemo } from 'react';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useOnboardingBackgroundStore } from '@/lib/onboardingBackgroundStore';

// Renders the randomized onboarding background (chosen in OnboardingFrogHeader and
// shared via the store). Falls back to the default swamp until one is rolled.
export function OnboardingBackground() {
  const { data } = useBackgrounds();
  const backgroundId = useOnboardingBackgroundStore((s) => s.backgroundId);

  const background = useMemo(() => {
    if (!data?.catalog || !backgroundId) return null;
    return data.catalog.find((item) => item.id === backgroundId) ?? null;
  }, [data?.catalog, backgroundId]);

  const images = {
    mobile: background?.images?.mobile || '/bg-mobile.webp',
    tablet: background?.images?.tablet || '/bg-tablet.webp',
    web: background?.images?.web || '/bg-web.webp',
    webLarge: background?.images?.webLarge || '/bg-web-large.webp',
  };

  return (
    <picture
      key={background?.id ?? 'default-bg'}
      aria-hidden
      className="pointer-events-none absolute left-0 right-0 top-0 -z-10 block h-[400px] w-full overflow-hidden animate-in fade-in duration-500 md:h-[440px]"
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
