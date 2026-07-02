'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, X, UserMinus, Users, Check, Loader2, Clock } from 'lucide-react';
import useSWR from 'swr';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import {
  useBackgrounds,
  DEFAULT_BACKGROUND_IMAGES,
  type BackgroundImages,
} from '@/hooks/useBackgrounds';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { contributionFrom, type FriendSummary } from '@/lib/friends/indices';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';

type BuddyInvite = {
  bondId: string;
  direction: 'incoming' | 'outgoing';
  withUserId: string;
  withName: string;
  text: string;
  repeatLabel: string;
};

const inviteFetcher = (url: string) => fetch(url).then((r) => r.json());

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
  onBuddyUp,
}: {
  entry: FriendSummary | null;
  onClose: () => void;
  onRemove: (entry: FriendSummary) => void;
  onBuddyUp: (entry: FriendSummary) => void;
}) {
  useRegisterOpenSheet(!!entry);
  const { data } = useBackgrounds(!!entry);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyBond, setBusyBond] = useState<string | null>(null);

  const { data: invitesData, mutate: mutateInvites } = useSWR<{
    incoming: BuddyInvite[];
    outgoing: BuddyInvite[];
  }>(entry ? '/api/buddy/invite' : null, inviteFetcher, {
    revalidateOnFocus: false,
  });

  const incoming = (invitesData?.incoming ?? []).filter(
    (i) => i.withUserId === entry?.userId,
  );
  const outgoing = (invitesData?.outgoing ?? []).filter(
    (i) => i.withUserId === entry?.userId,
  );

  const respondInvite = async (bondId: string, action: 'accept' | 'decline') => {
    setBusyBond(bondId);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/buddy/${bondId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz }),
      });
      if (res.ok) {
        await mutateInvites();
        mutateFriendsCaches();
      }
    } finally {
      setBusyBond(null);
    }
  };

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
                  <div className="-translate-y-[26px]">
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

                {/* Pending buddy invitations with this friend */}
                {(incoming.length > 0 || outgoing.length > 0) && (
                  <div className="flex flex-col gap-2">
                    <p className="px-1 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                      Buddy invitations
                    </p>
                    {incoming.map((inv) => (
                      <div
                        key={inv.bondId}
                        className="rounded-[18px] border border-[#4f9149]/30 bg-[#4f9149]/8 p-3"
                      >
                        <p className="text-sm font-black text-emerald-950">
                          {inv.withName} invited you
                        </p>
                        <p className="truncate text-[13px] font-semibold text-emerald-800/70">
                          {inv.text}
                          {inv.repeatLabel ? ` · ${inv.repeatLabel}` : ''}
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => respondInvite(inv.bondId, 'accept')}
                            disabled={busyBond === inv.bondId}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#4f9149] py-2.5 text-sm font-black text-white transition-colors hover:bg-[#457f40] disabled:opacity-60"
                          >
                            {busyBond === inv.bondId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" strokeWidth={3} />
                            )}
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => respondInvite(inv.bondId, 'decline')}
                            disabled={busyBond === inv.bondId}
                            className="rounded-xl bg-muted px-4 py-2.5 text-sm font-black text-muted-foreground transition-colors hover:bg-muted/70 disabled:opacity-60"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                    {outgoing.map((inv) => (
                      <div
                        key={inv.bondId}
                        className="flex items-center gap-2.5 rounded-[18px] border border-border/60 bg-card/60 p-3"
                      >
                        <Clock className="h-5 w-5 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-foreground">
                            Invitation pending
                          </p>
                          <p className="truncate text-[13px] font-semibold text-muted-foreground">
                            {inv.text}
                            {inv.repeatLabel ? ` · ${inv.repeatLabel}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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
                    onClick={() => onBuddyUp(entry)}
                    className="mt-3.5 h-12 w-full rounded-2xl bg-[#4f9149] text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all hover:bg-[#457f40] active:translate-y-0.5 active:shadow-none"
                  >
                    Buddy up
                  </button>
                </div>

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
