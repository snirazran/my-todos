'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, Bell } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AddFriendsSheet } from '@/components/ui/AddFriendsSheet';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { FriendRequestsInbox } from '@/components/ui/FriendRequestsInbox';
import type { FriendSummary } from '@/lib/friends/indices';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type UserInfo = { name?: string | null; frogName?: string | null };

const MOCK_FRIENDS: FriendSummary[] = [
  { userId: 'mock-1', name: 'Lily', frogName: 'Pip', indices: { skin: 2, hat: 0, body: 0, hand_item: 0 }, fliesToday: 18 },
  { userId: 'mock-2', name: 'Sam', frogName: 'Bubbles', indices: { skin: 5, hat: 3, body: 0, hand_item: 0 }, fliesToday: 11 },
  { userId: 'mock-3', name: 'Coco', frogName: 'Tadpole', indices: { skin: 3, hat: 1, body: 0, hand_item: 0 }, fliesToday: 7 },
  { userId: 'mock-4', name: 'Maple', frogName: 'Sprout', indices: { skin: 1, hat: 5, body: 0, hand_item: 0 }, fliesToday: 3 },
];

type LeaderboardEntry = FriendSummary & { isSelf: boolean };

export default function FriendsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const tz = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  const { indices } = useWardrobeIndices(!!user);
  const { data: userInfo } = useSWR<UserInfo>(user ? '/api/user' : null, fetcher, {
    revalidateOnFocus: false,
  });
  const { data: friendsData } = useSWR<{ friends: FriendSummary[]; me: FriendSummary | null }>(
    user ? `/api/friends?tz=${encodeURIComponent(tz)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: requestsData } = useSWR<{ incoming: { id: string }[] }>(
    user ? '/api/friends/request' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <LoadingScreen />;

  const hasRealFriends = !!friendsData?.friends?.length;
  const friends = hasRealFriends ? friendsData!.friends : MOCK_FRIENDS;
  const pendingCount = requestsData?.incoming?.length ?? 0;

  const meFrogName = userInfo?.frogName || friendsData?.me?.frogName || 'Frog';

  const selfEntry: LeaderboardEntry = {
    userId: friendsData?.me?.userId ?? 'me',
    name: userInfo?.name ?? friendsData?.me?.name ?? 'You',
    frogName: meFrogName,
    indices,
    fliesToday: friendsData?.me?.fliesToday ?? 0,
    isSelf: true,
  };

  const leaderboard: LeaderboardEntry[] = [
    selfEntry,
    ...friends.map((f) => ({ ...f, isSelf: false })),
  ].sort(
    (a, b) =>
      b.fliesToday - a.fliesToday ||
      (a.frogName || a.name).localeCompare(b.frogName || b.name),
  );

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12">
      {/* Friend invites bell */}
      <button
        type="button"
        onClick={() => setInboxOpen(true)}
        aria-label="Friend invites"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-emerald-700 shadow-md backdrop-blur-sm transition-transform active:scale-95"
      >
        <Bell className="h-6 w-6" />
        {pendingCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-black text-white">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:pt-4">
        {/* Self frog */}
        <SelfFrog frogName={meFrogName} indices={indices} />

        {/* Add friend — frog sits right on top of it */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="-mt-3 flex w-[min(20rem,80vw)] items-center justify-center gap-2 rounded-2xl bg-white px-10 py-3.5 text-lg font-black tracking-tight text-emerald-700 shadow-lg transition-transform active:scale-[0.97]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Plus className="h-5 w-5" strokeWidth={3} />
          </span>
          Add friend
        </button>

        {/* Leaderboard */}
        <div className="mt-6 w-full">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="text-lg font-black tracking-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]">
              Today&apos;s leaderboard
            </h2>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
              Flies caught
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {leaderboard.map((entry, i) => (
              <LeaderboardRow key={`${entry.userId}-${i}`} entry={entry} rank={i + 1} />
            ))}
          </ul>

          {!hasRealFriends && (
            <p className="mt-3 px-1 text-center text-sm font-semibold text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
              Add friends to start a real leaderboard.
            </p>
          )}
        </div>

        {/* Invite banner */}
        <div className="mt-5 w-full max-w-lg">
          <InviteRewardBanner onClick={() => setInviteOpen(true)} />
        </div>
      </div>

      <AddFriendsSheet open={addOpen} onClose={() => setAddOpen(false)} indices={indices} />
      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <FriendRequestsInbox open={inboxOpen} onClose={() => setInboxOpen(false)} />
    </main>
  );
}

const RANK_RING: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950',
  2: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800',
  3: 'bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950',
};

function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const medal = RANK_RING[rank];
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-3 py-2 shadow-md ring-1 transition-colors ${
        entry.isSelf
          ? 'bg-emerald-50 ring-emerald-400'
          : 'bg-white/90 ring-black/5'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
          medal ?? 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {rank}
      </span>

      <div className="flex h-12 w-14 shrink-0 items-end justify-center overflow-hidden">
        <Frog width={64} height={54} indices={entry.indices} paused />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-black leading-tight tracking-tight text-emerald-950">
          {entry.frogName || entry.name}
          {entry.isSelf && (
            <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 align-middle text-[10px] font-black uppercase tracking-wide text-white">
              You
            </span>
          )}
        </p>
        {entry.name && entry.frogName && entry.name !== entry.frogName && (
          <p className="truncate text-xs font-semibold text-emerald-700/70">
            {entry.name}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1">
        <Fly size={22} y={-1} paused />
        <span className="text-base font-black tabular-nums text-emerald-800">
          {entry.fliesToday}
        </span>
      </div>
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

function InviteRewardBanner({ onClick }: { onClick: () => void }) {
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
      className="flex w-full items-center gap-3 rounded-3xl bg-gradient-to-br from-[#5bb15a] via-[#4f9149] to-[#3c7a39] px-5 py-2.5 text-left shadow-lg ring-1 ring-emerald-900/10 transition-transform active:scale-[0.99]"
    >
      <span className="flex w-20 shrink-0 items-center justify-center self-stretch">
        {isOutfit && item ? (
          <Frog width={104} height={88} indices={rewardItemToIndices(item)} />
        ) : item?.icon ? (
          <img src={item.icon} alt="" className="h-16 w-16 object-contain" />
        ) : (
          <Fly size={56} y={-2} paused />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">
          Invite friends, earn rewards
        </p>
        <p className="text-sm font-black leading-tight text-white sm:text-lg">
          {isOutfit
            ? `Gift a friend a skin to get this skin!`
            : `Gift a friend a skin to earn rewards!`}
        </p>
      </div>
      <ChevronRight className="h-6 w-6 shrink-0 text-white/80" />
    </button>
  );
}

function SelfFrog({
  frogName,
  indices,
}: {
  frogName: string;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <p className="translate-y-5 text-xl font-black tracking-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] md:translate-y-7">
        {frogName}
      </p>
      <Frog width={240} height={180} indices={indices} />
    </div>
  );
}
