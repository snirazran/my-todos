'use client';

import { useMemo, type CSSProperties } from 'react';
import {
  DEFAULT_BACKGROUND_IMAGES,
  useBackgrounds,
} from '@/hooks/useBackgrounds';
import { backgroundFadeMaskStyle } from '@/lib/backgrounds/fadeMask';
import { useOnboardingBackgroundStore } from '@/lib/onboardingBackgroundStore';
import { cn } from '@/lib/utils';

// Renders the randomized onboarding background (chosen in OnboardingFrogHeader and
// shared via the store). Falls back to the default background until one is rolled.
export function OnboardingBackground({
  style,
  wide = false,
  className,
}: {
  style?: CSSProperties;
  wide?: boolean;
  className?: string;
}) {
  const { data } = useBackgrounds();
  const backgroundId = useOnboardingBackgroundStore((s) => s.backgroundId);

  const background = useMemo(() => {
    if (!data?.catalog || !backgroundId) return null;
    return data.catalog.find((item) => item.id === backgroundId) ?? null;
  }, [data?.catalog, backgroundId]);

  const images = {
    mobile: background?.images?.mobile || DEFAULT_BACKGROUND_IMAGES.mobile,
    tablet: background?.images?.tablet || DEFAULT_BACKGROUND_IMAGES.tablet,
    web: background?.images?.web || DEFAULT_BACKGROUND_IMAGES.web,
    webLarge: background?.images?.webLarge || DEFAULT_BACKGROUND_IMAGES.webLarge,
  };

  return (
    <picture
      key={background?.id ?? 'default-bg'}
      aria-hidden
      style={style ? { ...backgroundFadeMaskStyle, ...style } : backgroundFadeMaskStyle}
      className={cn(
        'pointer-events-none absolute left-0 right-0 -top-12 -z-10 block h-[calc(440px+env(safe-area-inset-top))] w-full overflow-hidden animate-in fade-in duration-500 short:-top-8 md:top-0 md:h-[480px] lg:fixed lg:bottom-0 lg:h-auto lg:w-auto lg:![-webkit-mask-image:none] lg:![mask-image:none]',
        wide ? 'lg:right-0' : 'lg:right-1/2',
        className,
      )}
    >
      {images.webLarge && (
        <source media="(min-width: 1024px)" srcSet={images.webLarge} />
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
