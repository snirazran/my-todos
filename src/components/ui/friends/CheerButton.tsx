'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import {
  LOOK_REACTIONS,
  REACTION_EMOJI,
  type LookReactionKind,
} from '@/lib/friends/lookReactions';
import { useLookReactions } from '@/hooks/useLookReactions';

const DEFAULT_KIND: LookReactionKind = 'fire';

export function CheerButton({
  toUserId,
  className,
}: {
  toUserId: string;
  className?: string;
}) {
  const { sentToday, react } = useLookReactions();
  const sent = sentToday[toUserId];
  const [picking, setPicking] = React.useState(false);
  const [earned, setEarned] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!picking) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPicking(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [picking]);

  const send = async (kind: LookReactionKind) => {
    setPicking(false);
    const gained = await react(toUserId, kind);
    if (gained > 0) {
      setEarned(gained);
      window.setTimeout(() => setEarned(0), 1400);
    }
  };

  return (
    <div ref={wrapRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-label={sent ? 'Change your cheer' : 'Cheer this friend'}
        onClick={(e) => {
          e.stopPropagation();
          if (sent) setPicking((v) => !v);
          else void send(DEFAULT_KIND);
        }}
        className={cn(
          'flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-xl transition-[transform,background-color] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149] focus-visible:ring-offset-2',
          sent
            ? 'bg-[#4f9149]/12'
            : 'bg-muted/70 grayscale-[0.9] opacity-60 hover:opacity-100 hover:grayscale-0',
        )}
      >
        <motion.span
          key={sent ?? 'empty'}
          initial={sent ? { scale: 0.4 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 14 }}
        >
          {REACTION_EMOJI[sent ?? DEFAULT_KIND]}
        </motion.span>
      </button>

      <AnimatePresence>
        {earned > 0 && (
          <motion.span
            initial={{ opacity: 0, y: 0, scale: 0.7 }}
            animate={{ opacity: 1, y: -26, scale: 1 }}
            exit={{ opacity: 0, y: -38 }}
            className="pointer-events-none absolute left-1/2 top-0 z-30 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-black text-white shadow-lg"
          >
            <Fly size={14} y={-1} interactive={false} paused />+{earned}
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.9 }}
            transition={{ duration: 0.14 }}
            className="absolute bottom-full right-0 z-40 mb-1.5 flex gap-0.5 rounded-2xl border border-border bg-popover p-1 shadow-xl"
          >
            {LOOK_REACTIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-label={`React ${kind}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void send(kind);
                }}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl text-lg transition-transform active:scale-90',
                  sent === kind ? 'bg-[#4f9149]/15' : 'hover:bg-accent',
                )}
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

/** The standing offer that makes sending worth a tap, not just a kindness. */
export function CheerEarnHint() {
  const { cheerFlies, cheerPaidLeft } = useLookReactions();
  if (cheerFlies <= 0 || cheerPaidLeft <= 0) return null;
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
      <Fly size={14} y={-1} interactive={false} paused />+{cheerFlies} each for
      the next {cheerPaidLeft}
    </span>
  );
}
