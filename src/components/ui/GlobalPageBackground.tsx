'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/components/auth/AuthContext';
import {
  DEFAULT_BACKGROUND_IMAGES,
  readCachedBackground,
  useBackgrounds,
  writeCachedBackground,
  type BackgroundImages,
} from '@/hooks/useBackgrounds';
import { useUIStore } from '@/lib/uiStore';

export function GlobalPageBackground() {
  const isLoadingScreenVisible = useUIStore(
    (state) => state.isLoadingScreenVisible,
  );
  const { user, loading } = useAuth();
  const { data } = useBackgrounds(!!user && !loading);
  const reduceMotion = useReducedMotion();
  const [cachedBackground, setCachedBackground] =
    useState<ReturnType<typeof readCachedBackground>>(null);
  useEffect(() => {
    setCachedBackground(readCachedBackground());
  }, []);

  const equippedBackground = useMemo(() => {
    if (!data?.equipped) return null;
    return data.catalog.find((item) => item.id === data.equipped) ?? null;
  }, [data?.equipped, data?.catalog]);

  const activeBackground =
    user || loading
      ? equippedBackground
        ? { id: equippedBackground.id, images: equippedBackground.images }
        : cachedBackground
      : null;
  const shouldWaitForUserBackground = (loading || !!user) && !activeBackground && !data;
  const backgroundKey = activeBackground?.id ?? 'default-bg';
  const images = activeBackground?.images ?? DEFAULT_BACKGROUND_IMAGES;

  useEffect(() => {
    if (!equippedBackground) return;
    const next = {
      id: equippedBackground.id,
      images: equippedBackground.images,
    };
    setCachedBackground(next);
    writeCachedBackground(next);
  }, [equippedBackground]);

  if (isLoadingScreenVisible || shouldWaitForUserBackground) return null;

  return (
    <div
      aria-hidden
      data-fly-page-bg
      className="pointer-events-none absolute left-0 right-0 top-0 -z-10 h-[calc(400px+env(safe-area-inset-top))] w-full overflow-hidden md:h-[440px]"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={backgroundKey}
          className="absolute inset-0"
          initial={
            reduceMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  scale: 1.06,
                  clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)',
                }
          }
          animate={
            reduceMotion
              ? { opacity: 1 }
              : {
                  opacity: 1,
                  scale: 1,
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                }
          }
          exit={
            reduceMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  scale: 1.02,
                  filter: 'saturate(0.85) brightness(0.95)',
                }
          }
          transition={{
            opacity: { duration: 0.45, ease: 'easeOut' },
            scale: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
            clipPath: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
            filter: { duration: 0.35, ease: 'easeOut' },
          }}
        >
          <BackgroundPicture images={images} />
          <div className="absolute inset-0 animate-[background-glint_700ms_ease-out] bg-gradient-to-b from-white/10 via-transparent to-black/5 opacity-0" />
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 shadow-[rgba(0,0,0,0.06)_0px_2px_4px_0px_inset,rgba(0,0,0,0.15)_0px_-2px_5px_0px_inset]" />
      <div className="absolute inset-x-0 bottom-0 hidden h-14 bg-gradient-to-b from-transparent via-background/25 to-background md:block" />
      <style jsx global>{`
        @keyframes background-glint {
          0% {
            opacity: 0.8;
            transform: translateX(-18%);
          }
          100% {
            opacity: 0;
            transform: translateX(18%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-background-picture] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function BackgroundPicture({ images }: { images: BackgroundImages }) {
  return (
    <picture data-background-picture className="block h-full w-full">
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
