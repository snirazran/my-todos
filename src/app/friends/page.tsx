'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Bell } from 'lucide-react';
import useSWR from 'swr';
import useEmblaCarousel from 'embla-carousel-react';
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
  { userId: 'mock-1', name: 'Lily', frogName: 'Pip', indices: { skin: 2, hat: 0, body: 0, hand_item: 0 } },
  { userId: 'mock-2', name: 'Sam', frogName: 'Bubbles', indices: { skin: 5, hat: 3, body: 0, hand_item: 0 } },
  { userId: 'mock-3', name: 'Coco', frogName: 'Tadpole', indices: { skin: 3, hat: 1, body: 0, hand_item: 0 } },
  { userId: 'mock-4', name: 'Maple', frogName: 'Sprout', indices: { skin: 1, hat: 5, body: 0, hand_item: 0 } },
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

export default function FriendsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const { indices } = useWardrobeIndices(!!user);
  const { data: userInfo } = useSWR<UserInfo>(user ? '/api/user' : null, fetcher, {
    revalidateOnFocus: false,
  });
  const { data: friendsData } = useSWR<{ friends: FriendSummary[] }>(
    user ? '/api/friends' : null,
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
  const isDesktop = useIsDesktop();

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: 'center',
    dragFree: true,
  });

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <LoadingScreen />;

  const friends = friendsData?.friends?.length ? friendsData.friends : MOCK_FRIENDS;
  const pendingCount = requestsData?.incoming?.length ?? 0;

  // Embla disables looping when there are too few slides for a centered 3-up
  // view, so repeat the list until there are enough for a seamless endless loop.
  const carouselFriends = friends.length
    ? Array.from({ length: Math.ceil(7 / friends.length) }).flatMap(() => friends)
    : [];

  const meFrogName = userInfo?.frogName || 'Frog';

  // Own frog matches the home page frog (240×180); friends a touch smaller.
  const selfSize = { w: 240, h: 180 };
  const friendSize = isDesktop ? { w: 150, h: 126 } : { w: 134, h: 112 };

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

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:pt-4">
        {/* Self frog */}
        <SelfFrog
          frogName={meFrogName}
          indices={indices}
          width={selfSize.w}
          height={selfSize.h}
        />

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

        {/* Friends carousel (swipeable, looping) */}
        {friends.length > 0 && (
          <div className="relative -mt-1 w-full max-w-xl md:mt-1 md:max-w-3xl">
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex touch-pan-y items-end">
                {carouselFriends.map((friend, i) => (
                  <div
                    key={`${friend.userId}-${i}`}
                    className="flex min-w-0 shrink-0 grow-0 basis-1/3 justify-center"
                  >
                    <FriendFrog friend={friend} width={friendSize.w} height={friendSize.h} />
                  </div>
                ))}
              </div>
            </div>

            {friends.length > 1 && (
              <>
                <CarouselArrow
                  dir="left"
                  onClick={() => emblaApi?.scrollPrev()}
                  className="absolute left-0 top-1/2 -translate-y-1/2"
                />
                <CarouselArrow
                  dir="right"
                  onClick={() => emblaApi?.scrollNext()}
                  className="absolute right-0 top-1/2 -translate-y-1/2"
                />
              </>
            )}
          </div>
        )}

        {/* Invite banner */}
        <div className="mt-4 w-full max-w-lg md:mt-8">
          <InviteRewardBanner onClick={() => setInviteOpen(true)} />
        </div>
      </div>

      <AddFriendsSheet open={addOpen} onClose={() => setAddOpen(false)} indices={indices} />
      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <FriendRequestsInbox open={inboxOpen} onClose={() => setInboxOpen(false)} />
    </main>
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
  width,
  height,
}: {
  frogName: string;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  width: number;
  height: number;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <p className="translate-y-5 text-xl font-black tracking-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] md:translate-y-7">
        {frogName}
      </p>
      <Frog width={width} height={height} indices={indices} />
    </div>
  );
}

function FriendFrog({
  friend,
  width,
  height,
}: {
  friend: FriendSummary;
  width: number;
  height: number;
}) {
  return (
    <div className="flex flex-col items-center">
      <Frog width={width} height={height} indices={friend.indices} />
      <p className="mt-1 max-w-[6rem] truncate text-base font-black tracking-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] sm:max-w-none">
        {friend.frogName || friend.name}
      </p>
    </div>
  );
}

function CarouselArrow({
  dir,
  onClick,
  className = '',
}: {
  dir: 'left' | 'right';
  onClick: () => void;
  className?: string;
}) {
  const Icon = dir === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'left' ? 'Previous friends' : 'Next friends'}
      className={`z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/55 text-white shadow-md transition-transform active:scale-90 ${className}`}
    >
      <Icon className="h-5 w-5" strokeWidth={3} />
    </button>
  );
}
