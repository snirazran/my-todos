'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
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
        aria-expanded={picking}
        onClick={(e) => {
          e.stopPropagation();
          setPicking((v) => !v);
        }}
        className={cn(
          'relative flex h-10 touch-manipulation items-center justify-center gap-1 rounded-full transition-[transform,background-color,border-color] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149] focus-visible:ring-offset-2',
          sent
            ? 'w-10 bg-[#4f9149]/12 text-lg'
            : 'border border-[#4f9149]/30 bg-[#4f9149]/[.06] pl-2.5 pr-3 text-[13px] font-black text-[#4f9149] hover:bg-[#4f9149]/12',
        )}
      >
        <motion.span
          key={sent ?? 'empty'}
          initial={sent ? { scale: 0.4 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 14 }}
          className={cn(!sent && 'text-base')}
        >
          {REACTION_EMOJI[sent ?? DEFAULT_KIND]}
        </motion.span>
        {!sent && <span>Cheer</span>}
        {sent && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card bg-[#4f9149] text-white">
            <Check className="h-2.5 w-2.5" strokeWidth={4} />
          </span>
        )}
      </button>

      <AnimatePresence>
        {earned > 0 && (
          <motion.span
            initial={{ opacity: 0, y: 0, scale: 0.7 }}
            animate={{ opacity: 1, y: -26, scale: 1 }}
            exit={{ opacity: 0, y: -38 }}
            className="pointer-events-none absolute right-0 top-0 z-30 flex items-center gap-0.5 whitespace-nowrap rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-black text-white shadow-lg"
          >
            <Fly size={14} y={-1} interactive={false} paused />+{earned}
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            style={{ transformOrigin: 'bottom right' }}
            className="absolute bottom-full right-0 z-40 mb-2 rounded-2xl border border-border/60 bg-popover p-1.5 shadow-xl"
          >
            <p className="px-1.5 pb-1 text-[11px] font-black text-muted-foreground">
              {sent ? 'Change your cheer' : 'Send a cheer'}
            </p>
            <div className="flex gap-1">
              {LOOK_REACTIONS.map((kind, i) => (
                <motion.button
                  key={kind}
                  type="button"
                  aria-label={`Send ${kind}`}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 600,
                    damping: 20,
                    delay: i * 0.03,
                  }}
                  whileHover={{ scale: 1.15, y: -2 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void send(kind);
                  }}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl text-2xl',
                    sent === kind
                      ? 'bg-[#4f9149]/15 ring-1 ring-inset ring-[#4f9149]/40'
                      : 'hover:bg-accent',
                  )}
                >
                  {REACTION_EMOJI[kind]}
                </motion.button>
              ))}
            </div>
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
  const friends =
    cheerPaidLeft === 1 ? '1 more friend' : `${cheerPaidLeft} more friends`;
  const reward = `${cheerFlies} ${cheerFlies === 1 ? 'fly' : 'flies'}`;
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Fly size={15} y={-1} interactive={false} paused />
      <span>
        Cheer {friends} today to earn{' '}
        <strong className="font-black text-emerald-600 dark:text-emerald-400">
          {reward}
          {cheerPaidLeft > 1 ? ' each' : ''}
        </strong>
      </span>
    </span>
  );
}
