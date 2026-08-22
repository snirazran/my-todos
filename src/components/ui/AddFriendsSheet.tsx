'use client';

import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useReducedMotion } from 'framer-motion';
import { Search, QrCode, Gift } from 'lucide-react';
import {
  RewardTile,
  type QuestRewardCatalogItem,
} from '@/components/ui/QuestCards';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { EnterFriendCodeModal } from '@/components/ui/EnterFriendCodeModal';
import { QRFriendModal } from '@/components/ui/QRFriendModal';
import { FriendSuggestionsRow } from '@/components/ui/FriendSuggestionsRow';
import Fly from '@/components/ui/fly';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type GiftOptionItem = QuestRewardCatalogItem | null;

type InviteConfigResponse = {
  rewards?: { tier: number; item?: { name?: string } }[];
  giftOptions?: { id: string; itemId: string; item: GiftOptionItem }[];
};

/**
 * The welcome gift has no identity until the sender picks one, so the tile
 * cycles the outfits that can actually be sent — the promise is real, the
 * particular outfit is not.
 */
function GiftOutfitRoll({ items }: { items: QuestRewardCatalogItem[] }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduceMotion || items.length <= 1) return;
    const timer = window.setInterval(() => {
      setShown((current) => {
        let next = current;
        while (next === current) next = Math.floor(Math.random() * items.length);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [reduceMotion, items.length]);

  const catalog = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, item])),
    [items],
  );
  const item = items[shown % Math.max(1, items.length)];
  if (!item) return <Gift className="h-6 w-6 text-[#4f9149]" strokeWidth={2.25} />;

  return (
    <RewardTile
      reward={{ type: 'ITEM', itemId: item.id }}
      rewardCatalog={catalog}
      isPremium={false}
      compact
      hideBadge
      className="h-11 w-11 rounded-xl"
      frogClassName="h-[142%] w-[142%] -translate-y-[20%]"
    />
  );
}

export function AddFriendsSheet({
  open,
  onClose,
  indices,
}: {
  open: boolean;
  onClose: () => void;
  indices?: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // "Show progress and what comes next" is the one thing referral screens are
  // consistently faulted for missing — the ladder already exists, so the sheet
  // states where you are on it instead of asking blind.
  const { data: inviteConfig } = useSWR<InviteConfigResponse>(
    open ? '/api/invite/config' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: inviteStatus } = useSWR<{ claimedCount?: number }>(
    open ? '/api/invite/status' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // The rate is admin-tunable, so the pitch reads it live rather than baking a
  // number that can quietly stop being true.
  const { data: friendsData } = useSWR<{
    pond?: { tasksPerGeneration?: number; fliesPerGeneration?: number };
  }>(open ? '/api/friends' : null, fetcher, { revalidateOnFocus: false });
  const perTasks = friendsData?.pond?.tasksPerGeneration ?? 5;
  const perFlies = friendsData?.pond?.fliesPerGeneration ?? 2;

  const giftItems = useMemo(
    () =>
      (inviteConfig?.giftOptions ?? [])
        .map((g) => g.item)
        .filter((item): item is QuestRewardCatalogItem => !!item),
    [inviteConfig],
  );

  const joined = inviteStatus?.claimedCount ?? 0;
  const nextReward =
    (inviteConfig?.rewards ?? [])
      .slice()
      .sort((a, b) => a.tier - b.tier)
      .find((r) => r.tier > joined) ?? null;
  const progressPct = nextReward
    ? Math.min(100, Math.round((joined / Math.max(1, nextReward.tier)) * 100))
    : 0;

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        className="border-0 sm:max-w-lg"
        closeAriaLabel="Close add friends"
        hideHandle
      >
        {({ bindScroll }) => (
          <div
            ref={bindScroll}
            className="flex max-h-[100dvh] flex-col overflow-y-auto overscroll-contain sm:max-h-[calc(100dvh-3rem)]"
          >
            {/* The art carries no copy: text baked over an image gets cropped,
                fights the illustration and can't be sized per screen. It sets
                the mood, the words live on the surface below where they're
                fully legible. */}
            <div className="relative shrink-0">
              <img
                src="/friend-share.webp"
                alt="Frogs passing the flies they catch to each other across a pond"
                className="h-[24dvh] max-h-[230px] w-full object-cover object-center sm:h-[210px] sm:max-h-none"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background to-transparent"
              />
            </div>

            <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-6">
              <h2 className="text-center text-[25px] font-black leading-[1.1] tracking-tight text-foreground min-[400px]:text-[28px]">
                Your friends catch flies for you
              </h2>
              <p className="mx-auto mt-2 max-w-[21rem] text-center text-[13px] font-semibold leading-snug text-muted-foreground min-[400px]:text-sm">
                Every {perTasks} tasks a friend finishes drops {perFlies} flies
                in your pond.
              </p>

              {/* Both sides of the trade, stated plainly — the practice every
                  referral teardown lands on. */}
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-muted/40 px-3 py-3.5 text-center">
                  <span className="text-[11px] font-black text-muted-foreground">
                    They get
                  </span>
                  <span className="flex h-11 items-center justify-center">
                    <GiftOutfitRoll items={giftItems} />
                  </span>
                  <span className="flex min-h-[2.05rem] items-center text-[13px] font-black leading-tight tracking-tight text-foreground">
                    A free outfit
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-muted/40 px-3 py-3.5 text-center">
                  <span className="text-[11px] font-black text-muted-foreground">
                    You get
                  </span>
                  <span className="flex h-11 items-center justify-center">
                    <Fly size={38} interactive={false} paused />
                    <Fly
                      size={38}
                      interactive={false}
                      paused
                      className="-ml-3 translate-y-1"
                    />
                  </span>
                  <span className="flex min-h-[2.05rem] items-center text-[13px] font-black leading-tight tracking-tight text-foreground">
                    {perFlies} flies per {perTasks} tasks
                  </span>
                </div>
              </div>

              {/* One primary action, sized and coloured so nothing competes. */}
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="mt-4 flex h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[17px] font-black tracking-tight text-white ring-1 ring-[#34631f]/40 shadow-[0_4px_0_0_#34631f] transition-all [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#34631f] active:translate-y-1 active:shadow-none sm:h-[60px] sm:text-lg"
              >
                <Gift className="h-5 w-5" strokeWidth={2.5} />
                Invite friends
              </button>

              {nextReward && (
                <div className="mt-2.5 flex items-center gap-2.5 px-1">
                  <span
                    role="progressbar"
                    aria-label="Invite reward progress"
                    aria-valuemin={0}
                    aria-valuemax={nextReward.tier}
                    aria-valuenow={Math.min(joined, nextReward.tier)}
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#4f9149]/15"
                  >
                    <span
                      className="block h-full w-full origin-left rounded-full bg-[#4f9149] transition-transform duration-300"
                      style={{ transform: `scaleX(${progressPct / 100})` }}
                    />
                  </span>
                  <span className="shrink-0 text-[11px] font-black text-muted-foreground">
                    {joined}/{nextReward.tier} joined
                    {nextReward.item?.name ? ` · ${nextReward.item.name}` : ''}
                  </span>
                </div>
              )}

              <FriendSuggestionsRow
                enabled={open}
                variant="embedded"
                className="mt-5"
                title="Already on Frogress"
                subtitle="People you may know — add them in one tap"
              />

              {/* Entry methods, not offers: quiet row, equal weight, out of the
                  way of the action above. */}
              <div className="mt-5 border-t border-border/60 pt-3">
                <p className="mb-2 text-center text-[11px] font-bold text-muted-foreground">
                  Got a friend&apos;s code?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCodeOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-[13px] font-black tracking-tight text-foreground transition-transform active:scale-[0.98] [@media(hover:hover)]:hover:bg-muted/60"
                  >
                    <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.5} />
                    Enter code
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-[13px] font-black tracking-tight text-foreground transition-transform active:scale-[0.98] [@media(hover:hover)]:hover:bg-muted/60"
                  >
                    <QrCode className="h-4 w-4 text-muted-foreground" strokeWidth={2.5} />
                    QR code
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </BaseSheet>

      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <EnterFriendCodeModal open={codeOpen} onClose={() => setCodeOpen(false)} />
      <QRFriendModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        initialTab="mycode"
        indices={indices}
      />
    </>
  );
}
