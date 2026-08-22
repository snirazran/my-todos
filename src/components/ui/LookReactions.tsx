'use client';

import React from 'react';
import { X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Frog from '@/components/ui/frog';
import { BaseSheet } from '@/components/ui/BaseSheet';
import {
  LOOK_REACTIONS,
  LOOK_WINDOW_MS,
  REACTION_EMOJI,
  describeLook,
  shortTimeAgo,
  summarizeNames,
  type LookSnapshot,
  type ReceivedReaction,
} from '@/lib/friends/lookReactions';
import { useLookReactions } from '@/hooks/useLookReactions';

function useRecentReactions(reactions: ReceivedReaction[]) {
  return React.useMemo(() => {
    const cutoff = Date.now() - LOOK_WINDOW_MS;
    return reactions.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
  }, [reactions]);
}

/**
 * The full reaction row, for surfaces with room to show every option at once
 * (the friend detail sheet, where the look is the whole point).
 */
export function LookReactionRow({ toUserId }: { toUserId: string }) {
  const { sentToday, react } = useLookReactions();
  const sent = sentToday[toUserId];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        {LOOK_REACTIONS.map((kind) => {
          const active = sent === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => void react(toUserId, kind)}
              aria-label={`React ${kind}`}
              aria-pressed={active}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl border-2 text-xl transition-all',
                active
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                  : sent
                    ? 'border-border/40 bg-card opacity-50 hover:opacity-100 active:scale-95'
                    : 'border-border/60 bg-card hover:-translate-y-0.5 hover:border-border active:scale-95',
              )}
            >
              {REACTION_EMOJI[kind]}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] font-bold text-muted-foreground">
        {sent ? 'Tap another to change it' : 'Like their look?'}
      </p>
    </div>
  );
}

/**
 * The permanent stat: how many friends liked your look this week. Lives on
 * your own leaderboard row, so the count survives after the notice is read.
 */
export function LookLovedChip() {
  const { reactions } = useLookReactions();
  const recent = useRecentReactions(reactions);
  if (!recent.length) return null;

  const emojis = Array.from(new Set(recent.map((r) => r.kind))).slice(0, 2);

  return (
    <span className="flex items-center gap-0.5 rounded-full bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-black text-pink-500">
      <span className="flex -space-x-0.5 text-[11px] leading-none">
        {emojis.map((kind) => (
          <span key={kind}>{REACTION_EMOJI[kind]}</span>
        ))}
      </span>
      {recent.length}
    </span>
  );
}

/**
 * "Your look got noticed" — shown only while there is something new. Once read
 * it stays for the rest of the session, then gives way to the chip.
 */
export function LookNoticeCard() {
  const { reactions, unseenCount, markSeen } = useLookReactions();
  const [batch, setBatch] = React.useState<ReceivedReaction[] | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (batch === null && unseenCount > 0) {
      setBatch(reactions.filter((r) => !r.seen));
    }
  }, [batch, unseenCount, reactions]);

  React.useEffect(() => {
    const el = cardRef.current;
    if (!el || !unseenCount) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void markSeen();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [unseenCount, markSeen]);

  if (dismissed || !batch?.length) return null;

  const names = Array.from(new Set(batch.map((r) => r.fromName)));
  const emojis = Array.from(new Set(batch.map((r) => r.kind))).slice(0, 4);
  const allCurrent = batch.every((r) => r.isCurrentLook);

  return (
    <>
      <div
        ref={cardRef}
        className="mb-3 flex items-center gap-2 rounded-2xl border border-emerald-400/60 bg-emerald-50 pr-1.5 shadow-sm dark:bg-emerald-950/30"
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <span className="flex shrink-0 items-center -space-x-1 text-lg">
            {emojis.map((kind) => (
              <span key={kind}>{REACTION_EMOJI[kind]}</span>
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-black tracking-tight text-foreground">
              {summarizeNames(names)} liked your look
            </span>
            <span className="block truncate text-[11px] font-semibold text-muted-foreground">
              {allCurrent
                ? 'Still on your frog right now'
                : 'That look has changed since'}
              {' · '}
              {shortTimeAgo(batch[0].createdAt)}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            void markSeen();
            setDismissed(true);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      <LookLikesSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}

type LookGroup = {
  key: string;
  look: LookSnapshot | null;
  isCurrentLook: boolean;
  reactions: ReceivedReaction[];
};

export function LookLikesSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reactions } = useLookReactions();
  const recent = useRecentReactions(reactions);

  const groups = React.useMemo(() => {
    const map = new Map<string, LookGroup>();
    for (const r of recent) {
      const key = r.look?.key ?? 'unknown';
      const existing = map.get(key);
      if (existing) existing.reactions.push(r);
      else
        map.set(key, {
          key,
          look: r.look,
          isCurrentLook: r.isCurrentLook,
          reactions: [r],
        });
    }
    return Array.from(map.values()).slice(0, 4);
  }, [recent]);

  return (
    <BaseSheet open={open} onOpenChange={onOpenChange} className="sm:max-w-md">
      {({ entered, bindScroll }) => (
        <div
          ref={bindScroll}
          className="flex max-h-[100dvh] flex-col overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 sm:max-h-[calc(100dvh-3rem)]"
        >
          <h2 className="text-xl font-black tracking-tight text-foreground">
            Your look, noticed
          </h2>
          <p className="mt-0.5 text-[13px] font-semibold text-muted-foreground">
            {recent.length}{' '}
            {recent.length === 1 ? 'reaction' : 'reactions'} in the last 7 days
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {groups.map((group) => (
              <div
                key={group.key}
                className="rounded-2xl border border-border/50 bg-card/60 p-3"
              >
                <div className="flex items-center gap-3">
                  {group.look && (
                    <div className="relative flex aspect-[6/5] w-[84px] shrink-0 items-end justify-center overflow-hidden">
                      {entered && (
                        <Frog
                          className="translate-y-[15%]"
                          width="145%"
                          height="145%"
                          indices={group.look.indices}
                          paused
                        />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {group.isCurrentLook && (
                      <span className="mb-1 inline-block rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                        Wearing now
                      </span>
                    )}
                    <p
                      className={cn(
                        'text-[13px] font-black leading-snug tracking-tight',
                        group.look
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {group.look
                        ? describeLook(group.look.items)
                        : 'An earlier look'}
                    </p>
                  </div>
                </div>

                <ul className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">
                  {group.reactions.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <span className="text-base leading-none">
                        {REACTION_EMOJI[r.kind]}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-bold text-foreground">
                        {r.fromName}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                        {shortTimeAgo(r.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {!groups.length && (
            <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
              No reactions yet. Dress up and check back.
            </p>
          )}
        </div>
      )}
    </BaseSheet>
  );
}
