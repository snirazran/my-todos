'use client';

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Handshake, Loader2 } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { BuddyFrogFace } from '@/components/ui/BuddyBadge';
import { StreakPill } from '@/components/ui/TaskAdornments';
import { QuestTrack } from '@/components/ui/QuestTrack';
import { Skeleton } from '@/components/ui/Skeleton';
import { HOME_CARD_SURFACE } from '@/components/ui/taskSurfaces';
import type { FrogIndices } from '@/lib/friends/indices';
import type { PondData, PondHabit, Keepsake, PondRoom } from '@/lib/friends/social';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export const POND_PRIMARY = 'inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-black text-primary-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] transition-[transform,opacity,filter] hover:brightness-105 active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
export const POND_SECONDARY = 'inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 text-[12px] font-black text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60';

export const POND_ROW = HOME_CARD_SURFACE;
export const POND_ROW_PRESS =
  'touch-manipulation text-left transition-[transform,background-color] duration-150 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [@media(hover:hover)]:hover:bg-muted/40';
export const POND_PAD =
  'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/[0.16] text-primary ring-1 ring-inset ring-primary/25 md:h-12 md:w-12';
export const POND_PILL =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full px-3.5 text-[13px] font-black';

export function PondSectionHeader({
  title,
  count,
  right,
  id,
}: {
  title: string;
  count?: string | null;
  right?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-2 flex min-h-9 items-center justify-between gap-2 pl-3.5 pr-1">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 id={id} className="truncate text-[19px] font-black tracking-tight text-foreground">
          {title}
        </h2>
        {count && (
          <span className="shrink-0 text-[13px] font-bold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

export function FrogTile({
  indices,
  background,
  size = 52,
  className,
}: {
  indices?: Partial<FrogIndices>;
  background?: string | null;
  size?: number;
  className?: string;
}) {
  const frog = Math.round(size * 1.3);
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-[14px] bg-gradient-to-b from-primary/[0.16] to-primary/[0.05]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {background ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={background}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : null}
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <FrogSnapshot width={frog} height={frog} indices={indices} visualOffsetY={0} />
      </span>
    </span>
  );
}

export function FaceStack({
  people,
  size = 22,
  max = 3,
}: {
  people: { userId: string; indices?: FrogIndices }[];
  size?: number;
  max?: number;
}) {
  return (
    <span className="flex shrink-0 items-center">
      {people.slice(0, max).map((person, index) => (
        <BuddyFrogFace
          key={person.userId}
          indices={person.indices}
          size={size}
          className={cn('shadow-[0_0_0_3px_hsl(var(--border))] ring-2 ring-card', index > 0 && '-ml-1.5')}
        />
      ))}
    </span>
  );
}

export function PondRowSkeleton({ lines = 2 }: { lines?: 1 | 2 }) {
  return (
    <div aria-hidden className={cn('flex items-center gap-3 py-3 pl-3.5 pr-2.5', POND_ROW)}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2 rounded-md" />
        {lines === 2 && <Skeleton className="h-3 w-2/3 rounded-md" />}
      </div>
      <Skeleton className="h-11 w-11 shrink-0 rounded-full md:h-12 md:w-12" />
    </div>
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function useClock(active: boolean, every = 15_000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [active, every]);
  return now;
}

function HabitRow({
  habit,
  busy,
  disabled,
  onComplete,
}: {
  habit: PondHabit;
  busy: boolean;
  disabled: boolean;
  onComplete: () => void;
}) {
  const partner = firstName(habit.partnerName);
  return (
    <div className={cn('flex items-center gap-3 py-3 pl-3.5 pr-2.5 md:pl-4 md:pr-3', POND_ROW)}>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[17px] font-semibold leading-snug text-foreground md:text-[17.5px]">
          {habit.text}
          {habit.streak > 0 && (
            <StreakPill
              count={habit.streak}
              size="sm"
              className="ml-1.5 translate-y-[-1px] align-middle"
            />
          )}
        </span>
        <span className="mt-0.5 flex h-7 min-w-0 items-center gap-2">
          <span className="relative shrink-0">
            <BuddyFrogFace
              indices={habit.partnerIndices}
              size={22}
              className={cn('ring-2', habit.partnerDone ? 'ring-[#447d3f]' : 'ring-border')}
            />
            {habit.partnerDone && (
              <span className="absolute -bottom-0.5 -right-1 grid h-3 w-3 place-items-center rounded-full bg-[#447d3f] text-white ring-2 ring-card">
                <Check className="h-2 w-2" strokeWidth={4} />
              </span>
            )}
          </span>
          <span
            className={cn(
              'min-w-0 truncate text-[12.5px] font-semibold md:text-[13px]',
              habit.partnerDone ? 'text-[#3d7a38] dark:text-emerald-400' : 'text-muted-foreground',
            )}
          >
            {habit.partnerDone ? (
              <>
                <b className="font-black">{partner}</b> finished · your turn
              </>
            ) : (
              <>
                With <b className="font-black text-foreground/80">{partner}</b> · {habit.schedule}
              </>
            )}
          </span>
        </span>
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          hapticTick();
          onComplete();
        }}
        aria-label={'Complete ' + habit.text}
        className={cn(
          POND_PAD,
          'touch-manipulation transition-[transform,background-color] active:scale-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [@media(hover:hover)]:hover:bg-primary/25',
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
        )}
      </button>
    </div>
  );
}

function RoomRow({ room, now, skew, onOpen }: { room: PondRoom; now: number; skew: number; onOpen: () => void }) {
  const minutes = Math.max(1, Math.ceil((Date.parse(room.endsAt) - now - skew) / 60_000));
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('flex w-full items-center gap-3 py-3 pl-3.5 pr-2.5 md:pl-4 md:pr-3', POND_ROW, POND_ROW_PRESS)}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold leading-snug text-foreground md:text-[17.5px]">
          {room.joined ? 'Your focus room' : firstName(room.hostName) + '’s focus room'}
        </span>
        <span className="mt-0.5 flex h-7 min-w-0 items-center gap-2">
          <FaceStack people={room.members} />
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[12.5px] font-semibold text-muted-foreground md:text-[13px]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#447d3f] motion-safe:animate-pulse" aria-hidden />
            {minutes} min left
          </span>
        </span>
      </span>
      <span
        className={cn(
          POND_PILL,
          room.joined
            ? 'bg-primary/[0.12] text-primary'
            : 'bg-primary text-primary-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]',
        )}
      >
        {room.joined ? 'Open' : 'Join'}
      </span>
    </button>
  );
}

function DuoGiftRow({ reward, progress, paused }: { reward: PondData['weekReward']; progress: number; paused: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 py-3 pl-3 pr-3.5 md:pl-3.5 md:pr-4', POND_ROW)}>
      <span
        aria-hidden
        className="relative h-11 w-11 shrink-0 overflow-visible rounded-xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-100 to-amber-50 dark:border-amber-500/50 dark:from-amber-900 dark:to-amber-950"
      >
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="h-[124%] w-[124%] -translate-y-[13%]">
            <GiftRive className="h-full w-full" color={reward.giftRiveIndex ?? 1} paused={paused} />
          </span>
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold leading-tight text-foreground">
          {reward.earned && (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#447d3f] text-white">
              <Check className="h-2.5 w-2.5" strokeWidth={4} />
            </span>
          )}
          <span className="min-w-0 truncate">
            {reward.earned ? 'Duo gift earned this week' : reward.required + ' habits with one buddy'}
          </span>
        </span>
        {reward.earned ? (
          <span className="text-[12px] font-semibold text-muted-foreground">In your wardrobe</span>
        ) : (
          <QuestTrack progress={progress} target={reward.required} />
        )}
      </span>
    </div>
  );
}

function StartRow({
  hasFriends,
  joined,
  timerActive,
  onStartBuddy,
  onFocus,
}: {
  hasFriends: boolean;
  joined: boolean;
  timerActive: boolean;
  onStartBuddy: () => void;
  onFocus: () => void;
}) {
  const half =
    'flex min-h-[60px] min-w-0 items-center gap-2.5 py-2 pl-3 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 active:bg-foreground/[0.04] md:pl-3.5 [@media(hover:hover)]:hover:bg-foreground/[0.025]';
  const circle =
    'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary ring-1 ring-inset ring-primary/20';
  const label = 'min-w-0 text-[15px] font-semibold leading-tight text-muted-foreground md:text-[16px]';
  return (
    <div className={cn('grid overflow-hidden', joined || !hasFriends ? 'grid-cols-1' : 'grid-cols-2', POND_ROW)}>
      <button type="button" data-hint="share-habit" onClick={onStartBuddy} className={half}>
        <span className={circle}>
          <Handshake className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
        </span>
        <span className={label}>{hasFriends ? 'Share a habit' : 'Start a habit with a friend'}</span>
      </button>
      {!joined && hasFriends && (
        <button type="button" onClick={onFocus} className={cn(half, 'border-l border-border/50')}>
          <span className={circle}>
            <Icon name="clock" className="h-7 w-7" />
          </span>
          <span className={label}>{timerActive ? 'Open my timer' : 'Focus together'}</span>
        </button>
      )}
    </div>
  );
}

export function TogetherSection({
  data,
  completedById,
  onComplete,
  onStartBuddy,
  onOpenRoom,
  hasFriends,
  paused,
}: {
  data?: PondData;
  completedById: Record<string, boolean>;
  onComplete: (taskId: string) => Promise<void>;
  onStartBuddy: () => void;
  onOpenRoom: (id?: string) => void;
  hasFriends: boolean;
  paused: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [showAll, setShowAll] = React.useState(false);
  const [busyTask, setBusyTask] = React.useState<string | null>(null);
  const timerActive = useFrogodoroStore((state) => state.timerActive);
  const openTimer = useFrogodoroUiStore((state) => state.openFocusLauncher);

  const habits = data?.habits ?? [];
  const isDone = (habit: PondHabit) =>
    !!habit.taskId && (completedById[habit.taskId] ?? habit.mineDone);
  const due = habits.filter((habit) => habit.dueToday && !!habit.taskId && !isDone(habit));
  const doneToday = Math.max(data?.completedToday ?? 0, habits.filter(isDone).length);
  const rooms = (data?.rooms ?? []).filter((room) => room.members.length > 0).slice(0, 3);
  const joined = rooms.find((room) => room.joined);
  const visible = showAll ? due : due.slice(0, 3);
  const hidden = due.length - visible.length;
  const weekProgress = data
    ? Math.min(
        data.weekReward.required,
        data.weekReward.progress ?? Math.max(0, ...habits.map((habit) => habit.weekProgress)),
      )
    : 0;
  const showGift = !!data?.weekReward.enabled && hasFriends && habits.length > 0;
  const skew = React.useMemo(() => (data?.serverNow ?? Date.now()) - Date.now(), [data?.serverNow]);
  const now = useClock(rooms.length > 0 && !paused);

  const complete = async (habit: PondHabit) => {
    if (!habit.taskId || busyTask) return;
    setBusyTask(habit.taskId);
    try {
      await onComplete(habit.taskId);
    } finally {
      setBusyTask(null);
    }
  };

  const rowMotion = reduceMotion
    ? { initial: false as const, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96, transition: { duration: 0.18 } },
        transition: { type: 'spring' as const, stiffness: 420, damping: 34 },
      };

  return (
    <section data-hint="buddy-habits" aria-labelledby="pond-together">
      <PondSectionHeader
        id="pond-together"
        title="Together"
        count={!data ? null : due.length ? due.length + ' left' : doneToday ? 'All done' : null}
      />
      {!data ? (
        <div role="status" aria-label="Loading shared habits" className="flex flex-col gap-2">
          <PondRowSkeleton />
          <PondRowSkeleton lines={1} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((habit) => (
              <motion.div key={habit.bondId} layout={reduceMotion ? false : 'position'} {...rowMotion}>
                <HabitRow
                  habit={habit}
                  busy={busyTask === habit.taskId}
                  disabled={!!busyTask}
                  onComplete={() => void complete(habit)}
                />
              </motion.div>
            ))}
            {!due.length && doneToday > 0 && (
              <motion.div key="done" layout={reduceMotion ? false : 'position'} {...rowMotion}>
                <div className={cn('flex items-center gap-3 py-3 pl-3.5 pr-3.5 md:pl-4', POND_ROW)}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#68b85c] to-[#447d3f] text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]">
                    <Check className="h-5 w-5" strokeWidth={3.5} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-bold leading-tight text-foreground md:text-[16px]">
                    Your part is done today
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex h-9 items-center gap-1 self-start rounded-full bg-muted/70 pl-3.5 pr-3 text-[13px] font-black text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
            >
              {hidden} more
              <ChevronDown className="h-4 w-4" strokeWidth={2.75} aria-hidden />
            </button>
          )}
          {rooms.map((room) => (
            <RoomRow key={room.id} room={room} now={now} skew={skew} onOpen={() => onOpenRoom(room.id)} />
          ))}
          {showGift && <DuoGiftRow reward={data.weekReward} progress={weekProgress} paused={paused || !!reduceMotion} />}
          <StartRow
            hasFriends={hasFriends}
            joined={!!joined}
            timerActive={timerActive}
            onStartBuddy={onStartBuddy}
            onFocus={() => (timerActive ? openTimer() : onOpenRoom())}
          />
        </div>
      )}
    </section>
  );
}

export function KeepsakeShelf({
  keepsakes,
  pinnedId,
  onSelect,
}: {
  keepsakes: Keepsake[];
  pinnedId?: string | null;
  onSelect: (item: Keepsake) => void;
}) {
  if (!keepsakes.length) return null;
  const earned = keepsakes.filter((item) => !!item.earnedAt).length;
  const party =
    keepsakes.find((item) => item.id.startsWith('pond-party-') && !item.earnedAt) ??
    keepsakes.find((item) => item.id.startsWith('pond-party-'));
  const ordered = party ? [party, ...keepsakes.filter((item) => item !== party)] : keepsakes;
  return (
    <section aria-labelledby="pond-memories">
      <PondSectionHeader id="pond-memories" title="Memories" count={earned + '/' + keepsakes.length} />
      <div className={cn('overflow-hidden', POND_ROW)}>
        <div className="no-scrollbar grid auto-cols-[minmax(68px,1fr)] grid-flow-col overflow-x-auto px-1.5 py-1.5">
          {ordered.map((item) => {
            const owned = !!item.earnedAt;
            const wearing = pinnedId === item.id;
            const ratio = Math.min(1, item.progress / Math.max(1, item.required));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                aria-label={item.name + (owned ? ', collected' : ', ' + item.progress + ' of ' + item.required) + (wearing ? ', wearing' : '')}
                className="flex min-w-0 touch-manipulation flex-col items-center gap-1.5 rounded-2xl px-1 pb-2 pt-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:bg-foreground/[0.04] [@media(hover:hover)]:hover:bg-foreground/[0.03]"
              >
                <span
                  className={cn(
                    'grid h-12 w-12 place-items-center rounded-full text-[26px]',
                    owned ? 'bg-primary/10' : 'bg-muted',
                    wearing && 'ring-2 ring-[#447d3f] ring-offset-2 ring-offset-card',
                  )}
                  aria-hidden
                >
                  <span className={cn(!owned && 'opacity-45 grayscale')}>{item.emoji}</span>
                </span>
                <span className="line-clamp-2 min-h-[26px] text-center text-[11px] font-bold leading-tight text-muted-foreground">
                  {item.name}
                </span>
                <span aria-hidden className={cn('h-1 w-9 overflow-hidden rounded-full', owned || ratio === 0 ? 'invisible' : 'bg-foreground/[0.08]')}>
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: Math.max(12, ratio * 100) + '%' }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
