'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronRight, UserPlus } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { HomeFocusFlies } from '@/components/ui/HomeFocusFlies';
import { FlyCatchSwipeLauncher } from '@/components/ui/FlyCatchSwipeLauncher';
import { FrogBellyDeck } from '@/components/ui/FrogBellyDeck';
import { StatusDock, statusDockRowClass } from '@/components/home/StatusDock';
import { QuestTrack } from '@/components/ui/QuestTrack';
import { QuestRewardTileBadge } from '@/lib/questClaims';
import { FaceStack } from './PondSocial';
import { keepsakeEmoji } from '@/lib/friends/social';
import type { FriendSummary } from '@/lib/friends/indices';
import { cn } from '@/lib/utils';
import { hapticTick } from '@/lib/haptics';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const PLACES = [
  'left-[16%] md:left-[22%] lg:left-[28%]',
  'left-[84%] md:left-[78%] lg:left-[72%]',
  'hidden lg:flex lg:left-[8%]',
  'hidden lg:flex lg:left-[92%]',
];
const NO_CATALOG = {};
const FROG_SEAT_OFFSET = 57;
const NAME_PILL = 'flex max-w-[105px] items-center gap-1 rounded-full border border-border/50 bg-card px-2.5 py-1 text-[11px] font-black text-foreground shadow-sm';

const SEAT_TRACK_MAX = 8;
const SEAT_HINT_KEY = 'pond-seat-swipe-hint';

function firstName(friend: FriendSummary) {
  const name = friend.name || friend.frogName;
  return name.trim().split(/\s+/)[0] || name;
}

function seatRank(friend: FriendSummary) {
  if (friend.focusing) return 2;
  return (friend.tasksToday ?? 0) > 0 ? 1 : 0;
}

function seatOrder(friends: FriendSummary[]) {
  return friends
    .map((friend, index) => ({ friend, index }))
    .sort(
      (a, b) =>
        seatRank(b.friend) - seatRank(a.friend) ||
        (b.friend.tasksToday ?? 0) - (a.friend.tasksToday ?? 0) ||
        a.index - b.index,
    )
    .map(({ friend }) => friend);
}

function SeatFrog({ friend, index, paused, className, style, onOpen }: {
  friend: FriendSummary; index: number; paused: boolean; className?: string; style?: React.CSSProperties;
  onOpen: (friend: FriendSummary) => void;
}) {
  const reduceMotion = useReducedMotion();
  const tasksToday = friend.tasksToday ?? 0;
  return (
    <motion.button type="button" onClick={() => { hapticTick(); onOpen(friend); }}
      aria-label={'Visit ' + (friend.name || friend.frogName) + "'s pond" + (friend.focusing ? ', focusing now' : tasksToday > 0 ? ', ' + tasksToday + ' done today' : '')}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 24, delay: Math.min(index, 3) * 0.055 }}
      whileTap={reduceMotion ? undefined : { scale: 0.94 }}
      style={style}
      className={cn('group absolute bottom-0 z-20 -ml-[58px] flex w-[116px] touch-manipulation flex-col items-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', className)}>
      <span className="relative block h-[124px] w-[116px]">
        <span aria-hidden className="absolute inset-x-3 bottom-2 h-5 rounded-[50%] border border-primary/20 bg-primary/20 shadow-sm" />
        {index === 0 && !reduceMotion ? <Frog width={116} height={124} indices={friend.indices} visualOffsetY={0} paused={paused} /> : <FrogSnapshot width={116} height={124} indices={friend.indices} visualOffsetY={0} />}
        {keepsakeEmoji(friend.pinnedKeepsakeId) && <span className="absolute bottom-0 right-2 grid h-7 w-7 place-items-center rounded-full border border-border/60 bg-card text-sm shadow-sm" aria-label="Friendship keepsake">{keepsakeEmoji(friend.pinnedKeepsakeId)}</span>}
      </span>
      <span className={NAME_PILL}>
        {friend.focusing ? (
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#447d3f]" />
        ) : tasksToday > 0 ? (
          <Check aria-hidden className="h-3 w-3 shrink-0 text-[#447d3f]" strokeWidth={4} />
        ) : null}
        <span className="truncate">{friend.name || friend.frogName}</span>
      </span>
    </motion.button>
  );
}

function SeatTrack({ friends, paused, onOpen }: {
  friends: FriendSummary[]; paused: boolean; onOpen: (friend: FriendSummary) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [hint, setHint] = React.useState(false);

  React.useEffect(() => {
    if (reduceMotion) return;
    try {
      if (localStorage.getItem(SEAT_HINT_KEY)) return;
      localStorage.setItem(SEAT_HINT_KEY, '1');
    } catch {
      return;
    }
    setHint(true);
  }, [reduceMotion]);

  const last = friends.length - 1;
  return (
    <motion.div
      role="group"
      aria-label="Friends in your pond"
      animate={hint ? { x: [0, -34, 0] } : undefined}
      transition={{ duration: 0.9, delay: 1.1, ease: 'easeInOut' }}
      className="no-scrollbar absolute inset-x-0 bottom-1.5 z-20 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain pb-3"
    >
      {friends.map((friend, index) => (
        <div
          key={friend.userId}
          className="relative h-[156px] shrink-0 snap-start"
          style={{ width: index === last ? '32%' : '68%' }}
        >
          <SeatFrog
            friend={friend}
            index={index}
            paused={paused}
            onOpen={onOpen}
            style={{ left: index === last ? '50%' : '23.53%' }}
          />
        </div>
      ))}
    </motion.div>
  );
}

function PondStatusRow({ friends, claimable, claiming, gate, onClaim, onInvite }: {
  friends: FriendSummary[]; claimable: number; claiming: boolean; gate?: { required: number; done: number; open: boolean };
  onClaim: () => void; onInvite: () => void;
}) {
  const router = useRouter();
  const ready = claimable > 0 && gate?.open !== false;
  const shape = 'min-w-0 rounded-[19px] border-t-0 md:flex-1 md:rounded-l-none';
  if (claimable > 0) {
    const required = Math.max(1, gate?.required ?? 1);
    const remaining = Math.max(1, required - (gate?.done ?? 0));
    const goHome = () => router.push('/');
    return (
      <div
        data-dock-row
        role={ready ? undefined : 'button'}
        tabIndex={ready ? undefined : 0}
        aria-label={ready ? undefined : 'Finish ' + remaining + ' more ' + (remaining === 1 ? 'task' : 'tasks') + ' to collect ' + claimable + ' flies from your friends'}
        onClick={() => (ready ? !claiming && onClaim() : goHome())}
        onKeyDown={(event) => { if (!ready && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); goHome(); } }}
        className={cn(statusDockRowClass(ready ? 'ready' : 'idle'), shape)}
      >
        <span className="min-h-11 min-w-11 shrink-0 rounded-xl">
          <QuestRewardTileBadge rewards={[{ type: 'FLIES', amount: claimable }]} catalog={NO_CATALOG} isPremium={false} small />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold leading-tight text-foreground">
            {ready && (
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#447d3f] text-white">
                <Check className="h-2.5 w-2.5" strokeWidth={4} />
              </span>
            )}
            <span className="min-w-0 truncate">{ready ? 'Flies from your friends' : 'Finish ' + remaining + ' more ' + (remaining === 1 ? 'task' : 'tasks')}</span>
          </span>
          <QuestTrack
            progress={ready ? required : gate?.done ?? 0}
            target={required}
            action={ready ? { label: claiming ? 'Claiming…' : 'Claim', disabled: claiming, onPress: onClaim } : null}
          />
        </div>
      </div>
    );
  }
  if (!friends.length) {
    return (
      <button type="button" data-dock-row onClick={onInvite} className={cn(statusDockRowClass('idle'), shape)}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/[0.12] text-primary">
          <UserPlus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold leading-tight text-foreground">Bring a friend to your pond</span>
          <span className="mt-1 block truncate text-[12px] font-semibold text-muted-foreground">Their finished tasks send you flies</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
      </button>
    );
  }
  const focusing = friends.filter((friend) => friend.focusing);
  const active = friends.filter((friend) => (friend.tasksToday ?? 0) > 0);
  const shown = focusing.length ? focusing : active.length ? active : friends;
  const title = focusing.length === 1
    ? firstName(focusing[0]) + ' is focusing'
    : focusing.length > 1
      ? focusing.length + ' friends are focusing'
      : active.length === 1
        ? firstName(active[0]) + ' showed up today'
        : active.length > 1
          ? active.length + ' friends showed up today'
          : 'Quiet pond today';
  return (
    <div data-dock-row className={cn(statusDockRowClass('idle', false), shape)}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
        <FaceStack people={shown} size={shown.length > 1 ? 28 : 36} max={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold leading-tight text-foreground">{title}</span>
        <span className="mt-1 block truncate text-[12px] font-semibold text-muted-foreground">Their finished tasks send you flies</span>
      </span>
    </div>
  );
}

export function PondHero({ indices, paused = false, friends, claimable, claiming, gate, hunger, maxHunger, pinnedKeepsakeId, onClaim, onOpenFriend, onInvite }: {
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item' | 'mood', number>>;
  paused?: boolean; friends: FriendSummary[];
  claimable: number; claiming: boolean; gate?: { required: number; done: number; open: boolean };
  hunger: number | null; maxHunger: number; pinnedKeepsakeId?: string | null;
  onClaim: () => void; onOpenFriend: (friend: FriendSummary) => void; onInvite: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const frogRef = React.useRef<FrogHandle | null>(null);
  const frogBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [mouthOpen, setMouthOpen] = React.useState(false);
  const pin = keepsakeEmoji(pinnedKeepsakeId);
  const seated = React.useMemo(() => seatOrder(friends), [friends]);
  const narrow = useMediaQuery('(max-width: 767px)');
  const rotate = narrow && seated.length > 2;
  return (
    <div className="relative flex w-full flex-col items-center">
      <h1 className="sr-only">Friends</h1>
      <div className="relative isolate z-[26] h-[232px] w-full max-w-[480px] md:h-[286px] md:max-w-[760px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-[4%] bottom-3 h-12 rounded-[50%] bg-primary/[0.07]" />
        {rotate ? (
          <SeatTrack friends={seated.slice(0, SEAT_TRACK_MAX)} paused={paused} onOpen={onOpenFriend} />
        ) : (
          seated.slice(0, 4).map((friend, index) => (
            <SeatFrog key={friend.userId} friend={friend} index={index} paused={paused} onOpen={onOpenFriend} className={cn('bottom-[18px]', PLACES[index])} />
          ))
        )}
        {!friends.length && [16, 84].map((left) => <button key={left} type="button" onClick={onInvite} aria-label="Invite a friend to sit beside you" className="absolute bottom-9 z-10 -ml-11 flex h-24 w-[88px] touch-manipulation flex-col items-center justify-center gap-2 rounded-[30px] border-2 border-dashed border-primary/20 bg-card/40 text-primary/60 transition-colors hover:border-primary/50 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" style={{ left: left + '%' }}><UserPlus className="h-6 w-6" aria-hidden /><span className="text-[11px] font-bold">A spot for a friend</span></button>)}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center">
          <FlyCatchSwipeLauncher source="friends" shouldStart={(x, y) => frogRef.current?.hitTest(x, y) !== false}>
            <div ref={frogBoxRef} data-fly-hero className="relative h-[270px] w-[240px]">
              <HomeFocusFlies frogRef={frogRef} frogBoxRef={frogBoxRef} onGrabActive={setMouthOpen} hidden={paused} />
              <div data-fly-hero-frog className="h-full w-full [&_*]:pointer-events-none"><Frog ref={frogRef} width={240} height={270} indices={indices} visualOffsetY={FROG_SEAT_OFFSET} paused={paused || !!reduceMotion} mouthOpen={mouthOpen} /></div>
              <button type="button" aria-label="Say hello with your frog" onClick={() => { hapticTick(); if (!reduceMotion) frogRef.current?.fireEmote('love'); }} className="pointer-events-auto absolute bottom-0 left-1/2 h-[190px] w-[150px] -translate-x-1/2 touch-manipulation rounded-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
              {pin ? <span className="pointer-events-none absolute bottom-[104px] right-[30px] grid h-9 w-9 place-items-center rounded-full border border-amber-400/40 bg-card text-xl shadow-sm">{pin}</span> : null}
            </div>
          </FlyCatchSwipeLauncher>
        </div>
      </div>
      <StatusDock>
        <div className="hidden md:contents"><FrogBellyDeck bare hunger={hunger ?? undefined} maxHunger={maxHunger} animateHunger={!paused && !reduceMotion} className="rounded-[19px] md:w-[250px] md:shrink-0 group-has-[[data-dock-row]]/dock:rounded-b-none md:group-has-[[data-dock-row]]/dock:rounded-bl-[19px] md:group-has-[[data-dock-row]]/dock:rounded-r-none" /></div>
        <PondStatusRow friends={seated} claimable={claimable} claiming={claiming} gate={gate} onClaim={onClaim} onInvite={onInvite} />
      </StatusDock>
    </div>
  );
}
