'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, X, UserMinus, Users, Check, Loader2, Clock } from 'lucide-react';
import useSWR from 'swr';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { FriendFocusScene } from '@/components/ui/FriendFocusScene';
import { hapticImpact } from '@/lib/haptics';
import Fly from '@/components/ui/fly';
import {
  useBackgrounds,
  DEFAULT_BACKGROUND_IMAGES,
  type BackgroundImages,
} from '@/hooks/useBackgrounds';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import {
  contributionFrom,
  type FriendSummary,
  type FriendEquippedItem,
} from '@/lib/friends/indices';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { useInventory, mutateInventoryCaches } from '@/hooks/useInventory';
import { mutateBackgrounds } from '@/hooks/useBackgrounds';
import type { BackgroundItem } from '@/hooks/useBackgrounds';
import type { Rarity } from '@/lib/skins/catalog';
import { RarityCornerBadge } from '@/components/ui/skins/RarityCornerBadge';
import { DragScrollRow } from '@/components/ui/DragScrollRow';

type PeekTarget =
  | {
      kind: 'item';
      id: string;
      name: string;
      rarity: Rarity;
      price: number;
      slot: FriendEquippedItem['slot'];
      riveIndex: number;
    }
  | {
      kind: 'bg';
      id: string;
      name: string;
      rarity: Rarity;
      price: number;
      image: string;
    };

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
  allFriends,
}: {
  entry: FriendSummary | null;
  onClose: () => void;
  onRemove: (entry: FriendSummary) => void;
  onBuddyUp: (entry: FriendSummary) => void;
  allFriends?: FriendSummary[];
}) {
  useRegisterOpenSheet(!!entry);
  const friendFrogRef = React.useRef<FrogHandle | null>(null);
  const friendFrogBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [friendMouthOpen, setFriendMouthOpen] = useState(false);
  const { data } = useBackgrounds(!!entry);
  const { data: inventoryData } = useInventory(!!entry);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyBond, setBusyBond] = useState<string | null>(null);
  const [peekTarget, setPeekTarget] = useState<PeekTarget | null>(null);

  useEffect(() => {
    if (!entry) setPeekTarget(null);
  }, [entry]);

  const friendBackground = useMemo<BackgroundItem | null>(() => {
    if (!entry?.backgroundId || !data?.catalog) return null;
    return data.catalog.find((b) => b.id === entry.backgroundId) ?? null;
  }, [entry?.backgroundId, data?.catalog]);

  const ownsPeekTarget = useMemo(() => {
    if (!peekTarget) return false;
    if (peekTarget.kind === 'item')
      return (inventoryData?.wardrobe?.inventory?.[peekTarget.id] ?? 0) > 0;
    return ((data?.inventory as Record<string, number>)?.[peekTarget.id] ?? 0) > 0;
  }, [peekTarget, inventoryData?.wardrobe?.inventory, data?.inventory]);

  const wearingPeekTarget = useMemo(() => {
    if (!peekTarget) return false;
    if (peekTarget.kind === 'item')
      return (
        inventoryData?.wardrobe?.equipped?.[peekTarget.slot] === peekTarget.id
      );
    return data?.equipped === peekTarget.id;
  }, [peekTarget, inventoryData?.wardrobe?.equipped, data?.equipped]);

  const equipPeekTarget = async () => {
    if (!peekTarget) return false;
    hapticImpact();
    const res =
      peekTarget.kind === 'item'
        ? await fetch('/api/skins/inventory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slot: peekTarget.slot,
              itemId: peekTarget.id,
            }),
          })
        : await fetch('/api/backgrounds/equip', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: peekTarget.id }),
          });
    if (!res.ok) return false;
    mutateInventoryCaches();
    mutateBackgrounds();
    mutateFriendsCaches();
    return true;
  };

  const wearerNames = useMemo(() => {
    if (!peekTarget || !allFriends) return [];
    return allFriends
      .filter((f) =>
        peekTarget.kind === 'item'
          ? f.equippedItems?.some((i) => i.id === peekTarget.id)
          : f.backgroundId === peekTarget.id,
      )
      .map((f) => f.name || f.frogName);
  }, [peekTarget, allFriends]);

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
                          className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              onRemove(entry);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
                          >
                            <UserMinus className="h-4 w-4" />
                            Remove friend
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Focusing right now — flies + tongue lunges over the banner */}
                <FriendFocusScene
                  frogRef={friendFrogRef}
                  frogBoxRef={friendFrogBoxRef}
                  active={!!entry.focusing}
                  onGrabActive={setFriendMouthOpen}
                />

                {/* Frog — sits above the white sheet below it */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
                  <div ref={friendFrogBoxRef} className="relative -translate-y-[26px]">
                    <Frog
                      ref={friendFrogRef}
                      width={230}
                      height={210}
                      indices={entry.indices}
                      mouthOpen={friendMouthOpen}
                    />
                    <PremiumFrogAura show={!!entry.premium} />
                  </div>
                </div>
              </div>

              {/* White content sheet overlapping the banner */}
              <div className="relative z-10 -mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-t-[24px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5">
                <div className="text-center">
                  <h2 className="flex items-center justify-center gap-1.5 text-xl font-black tracking-tight text-foreground">
                    <span className={cn(entry.premium && 'plus-name-shimmer')}>
                      {entry.name || entry.frogName}
                    </span>
                    {entry.premium && (
                      <Icon
                        name="frogPlus"
                        label="Frogress Plus"
                        className="h-8 w-8 shrink-0"
                      />
                    )}
                  </h2>
                  {entry.name &&
                    entry.frogName &&
                    entry.name !== entry.frogName && (
                      <p className="text-sm font-semibold text-muted-foreground">
                        {entry.frogName}
                      </p>
                    )}
                </div>

                {/* Live focus presence — indicator only for now */}
                {entry.focusing && (
                  <div className="flex items-center justify-center gap-2 rounded-2xl bg-primary/10 px-4 py-3">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                    </span>
                    <span className="text-sm font-black text-primary">
                      Focusing right now
                    </span>
                  </div>
                )}

                {/* Flies shared stats */}
                <div className="grid grid-cols-2 gap-2.5">
                  <FlyStat label="Shared today" value={today} />
                  <FlyStat label="Shared total" value={total} />
                </div>

                {/* Friend's equipped look */}
                {((entry.equippedItems?.length ?? 0) > 0 ||
                  friendBackground) && (
                  <div className="flex flex-col gap-2">
                    <p className="px-1 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                      Their look
                    </p>
                    <DragScrollRow className="gap-2 px-1 pt-1">
                      {(entry.equippedItems ?? []).map((item) => (
                        <LookChip
                          key={item.id}
                          name={item.name}
                          rarity={item.rarity}
                          preview={
                            <FrogSnapshot
                              className="h-[125%] w-[125%] object-contain"
                              indices={{ [item.slot]: item.riveIndex }}
                              width={180}
                              height={180}
                            />
                          }
                          onClick={() =>
                            setPeekTarget({
                              kind: 'item',
                              id: item.id,
                              name: item.name,
                              rarity: item.rarity,
                              price: item.priceFlies,
                              slot: item.slot,
                              riveIndex: item.riveIndex,
                            })
                          }
                        />
                      ))}
                      {friendBackground && (
                        <LookChip
                          name={friendBackground.name}
                          rarity={friendBackground.rarity}
                          preview={
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                friendBackground.images.mobile ||
                                friendBackground.images.web ||
                                ''
                              }
                              alt={friendBackground.name}
                              className="h-full w-full object-cover"
                            />
                          }
                          onClick={() =>
                            setPeekTarget({
                              kind: 'bg',
                              id: friendBackground.id,
                              name: friendBackground.name,
                              rarity: friendBackground.rarity,
                              price: friendBackground.priceFlies,
                              image:
                                friendBackground.images.mobile ||
                                friendBackground.images.web ||
                                '',
                            })
                          }
                        />
                      )}
                    </DragScrollRow>
                  </div>
                )}

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
                        <p className="text-sm font-black text-foreground">
                          {inv.withName} invited you
                        </p>
                        <p className="truncate text-[13px] font-semibold text-muted-foreground">
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
                  <p className="text-base font-black tracking-tight text-foreground">
                    Building habits is better together
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-muted-foreground">
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

          <ItemPeekSheet
            target={peekTarget}
            onClose={() => setPeekTarget(null)}
            friendName={entry.name || entry.frogName}
            wearerNames={wearerNames}
            owned={ownsPeekTarget}
            wearing={wearingPeekTarget}
            onEquip={equipPeekTarget}
            balance={inventoryData?.wardrobe?.flies ?? 0}
          />
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function LookChip({
  name,
  rarity,
  preview,
  onClick,
}: {
  name: string;
  rarity: Rarity;
  preview: React.ReactNode;
  onClick: () => void;
}) {
  const config = RARITY_CONFIG[rarity];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${name}`}
      className={cn(
        'relative flex w-[168px] shrink-0 flex-col items-stretch overflow-hidden rounded-2xl border-[3px] p-2.5 text-left shadow-sm transition-transform active:scale-[0.97]',
        config.border,
        config.bg,
      )}
    >
      <RarityCornerBadge rarity={rarity} />
      <div className="mt-4 flex aspect-[1/0.75] w-full items-end justify-center overflow-hidden rounded-xl bg-muted/40">
        {preview}
      </div>
    </button>
  );
}

function ItemPeekSheet({
  target,
  onClose,
  friendName,
  wearerNames,
  owned,
  wearing,
  onEquip,
  balance,
}: {
  target: PeekTarget | null;
  onClose: () => void;
  friendName: string;
  wearerNames: string[];
  owned: boolean;
  wearing: boolean;
  onEquip: () => Promise<boolean>;
  balance: number;
}) {
  const router = useRouter();
  const openFlyShop = useUIStore((s) => s.openFlyShop);
  const [equipping, setEquipping] = useState(false);
  const [equipDone, setEquipDone] = useState(false);
  useEffect(() => {
    setEquipping(false);
    setEquipDone(false);
  }, [target?.id]);
  const handleEquip = async () => {
    if (equipping) return;
    setEquipping(true);
    const ok = await onEquip();
    setEquipping(false);
    if (ok) setEquipDone(true);
  };
  const config = target ? RARITY_CONFIG[target.rarity] : RARITY_CONFIG.common;
  const price = target?.price ?? 0;
  const shortfall = Math.max(0, price - balance);
  const scarcity =
    wearerNames.length <= 1
      ? `Only ${friendName} wears this among your friends`
      : `${wearerNames.length} of your friends wear this`;

  return (
    <BaseSheet
      open={!!target}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      className="select-none sm:max-w-[400px]"
      zIndex={1600}
      closeAriaLabel="Close item details"
    >
      {() =>
        target ? (
          <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6 sm:pb-6 sm:pt-7">
            <div className="flex items-center gap-2 pr-12">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {target.kind === 'bg' ? 'Background' : 'Wardrobe item'}
              </span>
            </div>

            <div
              className={cn(
                'relative mx-auto mt-4 flex aspect-square w-full max-w-[260px] items-end justify-center overflow-hidden rounded-[28px] border-2 bg-gradient-to-br',
                config.border,
                config.gradient,
              )}
            >
              <RarityCornerBadge rarity={target.rarity} />
              {target.kind === 'item' ? (
                <FrogSnapshot
                  className="h-[118%] w-[118%] -translate-y-[12%] object-contain"
                  indices={{ [target.slot]: target.riveIndex }}
                  width={260}
                  height={260}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={target.image}
                  alt={target.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <h2 className="sr-only">
              {target.name}
            </h2>
            <p className="mt-4 text-center text-[13px] font-semibold text-muted-foreground">
              {scarcity}
            </p>

            {owned ? (
              wearing || equipDone ? (
                <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/60 bg-emerald-50 px-4 py-3.5 text-center text-sm font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <Check className="h-4 w-4" strokeWidth={3} />
                  You&apos;re wearing it!
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleEquip}
                  disabled={equipping}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all hover:bg-[#457f40] active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                >
                  {equipping ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>You own this — wear it now</>
                  )}
                </button>
              )
            ) : (
              <>
                <div className="mt-4 rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm font-bold">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Shop price</span>
                    <span className="inline-flex items-center gap-1.5 font-black tabular-nums">
                      <Fly size={16} paused y={-2} />
                      {price.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">Your flies</span>
                    <span className="inline-flex items-center gap-1.5 font-black tabular-nums">
                      <Fly size={16} paused y={-2} />
                      {balance.toLocaleString()}
                    </span>
                  </div>
                  {shortfall === 0 && (
                    <p className="mt-2.5 text-center text-[13px] font-black text-emerald-600">
                      You can afford it right now!
                    </p>
                  )}
                </div>

                {shortfall === 0 ? (
                  <button
                    type="button"
                    onClick={() => router.push('/wardrobe?tab=shop')}
                    className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all hover:bg-[#457f40] active:translate-y-0.5 active:shadow-none"
                  >
                    Get it in your shop
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={openFlyShop}
                      className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all hover:bg-[#457f40] active:translate-y-0.5 active:shadow-none"
                    >
                      Get
                      <Fly size={28} y={-2} alwaysPlay />
                      <span className="tabular-nums">
                        {shortfall.toLocaleString()}
                      </span>
                      more flies
                    </button>
                    <p className="mt-2.5 text-center text-[11px] font-medium text-muted-foreground">
                      Or earn flies by completing tasks, then grab it in your
                      shop.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        ) : null
      }
    </BaseSheet>
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
