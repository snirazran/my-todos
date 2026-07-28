'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LOOK_REACTIONS, REACTION_EMOJI } from '@/lib/friends/lookReactions';
import { useLookReactions } from '@/hooks/useLookReactions';

/**
 * The react control on a friend's row. Tapping opens a small emoji tray;
 * picking one sends it. Once sent today the chosen emoji stays as the state,
 * so the row shows what you already said rather than re-prompting.
 */
export function ReactButton({
  toUserId,
  className,
}: {
  toUserId: string;
  className?: string;
}) {
  const { sentToday, react } = useLookReactions();
  const [open, setOpen] = React.useState(false);
  const sent = sentToday[toUserId];
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={sent ? 'You reacted to this look' : 'React to this look'}
        onClick={(event) => {
          event.stopPropagation();
          if (sent) return;
          setOpen((v) => !v);
        }}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full border text-base transition-colors',
          sent
            ? 'border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/40'
            : 'border-border/60 bg-card hover:bg-accent/60',
        )}
      >
        {sent ? REACTION_EMOJI[sent] : '＋'}
      </button>

      <AnimatePresence>
        {open && !sent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="absolute bottom-full right-0 z-30 mb-1.5 flex gap-1 rounded-2xl border border-border/60 bg-card p-1.5 shadow-lg"
          >
            {LOOK_REACTIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  void react(toUserId, kind);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg transition-transform hover:scale-110 active:scale-95"
              >
                {REACTION_EMOJI[kind]}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
              disabled={!!sent}
              onClick={() => void react(toUserId, kind)}
              aria-label={`React ${kind}`}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl border-2 text-xl transition-all',
                active
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                  : sent
                    ? 'border-transparent opacity-30'
                    : 'border-border/60 bg-card hover:-translate-y-0.5 hover:border-border active:scale-95',
              )}
            >
              {REACTION_EMOJI[kind]}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] font-bold text-muted-foreground">
        {sent ? 'They’ll see you liked it' : 'Like their look?'}
      </p>
    </div>
  );
}

/**
 * "Your look got noticed" — the return half of the loop. Without this the app
 * only ever tells you what other people are wearing, never that anyone saw
 * you, which is the part that actually motivates dressing up.
 */
export function LookNoticeCard() {
  const { reactions, unseenCount, markSeen } = useLookReactions();

  const recent = React.useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return reactions.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
  }, [reactions]);

  React.useEffect(() => {
    if (unseenCount > 0) {
      const timer = window.setTimeout(() => void markSeen(), 1800);
      return () => window.clearTimeout(timer);
    }
  }, [unseenCount, markSeen]);

  if (!recent.length) return null;

  const names = Array.from(new Set(recent.map((r) => r.fromName)));
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]} +${names.length - 1} more`;
  const item = recent.find((r) => r.itemName)?.itemName;
  const emojis = Array.from(new Set(recent.map((r) => r.kind))).slice(0, 4);

  return (
    <div
      className={cn(
        'mb-3 flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-sm',
        unseenCount > 0
          ? 'border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/30'
          : 'border-border/50 bg-card',
      )}
    >
      <span className="flex shrink-0 items-center -space-x-1 text-lg">
        {emojis.map((kind) => (
          <span key={kind}>{REACTION_EMOJI[kind]}</span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-black tracking-tight text-foreground">
          {who} liked your look
        </span>
        {item && (
          <span className="block truncate text-[11px] font-semibold text-muted-foreground">
            The {item} is doing work.
          </span>
        )}
      </span>
      {unseenCount > 0 && (
        <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white">
          NEW
        </span>
      )}
    </div>
  );
}
