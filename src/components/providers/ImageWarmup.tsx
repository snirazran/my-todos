'use client';

import { useIdleImageWarmup } from '@/lib/imageWarmup';

const GLOBAL_MODAL_ART = ['/invitefrog.webp', '/premium-cover.webp'] as const;

export function ImageWarmup() {
  useIdleImageWarmup(GLOBAL_MODAL_ART);
  return null;
}
