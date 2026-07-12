'use client';

import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Plus,
  UserPlus,
  Bell,
  UserMinus,
  Loader2,
  Flame,
} from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { StyleShuffleHeaderButton } from '@/components/ui/SkinRotation';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useIsFrogHungry } from '@/hooks/useFrogHunger';
import { useRegisterOpenSheet, useSheetStore } from '@/lib/sheetStore';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import {
  FriendsPageSkeleton,
  FriendsLeaderboardSkeleton,
} from '@/components/ui/Skeleton';
import { AddFriendsSheet } from '@/components/ui/AddFriendsSheet';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { FriendRequestsInbox } from '@/components/ui/FriendRequestsInbox';
import { FriendSuggestionsRow } from '@/components/ui/FriendSuggestionsRow';
import { FriendDetailModal } from '@/components/ui/FriendDetailModal';
import { BuddyUpFlow } from '@/components/ui/BuddyUpFlow';
import { BuddyNudgeSheet } from '@/components/ui/BuddyNudgeSheet';
import { contributionFrom, type FriendSummary } from '@/lib/friends/indices';
import { rarityRank } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';
import { RewardCard } from '@/components/ui/gift-box/RewardCard';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { mutateInventoryCaches, useInventory } from '@/hooks/useInventory';
import { markFlyEarn } from '@/lib/flyEarn';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { MobileHeaderActions } from '@/components/ui/MobileHeaderActions';
import { useUIStore } from '@/lib/uiStore';
import { showRewardedAd } from '@/lib/ads';
import type { ItemDef } from '@/lib/skins/catalog';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type LeaderboardEntry = FriendSummary;

export default function FriendsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const tz = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  const { indices } = useWardrobeIndices(!!user);
  const openFlyShop = useUIStore((s) => s.openFlyShop);
  const { data: inventorySummary } = useInventory(!!user, true);
  const flyBalance = inventorySummary?.wardrobe?.flies;
  const isFrogHungry = useIsFrogHungry(!!user);
  const { data: friendsData, mutate: mutateFriends } = useSWR<{
    friends: FriendSummary[];
    me: FriendSummary | null;
    claimable?: number;
    contribution?: { receivedToday: number };
  }>(
    user ? `/api/friends?tz=${encodeURIComponent(tz)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: buddyInvitesData } = useSWR<{
    incoming: { bondId: string; withUserId: string }[];
  }>(user ? '/api/buddy/invite' : null, fetcher, { revalidateOnFocus: false });
  const buddyInviteByFriend = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of buddyInvitesData?.incoming ?? [])
      m.set(inv.withUserId, (m.get(inv.withUserId) ?? 0) + 1);
    return m;
  }, [buddyInvitesData]);
  const { data: requestsData } = useSWR<{ incoming: { id: string }[] }>(
    user ? '/api/friends/request' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimReward, setClaimReward] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FriendSummary | null>(null);
  const [detailTarget, setDetailTarget] = useState<FriendSummary | null>(null);
  const [buddyTarget, setBuddyTarget] = useState<FriendSummary | null>(null);
  const anySheetOpen = useSheetStore((s) => s.count > 0);
  const isAnyPanelOpen =
    anySheetOpen ||
    addOpen ||
    inviteOpen ||
    inboxOpen ||
    claimReward !== null ||
    !!removeTarget ||
    !!detailTarget ||
    !!buddyTarget;

  const claimable = friendsData?.claimable ?? 0;

  const handleClaim = React.useCallback(async () => {
    if (claiming || claimable <= 0) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/friends/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tz }),
      });
      const data = await res.json();
      const granted = Math.max(0, Math.floor(data?.granted ?? 0));
      if (granted > 0) {
        markFlyEarn();
        mutateInventoryCaches();
        await mutateFriends();
        setClaimReward(granted);
      }
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimable, tz, mutateFriends]);

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <FriendsPageSkeleton />;

  const friends = friendsData?.friends ?? [];
  const hasRealFriends = friends.length > 0;
  const pendingCount = requestsData?.incoming?.length ?? 0;
  const buddyInviteCount = buddyInvitesData?.incoming?.length ?? 0;
  const alertsCount = pendingCount + buddyInviteCount;

  const sharedFrom = (f: FriendSummary) =>
    f.givesYou ?? contributionFrom(f.fliesToday);
  const leaderboard: LeaderboardEntry[] = [...friends].sort(
    (a, b) =>
      sharedFrom(b) - sharedFrom(a) ||
      (a.name || a.frogName).localeCompare(b.name || b.frogName),
  );
  const receivedToday =
    friendsData?.contribution?.receivedToday ??
    leaderboard.reduce((sum, f) => sum + sharedFrom(f), 0);
  const topStreak = friends.reduce((max, f) => Math.max(max, f.streak ?? 0), 0);

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12">
      <div className="relative z-10 mx-auto flex w-full flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:max-w-2xl md:pt-11">
        {/* Friend invites — persistent, over the winter scene */}
        <MobileHeaderActions
          visibleOnDesktop
          className="md:absolute md:top-[calc(env(safe-area-inset-top)+0.75rem)]"
        >
          <StyleShuffleHeaderButton className="border-0 bg-card/90 shadow-md ring-1 ring-border/60 md:hidden" />
          <button
            type="button"
            onClick={() => setInboxOpen(true)}
            aria-label="Friend invites"
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card/90 text-primary shadow-md ring-1 ring-border/60 backdrop-blur-sm transition-transform active:scale-95"
          >
            <Bell className="h-6 w-6" />
            {alertsCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-card bg-rose-500 px-1 text-[10px] font-black text-white">
                {alertsCount > 9 ? '9+' : alertsCount}
              </span>
            )}
          </button>
          {flyBalance !== undefined && (
            <div className="md:hidden">
              <FlyCounter
                balance={flyBalance}
                variant="mobile"
                onClick={openFlyShop}
              />
            </div>
          )}
        </MobileHeaderActions>

        {/* Self frog */}
        <SelfFrog
          indices={{ ...indices, mood: isFrogHungry ? 1 : 0 }}
          paused={isAnyPanelOpen}
        />

        {/* Add friend — frog sits right on top of it */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="relative z-20 -mt-3 flex w-[min(20rem,80vw)] items-center justify-center gap-2 rounded-2xl bg-card px-10 py-3.5 text-lg font-black tracking-tight text-[#4f9149] shadow-lg ring-1 ring-[#4f9149]/30 transition-transform active:scale-[0.98]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4f9149] text-white shadow-sm">
            <Plus className="h-5 w-5" strokeWidth={3} />
          </span>
          Add friend
        </button>

        {/* Rising sheet */}
        <div className="relative z-10 -mx-4 mt-8 flex w-[calc(100%+2rem)] flex-col self-stretch rounded-t-[24px] bg-background px-4 pb-12 pt-5 md:mt-24 md:px-8">
          {/* Claim flies — the page's main action */}
          {hasRealFriends && (
            <ClaimHeroCard
              claimable={claimable}
              claiming={claiming}
              onClaim={handleClaim}
              paused={isAnyPanelOpen}
            />
          )}

          {/* Friend requests — surfaced inline only when there's something to act on */}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setInboxOpen(true)}
              className="mb-4 flex items-center gap-3 rounded-2xl border border-border/50 bg-card/80 px-3.5 py-2.5 text-left shadow-sm backdrop-blur-xl transition-transform active:scale-[0.99]"
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4f9149] text-white">
                <UserPlus className="h-5 w-5" strokeWidth={2.5} />
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full border-2 border-card bg-rose-500 px-1 text-[9px] font-black leading-none text-white">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black tracking-tight text-foreground">
                  {pendingCount === 1 ? '1 friend request' : `${pendingCount} friend requests`}
                </span>
                <span className="block text-xs font-semibold text-muted-foreground">
                  Tap to review
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          )}

          {/* Invite & earn */}
          <div className="mb-5 w-full">
            <InviteRewardBanner
              onClick={() => setInviteOpen(true)}
              paused={isAnyPanelOpen}
            />
          </div>

          {/* Pond report — what friends did for you today */}
          {hasRealFriends && (
            <div className="mb-5 grid w-full grid-cols-3 gap-2">
              <StatTile
                value={friends.length}
                label={friends.length === 1 ? 'Friend' : 'Friends'}
              />
              <StatTile value={receivedToday} label="Flies for you today" highlight />
              <StatTile value={topStreak} label="Top friend streak" flame={topStreak > 0} />
            </div>
          )}

          {/* Leaderboard — focus is how much each friend shares with you */}
          <div className="w-full">
            <div className="mb-2.5 px-1.5">
              <h2 className="text-lg font-black tracking-tight text-foreground">
                Top contributors today
              </h2>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                They catch 2 · you get 1
              </p>
            </div>

            <div className="w-full overflow-hidden rounded-[18px] border border-border/50 bg-card/40 p-1.5 shadow-sm">
              {!friendsData ? (
                <FriendsLeaderboardSkeleton rows={3} />
              ) : hasRealFriends ? (
                <ul className="flex flex-col gap-1.5">
                  {leaderboard.map((entry, i) => (
                    <LeaderboardRow
                      key={`${entry.userId}-${i}`}
                      entry={entry}
                      rank={i + 1}
                      buddyInvites={buddyInviteByFriend.get(entry.userId) ?? 0}
                      onOpen={() => setDetailTarget(entry)}
                      paused={isAnyPanelOpen}
                    />
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center px-4 py-12 text-center">
                  <p className="text-sm font-black tracking-tight text-foreground">
                    No friends yet
                  </p>
                  <p className="mt-1 max-w-[16rem] text-xs font-semibold text-muted-foreground">
                    Friends share the flies they catch — you both earn more
                    together.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="mt-4 rounded-xl bg-[#4f9149] px-5 py-2.5 text-sm font-black tracking-tight text-white shadow-[0_3px_0_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
                  >
                    Add your first friend
                  </button>
                </div>
              )}
            </div>
          </div>

          <FriendSuggestionsRow enabled={!!user} />
        </div>
      </div>

      <AddFriendsSheet open={addOpen} onClose={() => setAddOpen(false)} indices={indices} />
      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <FriendRequestsInbox open={inboxOpen} onClose={() => setInboxOpen(false)} />
      {claimReward !== null && (
        <FlyClaimRewardOverlay
          amount={claimReward}
          tz={tz}
          onClose={() => setClaimReward(null)}
        />
      )}
      <FriendDetailModal
        entry={detailTarget}
        onClose={() => setDetailTarget(null)}
        onRemove={(entry) => {
          setDetailTarget(null);
          setRemoveTarget(entry);
        }}
        onBuddyUp={(entry) => {
          setDetailTarget(null);
          setBuddyTarget(entry);
        }}
        allFriends={friendsData?.friends}
      />
      <BuddyUpFlow
        open={!!buddyTarget}
        friend={buddyTarget}
        onClose={() => setBuddyTarget(null)}
      />
      <RemoveFriendDialog
        target={removeTarget}
        onClose={() => setRemoveTarget(null)}
      />
      <BuddyNudgeSheet
        friends={friends}
        indices={indices}
        ready={!!friendsData}
      />
    </main>
  );
}

function RemoveFriendDialog({
  target,
  onClose,
}: {
  target: FriendSummary | null;
  onClose: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  useRegisterOpenSheet(!!target);

  const handleRemove = async () => {
    if (!target || removing) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: target.userId }),
      });
      if (res.ok) {
        mutateFriendsCaches();
        onClose();
      }
    } finally {
      setRemoving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {target && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={removing ? undefined : onClose}
            className="fixed inset-0 z-[1500] bg-black/70 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-[1501] flex items-center justify-center p-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="pointer-events-auto relative w-full max-w-sm rounded-[28px] border border-border bg-popover px-6 pb-6 pt-7 text-center text-popover-foreground shadow-2xl"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
                <UserMinus className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-black tracking-tight text-foreground">
                Remove friend?
              </h2>
              <p className="mt-1.5 text-[15px] font-medium text-muted-foreground">
                {target.name || target.frogName} will be removed from your
                friends. You can add each other again anytime.
              </p>

              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-base font-black tracking-tight text-white shadow-[0_5px_0_#be123c] transition-all hover:bg-rose-600 active:translate-y-0.5 disabled:opacity-60"
                >
                  {removing && <Loader2 className="h-5 w-5 animate-spin" />}
                  {removing ? 'Removing…' : 'Remove friend'}
                </button>
                <button
                  onClick={onClose}
                  disabled={removing}
                  className="w-full rounded-2xl bg-muted py-3.5 text-base font-black tracking-tight text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
                >
                  Cancel
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

function StatTile({
  value,
  label,
  highlight = false,
  flame = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
  flame?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border px-2 py-2.5 text-center',
        highlight
          ? 'border-primary/30 bg-primary/10'
          : 'border-border/50 bg-card/60',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1 text-xl font-black tabular-nums leading-none tracking-tight',
          highlight
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-foreground',
        )}
      >
        {flame && <Flame className="h-4 w-4 fill-orange-400 text-orange-500" />}
        {value}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function ClaimHeroCard({
  claimable,
  claiming,
  onClaim,
  paused = false,
}: {
  claimable: number;
  claiming: boolean;
  onClaim: () => void;
  paused?: boolean;
}) {
  if (claimable <= 0) {
    return (
      <div className="mb-5 flex w-full items-center gap-3 rounded-[20px] border border-border/50 bg-card/40 px-4 py-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted">
          <Fly size={30} interactive={false} paused={paused} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tracking-tight text-foreground">
            No flies to claim yet
          </p>
          <p className="text-xs font-semibold text-muted-foreground">
            Come back as your friends finish tasks
          </p>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClaim}
      disabled={claiming}
      className="group mb-5 flex w-full items-center gap-3 overflow-hidden rounded-[20px] border border-primary/30 bg-gradient-to-br from-emerald-50 to-emerald-100/70 px-4 py-3.5 text-left shadow-sm dark:from-primary/15 dark:to-primary/5 disabled:opacity-70"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15">
        <Fly size={36} interactive={false} paused={paused} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-black tracking-tight text-foreground">
          {claimable} {claimable === 1 ? 'fly' : 'flies'} ready
        </p>
        <p className="text-xs font-semibold text-muted-foreground">
          Your cut of your friends&apos; catch today
        </p>
      </div>
      <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-5 text-[11px] font-black uppercase tracking-[0.15em] text-white shadow-[0_3px_0_0_#b45309] transition-all group-hover:-translate-y-[1px] group-hover:shadow-[0_4px_0_0_#b45309] group-active:translate-y-[2px] group-active:shadow-none">
        {claiming ? 'Claiming…' : 'Claim'}
      </span>
    </button>
  );
}

function makeFlyPrize(amount: number): ItemDef {
  return {
    id: `friend-flies-${amount}`,
    name: `${amount} ${amount === 1 ? 'Fly' : 'Flies'}`,
    rarity: 'uncommon',
    priceFlies: 0,
    slot: 'hand_item',
    riveIndex: 0,
    icon: '',
  };
}

function FlyClaimRewardOverlay({
  amount,
  tz,
  onClose,
}: {
  amount: number;
  tz: string;
  onClose: () => void;
}) {
  useRegisterOpenSheet(true);
  const [displayAmount, setDisplayAmount] = useState(amount);
  const [doubling, setDoubling] = useState(false);
  const doubledRef = useRef(false);
  const prize = useMemo(() => makeFlyPrize(displayAmount), [displayAmount]);

  const handleWatchAd = async () => {
    if (doubledRef.current || doubling) return;
    setDoubling(true);
    try {
      const outcome = await showRewardedAd('friend_reward_double');
      if (outcome !== 'rewarded') return;
      const res = await fetch('/api/friends/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tz, double: true }),
      });
      const data = await res.json();
      const bonus = Math.max(0, Math.floor(data?.granted ?? 0));
      if (bonus > 0) {
        doubledRef.current = true;
        markFlyEarn();
        mutateInventoryCaches();
        setDisplayAmount((a) => a + bonus);
      }
    } finally {
      setDoubling(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="fly-claim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] flex items-center justify-center px-4"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <RotatingRays colorClass={RARITY_CONFIG.uncommon.rays} />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle, transparent 40%, rgba(2,6,23,0.8) 100%)',
            }}
          />
        </div>
        <div className="relative z-10 flex w-full max-w-md flex-col items-center justify-center p-6">
          <RewardCard
            prize={prize}
            claiming={false}
            onClaim={onClose}
            slotLabel="currency"
            showDoubleUpsell={!doubledRef.current}
            rewardAmount={displayAmount}
            onWatchAd={handleWatchAd}
            customPreview={
              <div className="relative flex h-full w-full items-center justify-center">
                <Fly size={132} interactive={false} />
                <span className="absolute right-3 top-3 z-40 rounded-xl border border-white/20 bg-black/45 px-3 py-1 text-sm font-black text-white shadow-sm backdrop-blur-sm">
                  x{displayAmount}
                </span>
              </div>
            }
          />
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function LeaderboardRow({
  entry,
  onOpen,
  rank,
  buddyInvites = 0,
  paused = false,
}: {
  entry: LeaderboardEntry;
  onOpen: () => void;
  rank?: number;
  buddyInvites?: number;
  paused?: boolean;
}) {
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const [frogBoxWidth, setFrogBoxWidth] = useState(0);
  React.useEffect(() => {
    const el = frogBoxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setFrogBoxWidth(el.clientWidth));
    observer.observe(el);
    setFrogBoxWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const rowFlySize = Math.round(
    Math.min(34, Math.max(26, 26 + (frogBoxWidth - 96) * 0.0625)),
  );
  const shared = entry.givesYou ?? contributionFrom(entry.fliesToday);
  const flex =
    entry.flexRarity && rarityRank[entry.flexRarity] >= rarityRank.epic
      ? RARITY_CONFIG[entry.flexRarity]
      : null;
  const medal =
    shared > 0 && rank && rank <= 3
      ? [
          'bg-amber-400 text-amber-950',
          'bg-slate-300 text-slate-800',
          'bg-amber-700 text-amber-50',
        ][rank - 1]
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'relative flex w-full items-center gap-2 rounded-xl border bg-card py-1.5 pl-1.5 pr-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] sm:gap-2.5 sm:py-2',
          flex
            ? cn('border-2', flex.border, 'shadow-md', flex.glow)
            : 'border-border/50 hover:border-emerald-300',
        )}
      >
        {medal && (
          <span
            className={cn(
              'absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[11px] font-black shadow-sm',
              medal,
            )}
          >
            {rank}
          </span>
        )}
        {buddyInvites > 0 && (
          <span className="absolute -left-1 -top-1 z-20 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-background bg-rose-500 px-1 text-[10px] font-black text-white">
            {buddyInvites > 9 ? '9+' : buddyInvites}
          </span>
        )}
        <div
          ref={frogBoxRef}
          className="relative flex aspect-[6/5] w-[40%] min-w-[96px] max-w-[224px] shrink-0 items-end justify-center self-center overflow-hidden"
        >
          <Frog
            className="translate-y-[15%]"
            width="145%"
            height="145%"
            indices={entry.indices}
            paused={paused}
          />
          <PremiumFrogAura
            show={!!entry.premium}
            paused={paused}
            compact
            flySize={rowFlySize}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-sm font-black leading-tight tracking-tight text-foreground sm:text-base">
            <span
              className={cn('truncate', entry.premium && 'plus-name-shimmer')}
            >
              {entry.name || entry.frogName}
            </span>
            {entry.premium && (
              <Icon
                name="frogPlus"
                label="Frogress Plus"
                className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
              />
            )}
          </p>
          {entry.name && entry.frogName && entry.name !== entry.frogName && (
            <p className="truncate text-xs font-semibold text-muted-foreground">
              {entry.frogName}
            </p>
          )}
          {(entry.streak ?? 0) > 0 && (
            <p className="mt-0.5 flex items-center gap-0.5 text-xs font-black text-orange-500">
              <Flame className="h-3.5 w-3.5 fill-orange-400" />
              {entry.streak}
              <span className="font-bold text-orange-400/80">day streak</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {shared > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 py-1 pl-1.5 pr-2.5">
              <Fly size={26} y={-2} interactive={false} paused={paused} />
              <span className="text-lg font-black tabular-nums leading-none text-emerald-600 dark:text-emerald-400 sm:text-xl">
                +{shared}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-muted/60 py-1 pl-1.5 pr-2.5 opacity-70">
              <span className="grayscale">
                <Fly size={22} y={-2} interactive={false} paused={paused} />
              </span>
              <span className="text-sm font-black tabular-nums leading-none text-muted-foreground">
                +0
              </span>
            </span>
          )}
          <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
        </div>
      </button>
    </li>
  );
}

type RewardItem = {
  id: string;
  name: string;
  slot: 'skin' | 'hat' | 'body' | 'hand_item' | 'container';
  riveIndex: number;
  icon?: string;
};
type RewardTier = { tier: number; label: string; item?: RewardItem | null };
type InviteConfig = { rewards: RewardTier[] };
type InviteStatus = { claimedCount: number; pendingCount: number };

function rewardItemToIndices(
  item: RewardItem,
): Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>> {
  if (item.slot === 'skin') return { skin: item.riveIndex };
  if (item.slot === 'hat') return { hat: item.riveIndex };
  if (item.slot === 'body') return { body: item.riveIndex };
  if (item.slot === 'hand_item') return { hand_item: item.riveIndex };
  return {};
}

function InviteRewardBanner({
  onClick,
  paused = false,
}: {
  onClick: () => void;
  paused?: boolean;
}) {
  const { data: config } = useSWR<InviteConfig>('/api/invite/config', fetcher, {
    revalidateOnFocus: false,
  });
  const { data: status } = useSWR<InviteStatus>('/api/invite/status', fetcher, {
    revalidateOnFocus: false,
  });

  const rewards = config?.rewards ?? [];
  const claimed = status?.claimedCount ?? 0;
  const nextReward =
    rewards.find((r) => r.tier > claimed) ?? rewards[rewards.length - 1] ?? null;
  const item = nextReward?.item ?? null;
  const isOutfit = !!item && item.slot !== 'container';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[18px] border border-[#4f9149]/25 bg-[#4f9149]/5 px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <span className="relative flex h-16 w-16 shrink-0 items-center justify-center self-center overflow-hidden rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/15">
        {isOutfit && item ? (
          <Frog
            className="-translate-y-[14px]"
            width={94}
            height={80}
            indices={rewardItemToIndices(item)}
            paused={paused}
          />
        ) : item?.icon ? (
          <img src={item.icon} alt="" className="h-12 w-12 object-contain" />
        ) : (
          <Fly size={44} y={-2} paused />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#4f9149]">
          Invite &amp; earn
        </p>
        <p className="text-sm font-black leading-tight tracking-tight text-foreground sm:text-base">
          {isOutfit
            ? `Gift a skin, unlock this skin`
            : `Gift a skin to earn rewards`}
        </p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4f9149] text-white shadow-sm">
        <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
      </span>
    </button>
  );
}

function SelfFrog({
  indices,
  paused = false,
}: {
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item' | 'mood', number>>;
  paused?: boolean;
}) {
  return (
    <div className="pointer-events-none relative z-30 flex shrink-0 origin-bottom flex-col items-center md:scale-110 lg:scale-100">
      <Frog width={240} height={270} indices={indices} paused={paused} />
      <PremiumFrogAura paused={paused} />
    </div>
  );
}
