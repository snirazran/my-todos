'use client';

import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Bell, UserMinus, UserPlus, Loader2, Search, Handshake, ChevronRight } from 'lucide-react';
import { StyleShuffleHeaderButton } from '@/components/ui/SkinRotation';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useFrogBelly, useIsFrogHungry } from '@/hooks/useFrogHunger';
import { useLookReactions } from '@/hooks/useLookReactions';
import { useRegisterOpenSheet, useSheetStore } from '@/lib/sheetStore';
import { hapticCelebrate } from '@/lib/haptics';
import Fly from '@/components/ui/fly';
import {
  FriendsPageSkeleton,
} from '@/components/ui/Skeleton';
import { AddFriendsSheet } from '@/components/ui/AddFriendsSheet';
import { useIdleImageWarmup } from '@/lib/imageWarmup';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { FriendRequestsInbox } from '@/components/ui/FriendRequestsInbox';
import { FriendDetailModal } from '@/components/ui/FriendDetailModal';
import { BuddyUpFlow } from '@/components/ui/BuddyUpFlow';
import { BuddyNudgeSheet } from '@/components/ui/BuddyNudgeSheet';
import { BuddyStartFlow } from '@/components/ui/BuddyStartFlow';
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
import { useUIStore } from '@/lib/uiStore';
import type { ItemDef } from '@/lib/skins/catalog';
import { PondHero } from '@/components/ui/friends/PondHero';
import { FriendRow } from '@/components/ui/friends/FriendRow';
import { GrowPondCard } from '@/components/ui/friends/GrowPondCard';
import { SharedHabits, PondFocusSection, KeepsakeShelf, PondSectionTitle } from '@/components/ui/friends/PondSocial';
import { BuddyPickerSheet, KeepsakeSheet, FocusRoomSheet } from '@/components/ui/friends/PondSheets';
import { usePond, pondFetcher } from '@/hooks/usePond';
import { useTaskData } from '@/hooks/useTaskData';
import type { Keepsake } from '@/lib/friends/social';

const fetcher = pondFetcher;

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
  const pond = usePond(!!user);
  const { tasks, toggleTask } = useTaskData({ includeBacklog: false });
  const completedById = useMemo(() => Object.fromEntries(tasks.map((task) => [task.id, task.completed])), [tasks]);
  const { data: friendsData, error: friendsError, mutate: mutateFriends } = useSWR<{
    friends: FriendSummary[];
    me: FriendSummary | null;
    claimable?: number;
    gate?: { required: number; done: number; open: boolean };
    contribution?: { receivedToday: number };
  }>(user ? `/api/friends?tz=${encodeURIComponent(tz)}` : null, fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 15_000,
    refreshWhenHidden: false,
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
  const [buddyPickerOpen, setBuddyPickerOpen] = useState(false);
  const [buddyInviteOpen, setBuddyInviteOpen] = useState(false);
  const [keepsakeTarget, setKeepsakeTarget] = useState<Keepsake | null>(null);
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const anySheetOpen = useSheetStore((s) => s.count > 0);
  const isAnyPanelOpen =
    anySheetOpen ||
    addOpen ||
    inviteOpen ||
    inboxOpen ||
    claimReward !== null ||
    !!removeTarget ||
    !!detailTarget ||
    !!buddyTarget || buddyPickerOpen || buddyInviteOpen || !!keepsakeTarget || roomOpen;

  const claimable = friendsData?.claimable ?? 0;
  const gate = friendsData?.gate;

  const handleClaim = React.useCallback(async () => {
    if (claiming || claimable <= 0 || gate?.open === false) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch('/api/friends/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tz }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not collect your flies. Try again.');
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
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : 'Could not collect your flies. Try again.');
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

  const rows = React.useMemo(() => {
    const buddies = new Set(pond.data?.habits.map((habit) => habit.partnerId) ?? []);
    return [...friends].sort((a, b) =>
      Number(!!buddyInviteByFriend.get(b.userId)) - Number(!!buddyInviteByFriend.get(a.userId)) ||
      Number(!!b.focusing) - Number(!!a.focusing) ||
      Number(buddies.has(b.userId)) - Number(buddies.has(a.userId)) ||
      (a.name || a.frogName).localeCompare(b.name || b.frogName),
    );
  }, [friends, pond.data?.habits, buddyInviteByFriend]);
  const filteredRows = rows.filter((friend) => (friend.name + ' ' + friend.frogName).toLocaleLowerCase().includes(friendSearch.toLocaleLowerCase().trim()));
  const startBuddy = () => friends.length ? setBuddyPickerOpen(true) : setBuddyInviteOpen(true);
  const openRoom = (id?: string) => { pond.clearActionError(); setRoomId(id ?? null); setRoomOpen(true); };

  const { unseenCount: unseenLooks } = useLookReactions(!!user);

  if (loading || !user || (!friendsData && !friendsError)) return <FriendsPageSkeleton />;

  const hasRealFriends = friends.length > 0;
  const pendingCount = requestsData?.incoming?.length ?? 0;
  const buddyInviteCount = buddyInvitesData?.incoming?.length ?? 0;
  const alertsCount = pendingCount + buddyInviteCount + unseenLooks;

  const growCard = () => (
    <GrowPondCard
      onInvite={() => setInviteOpen(true)}
      onAdd={() => setAddOpen(true)}
      enabled={!!user}
      paused={isAnyPanelOpen}
    />
  );

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12">

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-3 pb-4 pt-[calc(3rem+env(safe-area-inset-top))] md:px-6 md:pt-12">
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
            aria-label="Friend alerts"
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

        <PondHero
          indices={{ ...indices, mood: isFrogHungry ? 1 : 0 }}
          paused={isAnyPanelOpen}
          friends={rows}
          claimable={claimable}
          claiming={claiming}
          gate={gate}
          hunger={belly.hunger}
          maxHunger={belly.maxHunger}
          pinnedKeepsakeId={pond.data?.pinnedKeepsakeId ?? friendsData?.me?.pinnedKeepsakeId}
          onClaim={handleClaim}
          onOpenFriend={openFriend}
          onInvite={() => setInviteOpen(true)}
        />
        <div data-fly-sheet className="relative z-20 -mx-3 -mt-12 flex w-[calc(100%+1.5rem)] flex-col gap-6 px-3 pt-16 md:mx-auto md:-mt-6 md:w-full md:max-w-3xl md:px-8 md:pt-14">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-[linear-gradient(to_bottom,transparent,hsl(var(--background))_40px)]" />
          {(friendsError || pond.error || claimError) && <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-card px-4 py-3"><p className="text-[12px] font-semibold text-destructive">{claimError || 'Some of your pond could not load.'}</p><button type="button" onClick={() => { setClaimError(null); void mutateFriends(); void pond.mutate(); }} className="min-h-11 shrink-0 rounded-xl px-3 text-[12px] font-black text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Try again</button></div>}
          {buddyInviteCount > 0 && <button type="button" onClick={openInbox} className="flex min-h-14 items-center gap-3 rounded-2xl border border-primary/20 bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Handshake className="h-5 w-5 shrink-0 text-primary" aria-hidden /><span className="min-w-0 flex-1 text-[13px] font-black text-foreground">{buddyInviteCount === 1 ? 'A friend wants to build a habit with you' : buddyInviteCount + ' buddy invitations are waiting'}</span><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden /></button>}
          {(!pond.error || pond.data) && <SharedHabits data={pond.data} indices={indices} completedById={completedById} onComplete={async (taskId) => { await toggleTask(taskId); await pond.mutate(); void mutateFriends(); }} onStart={startBuddy} hasFriends={hasRealFriends} paused={isAnyPanelOpen} />}
          <PondFocusSection rooms={pond.data?.rooms} hasFriends={hasRealFriends} onOpen={openRoom} onInvite={() => setInviteOpen(true)} />
          {hasRealFriends && <section>
            <PondSectionTitle title="Your people" subtitle={friends.length + (friends.length === 1 ? ' friend. Lots of little possibilities.' : ' friends. Lots of little possibilities.')} action={<button type="button" onClick={() => setAddOpen(true)} aria-label="Add someone to your pond" className="grid h-11 w-11 place-items-center rounded-full border border-border/50 bg-card text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><UserPlus className="h-5 w-5" aria-hidden /></button>} />
            {friends.length > 6 && <label className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-card px-3 focus-within:ring-2 focus-within:ring-primary/40"><Search className="h-4 w-4 text-muted-foreground" aria-hidden /><span className="sr-only">Find a friend</span><input type="search" value={friendSearch} onChange={(event) => setFriendSearch(event.target.value)} placeholder="Find a friend…" autoComplete="off" name="friend-search" className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-foreground outline-none" /></label>}
            <ul data-hint="friends-list" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filteredRows.map((entry, index) => <FriendRow key={entry.userId} entry={entry} animate={index < 2} buddyInvites={buddyInviteByFriend.get(entry.userId) ?? 0} onOpen={() => setDetailTarget(entry)} onBuddyUp={() => setBuddyTarget(entry)} paused={isAnyPanelOpen} />)}
            </ul>
            {!filteredRows.length && <p role="status" className="py-6 text-center text-[13px] font-medium text-muted-foreground">No friends match that name. Try another search.</p>}
          </section>}
          {pond.data && <KeepsakeShelf keepsakes={pond.data.keepsakes} pinnedId={pond.data.pinnedKeepsakeId} onSelect={(item) => { pond.clearActionError(); setKeepsakeTarget(item); }} />}
          {growCard()}
        </div>
      </div>

      <BuddyPickerSheet open={buddyPickerOpen} onClose={() => setBuddyPickerOpen(false)} friends={rows} onSelect={(friend) => { setBuddyPickerOpen(false); setBuddyTarget(friend); }} />
      <BuddyStartFlow open={buddyInviteOpen} onClose={() => setBuddyInviteOpen(false)} friends={friends} indices={indices} source="friends_pond" />
      <KeepsakeSheet item={keepsakeTarget} onClose={() => setKeepsakeTarget(null)} pinnedId={pond.data?.pinnedKeepsakeId} onPin={pond.pinKeepsake} busy={pond.busy} error={pond.actionError} />
      <FocusRoomSheet open={roomOpen} roomId={roomId} room={pond.data?.rooms.find((room) => room.id === roomId)} serverNow={pond.data?.serverNow} busy={pond.busy} error={pond.actionError} onClose={() => setRoomOpen(false)} onAction={async (action, options) => { const id = await pond.roomAction(action, options); if (id && action !== 'leave') setRoomId(id); return id; }} />

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
      const data = await res.json().catch(() => ({}));
      const bonus = Math.max(0, Math.floor(data?.granted ?? 0));
      if (bonus > 0) {
        doubledRef.current = true;
        markFlyEarn();
        mutateInventoryCaches();
        setDisplayAmount((a) => a + bonus);
      } else {
        throw new Error('Could not double your flies — try again later.');
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
            flyCollectAmount={displayAmount}
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
