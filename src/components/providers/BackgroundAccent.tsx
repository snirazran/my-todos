'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { readCachedBackground, useBackgrounds } from '@/hooks/useBackgrounds';
import { DEFAULT_ACCENT, normalizeAccent } from '@/lib/backgrounds/constants';

const THEME_COLOR_LIGHT = (h: number) => `hsl(${h} 40% 99.3%)`;
const THEME_COLOR_DARK = (h: number) => `hsl(${h} 22% 7%)`;

export function BackgroundAccent() {
  const { user, loading } = useAuth();
  const { data } = useBackgrounds(!!user && !loading);
  const [cached, setCached] = useState<ReturnType<typeof readCachedBackground>>(null);

  useEffect(() => {
    setCached(readCachedBackground());
  }, []);

  const accent = useMemo(() => {
    const equipped = data?.equipped
      ? data.catalog.find((item) => item.id === data.equipped)
      : null;
    return (
      normalizeAccent(equipped?.accent) ??
      normalizeAccent(cached?.accent) ??
      DEFAULT_ACCENT
    );
  }, [data?.equipped, data?.catalog, cached?.accent]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-accent-h', String(accent.hue));
    root.style.setProperty('--bg-accent-c', String(accent.chroma));
    root.style.setProperty('--bg-accent-hsl-h', String(accent.hslHue));

    const light = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][media*="light"]',
    );
    const dark = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][media*="dark"]',
    );
    if (light) light.content = THEME_COLOR_LIGHT(accent.hslHue);
    if (dark) dark.content = THEME_COLOR_DARK(accent.hslHue);
  }, [accent.hue, accent.chroma, accent.hslHue]);

  return null;
}
