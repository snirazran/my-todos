'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, UserPlus, Bell } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AddFriendsSheet } from '@/components/ui/AddFriendsSheet';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { FriendRequestsInbox } from '@/components/ui/FriendRequestsInbox';
import { contributionFrom, type FriendSummary } from '@/lib/friends/indices';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type UserInfo = { name?: string | null; frogName?: string | null };

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
  const { data: friendsData } = useSWR<{
    friends: FriendSummary[];
    me: FriendSummary | null;
    contribution?: { receivedToday: number; justCredited: number };
  }>(
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

  const friends = friendsData?.friends ?? [];
  const hasRealFriends = friends.length > 0;
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

  const myFliesToday = friendsData?.me?.fliesToday ?? 0;
  const youGiveEach = contributionFrom(myFliesToday);

  const give = (f: FriendSummary) => f.givesYou ?? contributionFrom(f.fliesToday);
  const friendEntries: LeaderboardEntry[] = friends
    .map((f) => ({ ...f, isSelf: false }))
    .sort(
      (a, b) =>
        give(b) - give(a) ||
        b.fliesToday - a.fliesToday ||
        (a.frogName || a.name).localeCompare(b.frogName || b.name),
    );
  const leaderboard: LeaderboardEntry[] = [...friendEntries, selfEntry];

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12">
      {/* Friend invites — persistent, over the winter scene */}
      <button
        type="button"
        onClick={() => setInboxOpen(true)}
        aria-label="Friend invites"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-emerald-700 shadow-md ring-1 ring-black/5 backdrop-blur-sm transition-transform active:scale-95"
      >
        <Bell className="h-[22px] w-[22px]" />
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
          className="relative z-20 -mt-3 flex w-[min(20rem,80vw)] items-center justify-center gap-2 rounded-2xl bg-white px-10 py-3.5 text-lg font-black tracking-tight text-emerald-700 shadow-lg transition-transform active:scale-[0.97]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Plus className="h-5 w-5" strokeWidth={3} />
          </span>
          Add friend
        </button>

        {/* Rising sheet */}
        <div className="relative z-10 -mx-4 mt-8 flex w-[calc(100%+2rem)] flex-col self-stretch rounded-t-[24px] bg-background px-4 pb-12 pt-5 md:px-8">
          {/* Friend requests — surfaced inline only when there's something to act on */}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setInboxOpen(true)}
              className="mb-4 flex items-center gap-3 rounded-2xl border border-border/50 bg-card/80 px-3.5 py-2.5 text-left shadow-sm backdrop-blur-xl transition-transform active:scale-[0.99]"
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
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
            <InviteRewardBanner onClick={() => setInviteOpen(true)} />
          </div>

          {/* Leaderboard — focus is how much each friend shares with you */}
          <div className="w-full">
            <div className="mb-2.5 flex items-baseline justify-between px-1.5">
              <h2 className="text-lg font-black tracking-tight text-emerald-950">
                Today&apos;s leaderboard
              </h2>
              {hasRealFriends && (
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700/50">
                  Shared with you
                </span>
              )}
            </div>

            <div className="w-full overflow-hidden rounded-[18px] border border-border/50 bg-card/40 p-1.5 shadow-sm">
              {hasRealFriends ? (
                <ul className="flex flex-col gap-1.5">
                  {leaderboard.map((entry, i) => (
                    <LeaderboardRow
                      key={`${entry.userId}-${i}`}
                      entry={entry}
                      rank={i + 1}
                      youGiveEach={youGiveEach}
                    />
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-14 text-center">
                  <p className="text-sm font-bold text-muted-foreground">
                    Add friends to earn flies together
                  </p>
                </div>
              )}
            </div>
          </div>
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

function LeaderboardRow({
  entry,
  rank,
  youGiveEach,
}: {
  entry: LeaderboardEntry;
  rank: number;
  youGiveEach: number;
}) {
  const medal = RANK_RING[rank];
  const gives = entry.givesYou ?? contributionFrom(entry.fliesToday);
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        entry.isSelf
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-border/50 bg-card'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
          medal ?? 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {rank}
      </span>

      <div className="-mb-2.5 flex h-[104px] w-32 shrink-0 items-end justify-center self-end overflow-hidden">
        <Frog width={172} height={144} indices={entry.indices} />
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

      {entry.isSelf ? (
        <div className="flex shrink-0 flex-col items-end text-right">
          <div className="flex items-center gap-1.5">
            <Fly size={30} y={-1} />
            <span className="text-2xl font-black tabular-nums leading-none text-foreground">
              {entry.fliesToday}
            </span>
          </div>
          <span className="mt-1.5 text-[11px] font-bold tabular-nums text-emerald-600/70">
            {youGiveEach > 0 ? `+${youGiveEach} to friends` : 'caught today'}
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-end text-right">
          <div className="flex items-center gap-1.5">
            <Fly size={30} y={-1} />
            <span className="text-2xl font-black tabular-nums leading-none text-emerald-600">
              +{gives}
            </span>
          </div>
          <span className="mt-1.5 text-[11px] font-bold tabular-nums text-muted-foreground/55">
            {entry.fliesToday} caught
          </span>
        </div>
      )}
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
      className="flex w-full items-center gap-3 rounded-[18px] border border-emerald-200/70 bg-emerald-50/50 px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <span className="flex h-16 w-16 shrink-0 items-center justify-center self-center overflow-hidden rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/15">
        {isOutfit && item ? (
          <Frog width={86} height={72} indices={rewardItemToIndices(item)} />
        ) : item?.icon ? (
          <img src={item.icon} alt="" className="h-12 w-12 object-contain" />
        ) : (
          <Fly size={44} y={-2} paused />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-600">
          Invite &amp; earn
        </p>
        <p className="text-sm font-black leading-tight tracking-tight text-emerald-950 sm:text-base">
          {isOutfit
            ? `Gift a skin, unlock this skin`
            : `Gift a skin to earn rewards`}
        </p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
        <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
      </span>
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
    <div className="relative z-30 flex shrink-0 flex-col items-center">
      <p className="translate-y-5 text-xl font-black tracking-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] md:translate-y-7">
        {frogName}
      </p>
      <Frog width={240} height={180} indices={indices} />
    </div>
  );
}
