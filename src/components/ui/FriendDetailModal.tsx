'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, X, UserMinus, Gift, Users } from 'lucide-react';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import {
  useBackgrounds,
  DEFAULT_BACKGROUND_IMAGES,
  type BackgroundImages,
} from '@/hooks/useBackgrounds';
import { contributionFrom, type FriendSummary } from '@/lib/friends/indices';

function BackgroundPicture({ images }: { images: BackgroundImages }) {
  return (
    <picture className="block h-full w-full">
      {images.webLarge && (
        <source media="(min-width: 1920px)" srcSet={images.webLarge} />
      )}
      {images.web && <source media="(min-width: 1280px)" srcSet={images.web} />}
      {images.tablet && (
        <source media="(min-width: 768px)" srcSet={images.tablet} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images.mobile}
        alt=""
        className="h-full w-full object-cover object-top"
      />
    </picture>
  );
}

export function FriendDetailModal({
  entry,
  onClose,
  onRemove,
}: {
  entry: FriendSummary | null;
  onClose: () => void;
  onRemove: (entry: FriendSummary) => void;
}) {
  const { data } = useBackgrounds(!!entry);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!entry) setMenuOpen(false);
  }, [entry]);

  const images = useMemo(() => {
    if (!entry?.backgroundId || !data?.catalog) return DEFAULT_BACKGROUND_IMAGES;
    return (
      data.catalog.find((b) => b.id === entry.backgroundId)?.images ??
      DEFAULT_BACKGROUND_IMAGES
    );
  }, [entry?.backgroundId, data?.catalog]);

  if (typeof document === 'undefined') return null;

  const today = entry
    ? entry.givesYou ?? contributionFrom(entry.fliesToday)
    : 0;
  const total = entry ? Math.max(entry.sharedTotal ?? 0, today) : 0;

  return createPortal(
    <AnimatePresence>
      {entry && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[1500] bg-black/70 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-[1501] flex items-stretch justify-center md:items-center md:p-6">
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="pointer-events-auto relative flex h-[100dvh] w-full flex-col overflow-hidden bg-background md:h-auto md:max-h-[calc(100dvh-3rem)] md:w-[min(100vw-3rem,26rem)] md:rounded-[28px] md:shadow-2xl"
            >
              {/* Banner: friend's background with the frog sitting on it */}
              <div className="relative h-[300px] shrink-0 md:h-[280px]">
                <div className="absolute inset-0 z-0 overflow-hidden">
                  <BackgroundPicture images={images} />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/10" />
                </div>

                {/* Top controls */}
                <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Friend options"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen((v) => !v);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>

                    <AnimatePresence>
                      {menuOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -4 }}
                          transition={{ duration: 0.12 }}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-xl border border-border/60 bg-white shadow-xl"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              onRemove(entry);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-rose-600 transition-colors hover:bg-rose-50"
                          >
                            <UserMinus className="h-4 w-4" />
                            Remove friend
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Frog — sits above the white sheet below it */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
                  <div className="-translate-y-6">
                    <Frog width={230} height={210} indices={entry.indices} />
                  </div>
                </div>
              </div>

              {/* White content sheet overlapping the banner */}
              <div className="relative z-10 -mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-t-[24px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5">
                <div className="text-center">
                  <h2 className="text-xl font-black tracking-tight text-foreground">
                    {entry.frogName || entry.name}
                  </h2>
                  {entry.name &&
                    entry.frogName &&
                    entry.name !== entry.frogName && (
                      <p className="text-sm font-semibold text-muted-foreground">
                        {entry.name}
                      </p>
                    )}
                </div>

                {/* Flies shared stats */}
                <div className="grid grid-cols-2 gap-2.5">
                  <FlyStat label="Shared today" value={today} />
                  <FlyStat label="Shared total" value={total} />
                </div>

                {/* Buddy-up card */}
                <div className="rounded-[20px] border border-[#4f9149]/25 bg-[#4f9149]/8 p-4 text-center">
                  <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4f9149]/15 text-[#4f9149]">
                    <Users className="h-6 w-6" />
                  </div>
                  <p className="text-base font-black tracking-tight text-emerald-950">
                    Building habits is better together
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-emerald-800/70">
                    Team up on a task and keep each other going.
                  </p>
                  <button
                    type="button"
                    className="mt-3.5 h-12 w-full rounded-2xl bg-[#4f9149] text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all hover:bg-[#457f40] active:translate-y-0.5 active:shadow-none"
                  >
                    Buddy up
                  </button>
                </div>

                {/* Send gift */}
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-base font-black tracking-tight text-foreground transition-transform active:scale-[0.98]"
                >
                  <Gift className="h-5 w-5 text-[#4f9149]" />
                  Send gift
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function FlyStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[18px] border border-border/50 bg-card/60 px-3 py-3.5">
      <div className="flex items-center gap-1.5">
        <Fly size={26} y={-4} interactive={false} />
        <span className="text-2xl font-black tabular-nums leading-none text-emerald-600">
          {value}
        </span>
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
