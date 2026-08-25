'use client';

import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Bell, UserMinus, UserPlus, Loader2 } from 'lucide-react';
import { StyleShuffleHeaderButton } from '@/components/ui/SkinRotation';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useFrogBelly, useIsFrogHungry } from '@/hooks/useFrogHunger';
import { useRegisterOpenSheet, useSheetStore } from '@/lib/sheetStore';
import { hapticCelebrate } from '@/lib/haptics';
import Fly from '@/components/ui/fly';
import {
  FriendsPageSkeleton,
  FriendsLeaderboardSkeleton,
} from '@/components/ui/Skeleton';
import { AddFriendsSheet } from '@/components/ui/AddFriendsSheet';
import { useIdleImageWarmup } from '@/lib/imageWarmup';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { FriendRequestsInbox } from '@/components/ui/FriendRequestsInbox';
import { FriendDetailModal } from '@/components/ui/FriendDetailModal';
import { BuddyUpFlow } from '@/components/ui/BuddyUpFlow';
import { BuddyNudgeSheet } from '@/components/ui/BuddyNudgeSheet';
import { type FriendSummary } from '@/lib/friends/indices';
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
import {
  MobileHeaderActions,
  HEADER_CONTROL_ICON_BUTTON,
} from '@/components/ui/MobileHeaderActions';
import { MobileMenuCluster } from '@/components/ui/siteHeader';
import { FlyCatchSwipeLauncher } from '@/components/ui/FlyCatchSwipeLauncher';
import { useUIStore } from '@/lib/uiStore';
import type { ItemDef } from '@/lib/skins/catalog';
import { PondHero } from '@/components/ui/friends/PondHero';
import { FriendsTodayStrip } from '@/components/ui/friends/FriendsTodayStrip';
import {
  FriendRow,
  type FriendRowEntry,
} from '@/components/ui/friends/FriendRow';
import { GrowPondCard } from '@/components/ui/friends/GrowPondCard';
import { CheerEarnHint } from '@/components/ui/friends/CheerButton';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const FRIENDS_SHEET_ART = ['/friend-share.webp'] as const;

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
  const belly = useFrogBelly(!!user);
  const { data: friendsData, mutate: mutateFriends } = useSWR<{
    friends: FriendSummary[];
    me: FriendSummary | null;
    claimable?: number;
    gate?: { required: number; done: number; open: boolean };
    contribution?: { receivedToday: number };
  }>(user ? `/api/friends?tz=${encodeURIComponent(tz)}` : null, fetcher, {
    revalidateOnFocus: false,
  });
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
  useIdleImageWarmup(FRIENDS_SHEET_ART);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimReward, setClaimReward] = useState<{
    amount: number;
    doubled: boolean;
  } | null>(null);
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
  const gate = friendsData?.gate;

  const handleClaim = React.useCallback(async () => {
    if (claiming || claimable <= 0 || gate?.open === false) return;
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
        setClaimReward({ amount: granted, doubled: !!data?.doubled });
      }
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimable, gate?.open, tz, mutateFriends, flyBalance]);

  const openInbox = React.useCallback(() => setInboxOpen(true), []);
  const openFriend = React.useCallback(
    (friend: FriendSummary) => setDetailTarget(friend),
    [],
  );

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const friends = React.useMemo(
    () => friendsData?.friends ?? [],
    [friendsData?.friends],
  );

  const rows: FriendRowEntry[] = React.useMemo(() => {
    const all: FriendRowEntry[] = [
      ...friends,
      ...(friendsData?.me ? [{ ...friendsData.me, isYou: true }] : []),
    ];
    return all.sort(
      (a, b) =>
        b.fliesToday - a.fliesToday ||
        (b.streak ?? 0) - (a.streak ?? 0) ||
        (a.name || a.frogName).localeCompare(b.name || b.frogName),
    );
  }, [friends, friendsData?.me]);

  if (loading || !user) return <FriendsPageSkeleton />;

  const hasRealFriends = friends.length > 0;
  const pendingCount = requestsData?.incoming?.length ?? 0;
  const buddyInviteCount = buddyInvitesData?.incoming?.length ?? 0;
  const alertsCount = pendingCount + buddyInviteCount;

  const growCard = (
    <GrowPondCard
      onInvite={() => setInviteOpen(true)}
      onAdd={() => setAddOpen(true)}
      enabled={!!user}
      paused={isAnyPanelOpen}
    />
  );

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12">
      <h1 className="sr-only">Friends</h1>
      <div className="relative z-10 mx-auto flex w-full flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:max-w-2xl md:pt-11 lg:max-w-5xl">
        <MobileMenuCluster position="absolute" />
        <MobileHeaderActions
          position="absolute"
          visibleOnDesktop
          className="md:top-[calc(env(safe-area-inset-top)+0.75rem)]"
        >
          <StyleShuffleHeaderButton className="md:hidden" />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add friends"
            className={cn(
              HEADER_CONTROL_ICON_BUTTON,
              'touch-manipulation text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            )}
          >
            <UserPlus className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={openInbox}
            aria-label="Friend invites"
            className={cn(
              HEADER_CONTROL_ICON_BUTTON,
              'relative touch-manipulation text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            )}
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
                onClick={() => openFlyShop()}
                showGoal
              />
            </div>
          )}
        </MobileHeaderActions>

        <FlyCatchSwipeLauncher
          source="friends"
          className="flex flex-col items-center"
        >
          <PondHero
            indices={{ ...indices, mood: isFrogHungry ? 1 : 0 }}
            paused={isAnyPanelOpen}
            claimable={claimable}
            claiming={claiming}
            gate={gate}
            hasFriends={hasRealFriends}
            hunger={belly.hunger}
            maxHunger={belly.maxHunger}
            onClaim={handleClaim}
          />
        </FlyCatchSwipeLauncher>

        <div
          data-fly-sheet
          className="relative z-10 -mx-4 mt-8 flex w-[calc(100%+2rem)] flex-col self-stretch rounded-t-[24px] bg-background px-4 pb-12 pt-6 md:mt-24 md:px-8"
        >
          <FriendsTodayStrip
            friends={friends}
            pendingCount={pendingCount}
            buddyInviteCount={buddyInviteCount}
            onOpenInbox={openInbox}
            onOpenFriend={openFriend}
            ready={!!friendsData}
          />

          {!hasRealFriends && friendsData ? (
            growCard
          ) : (
            <>
              <div className="w-full">
                <div className="mb-3 px-1.5">
                  <h2 className="text-lg font-black tracking-tight text-foreground">
                    Your pond
                  </h2>
                  <CheerEarnHint />
                </div>

                {!friendsData ? (
                  <FriendsLeaderboardSkeleton rows={3} />
                ) : (
                  <ul
                    data-hint="friends-list"
                    className="flex flex-col gap-2 lg:grid lg:grid-cols-2"
                  >
                    {rows.map((entry, i) => (
                      <FriendRow
                        key={entry.userId}
                        entry={entry}
                        rank={i + 1}
                        animate={i === 0}
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
              </div>

              <div className="mt-9">{growCard}</div>
            </>
          )}
        </div>
      </div>

      <AddFriendsSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        indices={indices}
      />
      <InviteFriendsModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <FriendRequestsInbox
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
      />
      {claimReward !== null && (
        <FlyClaimRewardOverlay
          amount={claimReward.amount}
          alreadyDoubled={claimReward.doubled}
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
              className="pointer-events-auto relative max-h-full w-full max-w-sm overflow-y-auto overscroll-contain rounded-[28px] border border-border bg-popover px-6 pb-6 pt-7 text-center text-popover-foreground shadow-2xl"
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
  alreadyDoubled,
  tz,
  onClose,
}: {
  amount: number;
  /** Plus already took the double on the server, so there is nothing to offer. */
  alreadyDoubled: boolean;
  tz: string;
  onClose: () => void;
}) {
  useRegisterOpenSheet(true);
  const [displayAmount, setDisplayAmount] = useState(amount);
  const [doubling, setDoubling] = useState(false);
  const doubledRef = useRef(alreadyDoubled);

  React.useEffect(() => {
    hapticCelebrate();
  }, []);
  const prize = useMemo(() => makeFlyPrize(displayAmount), [displayAmount]);

  const handleWatchAd = async () => {
    if (doubledRef.current || doubling) return;
    setDoubling(true);
    try {
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
            doublePlacement="friend_reward_double"
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
