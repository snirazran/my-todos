'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useLookReactions } from '@/hooks/useLookReactions';
import { LookLikesSheet } from '@/components/ui/LookReactions';
import {
  REACTION_EMOJI,
  shortTimeAgo,
  summarizeNames,
  LOOK_WINDOW_MS,
} from '@/lib/friends/lookReactions';
import type { FriendSummary } from '@/lib/friends/indices';

type Entry = {
  id: string;
  /** Sorting weight — actionable first, then fresh, then ambient. */
  weight: number;
  dot: string;
  live?: boolean;
  text: React.ReactNode;
  meta?: string;
  action?: { label: string; onClick: () => void };
  onClick?: () => void;
};

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

export function FriendsTodayStrip({
  friends,
  pendingCount,
  buddyInviteCount,
  onOpenInbox,
  onOpenFriend,
  ready,
}: {
  friends: FriendSummary[];
  pendingCount: number;
  buddyInviteCount: number;
  onOpenInbox: () => void;
  onOpenFriend: (friend: FriendSummary) => void;
  ready: boolean;
}) {
  const { reactions, unseenCount, markSeen } = useLookReactions();
  const [looksOpen, setLooksOpen] = React.useState(false);
  const stripRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = stripRef.current;
    if (!el || !unseenCount) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void markSeen();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [unseenCount, markSeen]);

  const entries = React.useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    if (pendingCount > 0) {
      out.push({
        id: 'requests',
        weight: 0,
        dot: 'bg-rose-500',
        text: (
          <>
            <strong className="font-black">
              {pendingCount === 1
                ? 'Someone wants to be friends'
                : `${pendingCount} people want to be friends`}
            </strong>
          </>
        ),
        action: { label: 'Review', onClick: onOpenInbox },
      });
    }

    if (buddyInviteCount > 0) {
      out.push({
        id: 'buddy',
        weight: 1,
        dot: 'bg-violet-500',
        text: (
          <strong className="font-black">
            {buddyInviteCount === 1
              ? 'A friend wants to team up on a task'
              : `${buddyInviteCount} friends want to team up on a task`}
          </strong>
        ),
        action: { label: 'Open', onClick: onOpenInbox },
      });
    }

    const cutoff = Date.now() - LOOK_WINDOW_MS;
    const fresh = reactions.filter(
      (r) => new Date(r.createdAt).getTime() >= cutoff,
    );
    if (fresh.length) {
      const names = Array.from(new Set(fresh.map((r) => r.fromName)));
      const kinds = Array.from(new Set(fresh.map((r) => r.kind))).slice(0, 3);
      out.push({
        id: 'looks',
        weight: 2,
        dot: 'bg-pink-500',
        text: (
          <>
            <span className="mr-1">{kinds.map((k) => REACTION_EMOJI[k])}</span>
            <strong className="font-black">{summarizeNames(names)}</strong>{' '}
            {names.length === 1 ? 'liked' : 'liked'} your look
          </>
        ),
        meta: shortTimeAgo(fresh[0].createdAt),
        onClick: () => setLooksOpen(true),
      });
    }

    for (const f of friends) {
      if (!f.focusing) continue;
      out.push({
        id: `focus-${f.userId}`,
        weight: 3,
        dot: 'bg-primary',
        live: true,
        text: (
          <>
            <strong className="font-black">{f.name || f.frogName}</strong> is
            focusing right now
          </>
        ),
        onClick: () => onOpenFriend(f),
      });
    }

    for (const f of friends) {
      const streak = f.streak ?? 0;
      if (!f.streakToday || !STREAK_MILESTONES.includes(streak)) continue;
      out.push({
        id: `streak-${f.userId}`,
        weight: 4,
        dot: 'bg-orange-500',
        text: (
          <>
            <strong className="font-black">{f.name || f.frogName}</strong>{' '}
            reached {streak} days in a row
          </>
        ),
        onClick: () => onOpenFriend(f),
      });
    }

    const workers = friends
      .filter((f) => (f.tasksToday ?? 0) > 0 && !f.focusing)
      .sort((a, b) => (b.tasksToday ?? 0) - (a.tasksToday ?? 0))
      .slice(0, 3);
    for (const f of workers) {
      out.push({
        id: `tasks-${f.userId}`,
        weight: 5,
        dot: 'bg-emerald-500',
        text: (
          <>
            <strong className="font-black">{f.name || f.frogName}</strong>{' '}
            finished {f.tasksToday} {f.tasksToday === 1 ? 'task' : 'tasks'}
          </>
        ),
        onClick: () => onOpenFriend(f),
      });
    }

    return out.sort((a, b) => a.weight - b.weight).slice(0, 6);
  }, [
    friends,
    reactions,
    pendingCount,
    buddyInviteCount,
    onOpenInbox,
    onOpenFriend,
  ]);

  if (!ready) return null;
  if (!entries.length && !friends.length) return null;

  return (
    <>
      <section ref={stripRef} className="mb-7 w-full">
        <h2 className="mb-2.5 px-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          Today
        </h2>
        {entries.length === 0 ? (
          <p className="px-1.5 text-sm font-medium text-muted-foreground">
            Quiet pond so far. Cheer someone and give it a ripple.
          </p>
        ) : (
          <ul className="relative flex flex-col">
            <span
              aria-hidden
              className="absolute bottom-3 left-[5px] top-3 w-px bg-border"
            />
            <AnimatePresence initial={false}>
              {entries.map((entry) => {
                const Row = entry.onClick ? motion.button : motion.div;
                return (
                  <motion.li
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Row
                      {...(entry.onClick
                        ? { type: 'button' as const, onClick: entry.onClick }
                        : {})}
                      className={cn(
                        'relative flex w-full items-center gap-3 py-2 pl-6 pr-1 text-left',
                        entry.onClick &&
                          'touch-manipulation rounded-lg transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      )}
                    >
                      <span className="absolute left-0 flex h-[11px] w-[11px] items-center justify-center">
                        {entry.live && (
                          <span
                            className={cn(
                              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                              entry.dot,
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            'relative h-[7px] w-[7px] rounded-full ring-[3px] ring-background',
                            entry.dot,
                          )}
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {entry.text}
                      </span>
                      {entry.meta && (
                        <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                          {entry.meta}
                        </span>
                      )}
                      {entry.action && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            entry.action?.onClick();
                          }}
                          className="shrink-0 rounded-lg px-2 py-1 text-xs font-black text-[#4f9149] transition-colors hover:bg-[#4f9149]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149]"
                        >
                          {entry.action.label}
                        </button>
                      )}
                    </Row>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>
      <LookLikesSheet open={looksOpen} onOpenChange={setLooksOpen} />
    </>
  );
}
