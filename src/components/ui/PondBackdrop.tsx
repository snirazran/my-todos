'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DEFAULT_BACKGROUND_IMAGES,
  readCachedBackground,
  useBackgrounds,
} from '@/hooks/useBackgrounds';
import { cn } from '@/lib/utils';

export function PondBackdrop({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const { data } = useBackgrounds();
  const [cached, setCached] = useState<ReturnType<typeof readCachedBackground>>(null);
  useEffect(() => {
    setCached(readCachedBackground());
  }, []);

  const images = useMemo(() => {
    const equipped = data?.equipped
      ? data.catalog.find((item) => item.id === data.equipped)
      : null;
    return equipped?.images ?? cached?.images ?? DEFAULT_BACKGROUND_IMAGES;
  }, [data?.equipped, data?.catalog, cached]);

  return (
    <picture
      aria-hidden
      style={style}
      className={cn('pointer-events-none block overflow-hidden', className)}
    >
      {images.webLarge && <source media="(min-width: 1920px)" srcSet={images.webLarge} />}
      {images.web && <source media="(min-width: 1280px)" srcSet={images.web} />}
      {images.tablet && <source media="(min-width: 768px)" srcSet={images.tablet} />}
      <img src={images.mobile} alt="" className="h-full w-full object-cover object-top" />
    </picture>
  );
}
