'use client';
import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { StreakPill } from '@/components/ui/TaskAdornments';
import { CheerButton } from './CheerButton';
import { FrogTile, POND_ROW } from './PondSocial';
import { keepsakeEmoji } from '@/lib/friends/social';
import { REACTION_EMOJI, type LookReactionKind } from '@/lib/friends/lookReactions';
import type { FriendSummary } from '@/lib/friends/indices';
import { cn } from '@/lib/utils';
import { hapticTick } from '@/lib/haptics';

export type FriendRowEntry = FriendSummary & { isYou?: boolean };

export function FriendRow({
  entry,
  onOpen,
  buddyInvites = 0,
}: {
  entry: FriendRowEntry;
  onOpen: () => void;
  buddyInvites?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [reaction, setReaction] = React.useState<LookReactionKind | null>(null);
  const reactionTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); }, []);
  const celebrate = (kind: LookReactionKind) => {
    setReaction(kind);
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => setReaction(null), 1400);
  };
  const name = entry.name || entry.frogName;
  const pin = keepsakeEmoji(entry.pinnedKeepsakeId);
  const tasks = entry.tasksToday ?? 0;
  const streak = entry.streak ?? 0;

  return (
    <li className={cn('relative flex min-w-0 items-center gap-1 py-2 pl-2 pr-2.5 md:pr-3', POND_ROW)}>
      <button
        type="button"
        onClick={() => { hapticTick(); onOpen(); }}
        aria-label={'Visit ' + name + "'s pond"}
        className="flex min-w-0 flex-1 touch-manipulation items-center gap-3 rounded-[14px] py-0.5 pr-1 text-left transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.985]"
      >
        <span className="relative shrink-0">
          <FrogTile indices={entry.indices} background={entry.backgroundPreview} />
          {pin ? (
            <span aria-label="Friendship keepsake" className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-card text-[13px] shadow-sm ring-1 ring-border/60">
              {pin}
            </span>
          ) : null}
          <AnimatePresence>
            {reaction ? (
              <motion.span
                key={reaction}
                aria-hidden
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.5 }}
                animate={{ opacity: 1, y: reduceMotion ? 0 : -14, scale: 1 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -26 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                className="pointer-events-none absolute inset-x-0 top-0 z-10 text-center text-3xl drop-shadow-md"
              >
                {REACTION_EMOJI[reaction]}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate text-[17px] font-semibold leading-snug text-foreground md:text-[17.5px]', entry.premium && 'plus-name-shimmer')}>
              {name}
            </span>
            {entry.premium && <Icon name="frogPlus" label="Frogress Plus" className="h-5 w-5 shrink-0" />}
            {streak > 0 && <StreakPill count={streak} size="sm" />}
          </span>
          <span className="mt-0.5 flex h-5 min-w-0 items-center gap-1.5 text-[12.5px] font-semibold md:text-[13px]">
            {buddyInvites > 0 ? (
              <span className="truncate text-amber-600 dark:text-amber-400">Wants to share a habit</span>
            ) : entry.focusing ? (
              <>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#447d3f] motion-safe:animate-pulse" aria-hidden />
                <span className="truncate text-[#3d7a38] dark:text-emerald-400">Focusing now</span>
              </>
            ) : tasks > 0 ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0 text-[#447d3f] dark:text-emerald-400" strokeWidth={3.5} aria-hidden />
                <span className="truncate text-muted-foreground">{tasks} done today</span>
              </>
            ) : (
              <span className="truncate text-muted-foreground/80">Quiet today</span>
            )}
          </span>
        </span>
      </button>
      <CheerButton toUserId={entry.userId} variant="pad" onSent={celebrate} />
    </li>
  );
}
