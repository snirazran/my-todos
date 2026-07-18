'use client';

import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  UserPlus,
  Bell,
  UserMinus,
  Loader2,
  Flame,
  Gift,
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
import { hapticCelebrate, hapticTick } from '@/lib/haptics';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { HomeFocusFlies } from '@/components/ui/HomeFocusFlies';
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
import {
  mutateInventoryCaches,
  patchInventoryFlies,
  useInventory,
} from '@/hooks/useInventory';
import { markFlyEarn } from '@/lib/flyEarn';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { MobileHeaderActions } from '@/components/ui/MobileHeaderActions';
import { MobileMenuCluster } from '@/components/ui/siteHeader';
import { FlyCatchSwipeLauncher } from '@/components/ui/FlyCatchSwipeLauncher';
import { useUIStore } from '@/lib/uiStore';
import { showRewardedAd } from '@/lib/ads';
import type { ItemDef } from '@/lib/skins/catalog';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type LeaderboardEntry = FriendSummary & { isYou?: boolean };

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
        if (typeof flyBalance === 'number') {
          patchInventoryFlies(flyBalance + granted);
        }
        mutateInventoryCaches();
        await mutateFriends();
        setClaimReward(granted);
      }
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimable, tz, mutateFriends, flyBalance]);

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
  const leaderboard: LeaderboardEntry[] = [
    ...friends,
    ...(friendsData?.me ? [{ ...friendsData.me, isYou: true }] : []),
  ].sort(
    (a, b) =>
      b.fliesToday - a.fliesToday ||
      (b.streak ?? 0) - (a.streak ?? 0) ||
      (a.name || a.frogName).localeCompare(b.name || b.frogName),
  );
  const receivedToday =
    friendsData?.contribution?.receivedToday ??
    friends.reduce((sum, f) => sum + sharedFrom(f), 0);
  const topStreak = friends.reduce((max, f) => Math.max(max, f.streak ?? 0), 0);

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12">
      <h1 className="sr-only">Friends</h1>
      <div className="relative z-10 mx-auto flex w-full flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:max-w-2xl md:pt-11">
        <MobileMenuCluster position="absolute" />
        {/* Friend invites — persistent, over the winter scene */}
        <MobileHeaderActions
          position="absolute"
          visibleOnDesktop
          className="md:top-[calc(env(safe-area-inset-top)+0.75rem)]"
        >
          <StyleShuffleHeaderButton className="border-0 bg-card/90 shadow-md ring-1 ring-border/60 md:hidden" />
          <button
            type="button"
            onClick={() => setInboxOpen(true)}
            aria-label="Friend invites"
            className="relative flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-card/90 text-primary shadow-md ring-1 ring-border/60 backdrop-blur-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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

        <FlyCatchSwipeLauncher source="friends" className="flex flex-col items-center">
          {/* Self frog */}
          <SelfFrog
            indices={{ ...indices, mood: isFrogHungry ? 1 : 0 }}
            paused={isAnyPanelOpen}
          />

          {/* Primary growth action — one solid perch under the frog. */}
          <button
            type="button"
            data-fly-fade
            onClick={() => setInviteOpen(true)}
            className="relative z-20 -mt-3 flex min-h-14 w-[min(21rem,84vw)] touch-manipulation items-center justify-center gap-3 rounded-[20px] bg-[#4f9149] px-6 py-3 text-left text-white shadow-[0_5px_0_#34631f] transition-[transform,filter,box-shadow] hover:brightness-105 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#4f9149]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Gift className="h-5 w-5" strokeWidth={2.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-black tracking-tight">
                Invite friends
              </span>
              <span className="block text-[11px] font-bold text-white/80">
                Send a skin · unlock rewards
              </span>
            </span>
          </button>
        </FlyCatchSwipeLauncher>

        {/* Rising sheet */}
        <div data-fly-sheet className="relative z-10 -mx-4 mt-8 flex w-[calc(100%+2rem)] flex-col self-stretch rounded-t-[24px] bg-background px-4 pb-12 pt-5 md:mt-24 md:px-8">
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
          <div className="mb-5 w-full" data-hint="invite-friend">
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
              <StatTile
                value={receivedToday}
                label="Flies for you today"
                compactLabel="Flies today"
                highlight
              />
              <StatTile
                value={topStreak}
                label="Top friend streak"
                compactLabel="Best streak"
                flame={topStreak > 0}
              />
            </div>
          )}

          {/* Leaderboard — visible competition plus each friend's contribution. */}
          <div className="w-full">
            <div className="mb-2.5 flex items-center justify-between gap-2 px-1.5 min-[360px]:gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-black tracking-tight text-foreground">
                  Today&apos;s pond
                </h2>
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.11em] text-muted-foreground min-[360px]:text-[11px] min-[360px]:tracking-[0.14em]">
                  Catches · tap for looks
                </p>
              </div>
              <button
                type="button"
                aria-label="Add friend"
                onClick={() => setAddOpen(true)}
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-[#4f9149]/25 bg-[#4f9149]/8 px-0 text-xs font-black text-[#4f9149] transition-colors hover:bg-[#4f9149]/14 active:bg-[#4f9149]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149] focus-visible:ring-offset-2 min-[360px]:w-auto min-[360px]:px-3"
              >
                <UserPlus className="h-4 w-4" strokeWidth={2.75} />
                <span className="hidden min-[360px]:inline">Add</span>
              </button>
            </div>

            <div
              className="w-full overflow-hidden rounded-[18px] border border-border/50 bg-card/40 p-1.5 shadow-sm"
              data-hint="friends-list"
            >
              {!friendsData ? (
                <FriendsLeaderboardSkeleton rows={3} />
              ) : (
                <>
                  {leaderboard.length > 0 && (
                    <ul className="flex flex-col gap-1.5">
                      {leaderboard.map((entry, i) => (
                        <LeaderboardRow
                          key={entry.userId}
                          entry={entry}
                          rank={i + 1}
                          buddyInvites={
                            entry.isYou
                              ? 0
                              : (buddyInviteByFriend.get(entry.userId) ?? 0)
                          }
                          onOpen={() =>
                            entry.isYou
                              ? router.push('/wardrobe')
                              : setDetailTarget(entry)
                          }
                          paused={isAnyPanelOpen}
                        />
                      ))}
                    </ul>
                  )}
                  {!hasRealFriends && (
                    <div className="mx-1 mt-1.5 flex items-center gap-3 rounded-xl border border-dashed border-[#4f9149]/30 bg-[#4f9149]/5 px-3 py-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4f9149]/12 text-[#4f9149]">
                        <UserPlus className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black tracking-tight text-foreground">
                          Your frog needs a crew
                        </p>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Compare looks and collect half their daily catch.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInviteOpen(true)}
                        className="min-h-11 shrink-0 touch-manipulation rounded-xl bg-[#4f9149] px-3 text-xs font-black text-white shadow-[0_3px_0_#34631f] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149] focus-visible:ring-offset-2"
                      >
                        Invite
                      </button>
                    </div>
                  )}
                </>
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
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-base font-black tracking-tight text-white shadow-[0_5px_0_#be123c] transition-[background-color,transform,box-shadow,opacity] hover:bg-rose-600 active:translate-y-0.5 disabled:opacity-60"
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
  compactLabel,
  highlight = false,
  flame = false,
}: {
  value: number;
  label: string;
  compactLabel?: string;
  highlight?: boolean;
  flame?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border px-1 py-2.5 text-center min-[360px]:px-2',
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
      <span className="mt-1 text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-muted-foreground min-[360px]:text-[10px] min-[360px]:tracking-[0.1em]">
        <span className={cn(compactLabel && 'min-[360px]:hidden')}>
          {compactLabel ?? label}
        </span>
        {compactLabel && (
          <span className="hidden min-[360px]:inline">{label}</span>
        )}
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
      className="group mb-5 flex w-full touch-manipulation items-center gap-3 overflow-hidden rounded-[20px] border border-primary/30 bg-gradient-to-br from-emerald-50 to-emerald-100/70 px-4 py-3.5 text-left shadow-sm dark:from-primary/15 dark:to-primary/5 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
      <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-5 text-[11px] font-black uppercase tracking-[0.15em] text-white shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow] group-hover:-translate-y-[1px] group-hover:shadow-[0_4px_0_0_#b45309] group-active:translate-y-[2px] group-active:shadow-none">
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

  React.useEffect(() => {
    hapticCelebrate();
  }, []);
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
  const look = entry.flexRarity ? RARITY_CONFIG[entry.flexRarity] : null;
  const flex =
    entry.flexRarity && rarityRank[entry.flexRarity] >= rarityRank.epic
      ? RARITY_CONFIG[entry.flexRarity]
      : null;
  const medal =
    entry.fliesToday > 0 && rank && rank <= 3
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
        onClick={() => {
          hapticTick();
          onOpen();
        }}
        className={cn(
          'relative flex w-full touch-manipulation items-center gap-1 rounded-xl border bg-card py-1.5 pl-1 pr-1.5 text-left transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 min-[360px]:gap-2 min-[360px]:pl-1.5 min-[360px]:pr-2.5 sm:gap-2.5 sm:py-2 sm:pr-3',
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
          className="relative flex aspect-[6/5] w-[34%] min-w-[82px] max-w-[150px] shrink-0 items-end justify-center self-center overflow-hidden min-[360px]:w-[37%] min-[360px]:min-w-[94px] sm:w-[40%] sm:min-w-[110px] sm:max-w-[224px]"
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
            compact
            flySize={rowFlySize}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 text-[13px] font-black leading-tight tracking-tight text-foreground min-[360px]:text-sm sm:text-base">
            <span
              className={cn('truncate', entry.premium && 'plus-name-shimmer')}
            >
              {entry.name || entry.frogName}
            </span>
            {entry.isYou && (
              <span className="rounded-full bg-[#4f9149]/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#4f9149]">
                You
              </span>
            )}
            {entry.premium && (
              <Icon
                name="frogPlus"
                label="Frogress Plus"
                className="h-5 w-5 shrink-0 min-[360px]:h-6 min-[360px]:w-6 sm:h-8 sm:w-8"
              />
            )}
          </p>
          {entry.name && entry.frogName && entry.name !== entry.frogName && (
            <p className="truncate text-xs font-semibold text-muted-foreground">
              {entry.frogName}
            </p>
          )}
          <div className="mt-1 flex flex-col items-start gap-1 min-[360px]:flex-row min-[360px]:flex-wrap min-[360px]:items-center">
            {(entry.streak ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-black text-orange-500">
                <Flame className="h-3 w-3 fill-orange-400" />
                {entry.streak}d
              </span>
            )}
            {look && (entry.equippedItems?.length ?? 0) > 0 && (
              <span
                className={cn(
                  'max-w-full truncate whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-black',
                  look.bg,
                  look.text,
                )}
              >
                {look.label}
                <span className="hidden min-[360px]:inline"> look</span>
              </span>
            )}
          </div>
          {entry.focusing && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-black text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Focusing now
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 min-[360px]:gap-1.5">
          <span
            className={cn(
              'flex min-w-[46px] flex-col items-center rounded-xl px-1 py-1 min-[360px]:min-w-[58px] min-[360px]:px-2',
              entry.fliesToday > 0
                ? 'bg-emerald-500/10'
                : 'bg-muted/60 opacity-70',
            )}
          >
            <span className="flex items-center gap-0.5">
              <span className={cn(entry.fliesToday <= 0 && 'grayscale')}>
                <Fly size={20} y={-2} interactive={false} paused={paused} />
              </span>
              <span
                className={cn(
                  'text-sm font-black tabular-nums leading-none min-[360px]:text-base sm:text-lg',
                  entry.fliesToday > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground',
                )}
              >
                {entry.fliesToday}
              </span>
            </span>
            <span className="mt-0.5 whitespace-nowrap text-[7px] font-black uppercase tracking-[0.06em] text-muted-foreground min-[360px]:text-[8px] min-[360px]:tracking-[0.08em]">
              {entry.isYou
                ? 'your catch'
                : shared > 0
                  ? `+${shared} to you`
                  : 'caught'}
            </span>
          </span>
          <ChevronRight className="hidden h-5 w-5 text-muted-foreground/60 min-[380px]:block" />
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
  const pending = status?.pendingCount ?? 0;
  const nextReward = rewards.find((r) => r.tier > claimed) ?? null;
  const previewReward = nextReward ?? rewards[rewards.length - 1] ?? null;
  const item = previewReward?.item ?? null;
  const isOutfit = !!item && item.slot !== 'container';
  const completedAllRewards = rewards.length > 0 && !nextReward;
  const target =
    nextReward?.tier ?? previewReward?.tier ?? Math.max(1, claimed);
  const needed = Math.max(0, target - claimed);
  const progress = completedAllRewards
    ? 100
    : Math.min(100, Math.round((claimed / Math.max(1, target)) * 100));

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full touch-manipulation items-center gap-2 rounded-[18px] border border-[#4f9149]/25 bg-[#4f9149]/5 px-2.5 py-3 text-left shadow-sm transition-[transform,border-color,box-shadow] hover:border-[#4f9149]/45 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149] focus-visible:ring-offset-2 min-[360px]:gap-3 min-[360px]:px-3.5"
    >
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center self-center overflow-hidden rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/15 min-[360px]:h-16 min-[360px]:w-16">
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
        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-[#4f9149] min-[360px]:text-[11px] min-[360px]:tracking-[0.14em]">
          Invite · gift · unlock
        </p>
        <p className="text-xs font-black leading-tight tracking-tight text-foreground min-[360px]:text-sm sm:text-base">
          {nextReward
            ? `${needed} more ${needed === 1 ? 'friend' : 'friends'} unlocks ${item?.name ?? nextReward.label}`
            : 'Keep growing your pond'}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span
            role="progressbar"
            aria-label="Invite reward progress"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(claimed, target)}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#4f9149]/15"
          >
            <span
              className="block h-full w-full origin-left rounded-full bg-[#4f9149] transition-transform duration-300"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </span>
          <span className="shrink-0 text-[10px] font-black tabular-nums text-muted-foreground">
            {completedAllRewards ? `${claimed} joined` : `${claimed}/${target} joined`}
          </span>
        </div>
        {pending > 0 && (
          <p className="mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            {pending} {pending === 1 ? 'gift is' : 'gifts are'} waiting to be claimed
          </p>
        )}
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4f9149] text-white shadow-sm transition-transform group-hover:translate-x-0.5 min-[360px]:h-9 min-[360px]:w-9">
        <ChevronRight className="h-4 w-4 min-[360px]:h-5 min-[360px]:w-5" strokeWidth={2.5} />
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
  const frogRef = useRef<FrogHandle | null>(null);
  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  const [mouthOpen, setMouthOpen] = useState(false);
  return (
    <div
      ref={frogBoxRef}
      data-fly-hero
      className="pointer-events-none relative z-30 flex shrink-0 origin-bottom flex-col items-center md:scale-110 lg:scale-100"
    >
      <HomeFocusFlies
        frogRef={frogRef}
        frogBoxRef={frogBoxRef}
        onGrabActive={setMouthOpen}
      />
      <div data-fly-hero-frog>
        <Frog
          ref={frogRef}
          width={240}
          height={270}
          indices={indices}
          paused={paused}
          mouthOpen={mouthOpen}
        />
      </div>
      <PremiumFrogAura />
    </div>
  );
}
