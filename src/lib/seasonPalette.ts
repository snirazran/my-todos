'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SEASON_PALETTE,
  SEASON_PALETTE_SAMPLE_SIZE,
  paletteFromPixels,
  type SeasonPalette,
} from '@/lib/seasonPaletteCore';

export type { SeasonPalette };
export { DEFAULT_SEASON_PALETTE };

const CACHE_PREFIX = 'season-palette:v5:';

function readCache(src: string): SeasonPalette | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + src);
    return raw ? (JSON.parse(raw) as SeasonPalette) : null;
  } catch {
    return null;
  }
}

function writeCache(src: string, palette: SeasonPalette) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + src, JSON.stringify(palette));
  } catch {}
}

export function useSeasonPalette(
  src?: string | null,
  known?: SeasonPalette | null,
): SeasonPalette {
  const cached = useMemo(
    () => (!known && src && typeof window !== 'undefined' ? readCache(src) : null),
    [src, known],
  );
  const [extracted, setExtracted] = useState<{ src: string; palette: SeasonPalette } | null>(null);

  useEffect(() => {
    if (known || !src || cached) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      try {
        const scale =
          SEASON_PALETTE_SAMPLE_SIZE / Math.max(img.naturalWidth, img.naturalHeight, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const next = paletteFromPixels(
          ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        );
        if (cancelled) return;
        writeCache(src, next);
        setExtracted({ src, palette: next });
      } catch {}
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, known, cached]);

  if (known) return known;
  if (!src) return DEFAULT_SEASON_PALETTE;
  if (cached) return cached;
  if (extracted?.src === src) return extracted.palette;
  return DEFAULT_SEASON_PALETTE;
}
