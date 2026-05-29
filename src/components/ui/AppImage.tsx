'use client';

import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type AppImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Above-the-fold image: load eagerly with high priority (no lazy/fade-in delay). */
  priority?: boolean;
};

/**
 * Drop-in replacement for <img> with consistent loading behaviour:
 * - lazy-loads + async-decodes off-screen images so they never block paint
 * - fades in on load instead of popping in
 * - `priority` opts an above-the-fold image into eager, high-priority loading
 *
 * Works in every environment (web, Capacitor native, static export) because it
 * does not depend on the Next image optimizer. Point `src` at a .webp asset for
 * the size win (see `pnpm optimize:images`).
 */
export function AppImage({
  priority = false,
  className,
  onLoad,
  alt = '',
  ...props
}: AppImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      {...props}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      // @ts-expect-error fetchpriority is a valid DOM attribute not yet typed
      fetchpriority={priority ? 'high' : undefined}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      className={cn(
        'transition-opacity duration-300 ease-out',
        loaded || priority ? 'opacity-100' : 'opacity-0',
        className
      )}
    />
  );
}
