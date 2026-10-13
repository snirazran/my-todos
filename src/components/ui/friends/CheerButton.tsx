'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlyAmount, FlyIcon } from '@/components/ui/FlyAmount';
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
  compact = false,
  onSent,
}: {
  toUserId: string;
  className?: string;
  compact?: boolean;
  onSent?: (kind: LookReactionKind) => void;
}) {
  const { sentToday, react } = useLookReactions();
  const sent = sentToday[toUserId];
  const [picking, setPicking] = React.useState(false);
  const [earned, setEarned] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [alignRight, setAlignRight] = React.useState(false);
  const reduceMotion = useReducedMotion();
  const earnedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (earnedTimer.current) clearTimeout(earnedTimer.current); }, []);
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
    if (sending) return;
    setPicking(false);
    setSending(true);
    setError(false);
    const gained = await react(toUserId, kind);
    setSending(false);
    if (gained < 0) { setError(true); return; }
    onSent?.(kind);
    if (gained > 0) {
      setEarned(gained);
      if (earnedTimer.current) clearTimeout(earnedTimer.current);
      earnedTimer.current = setTimeout(() => setEarned(0), 1400);
    }
  };

  return (
    <div ref={wrapRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-label={sent ? 'Change your cheer' : 'Cheer this friend'}
        aria-expanded={picking}
        disabled={sending}
        onClick={(e) => {
          e.stopPropagation();
          const rect = wrapRef.current?.getBoundingClientRect();
          setAlignRight(!!rect && rect.left + 250 > window.innerWidth - 12);
          setPicking((v) => !v);
        }}
        className={cn(
          'relative flex h-11 touch-manipulation items-center justify-center gap-1 rounded-xl transition-[transform,background-color,border-color] active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          sent
            ? 'w-11 bg-primary/10 text-lg'
            : compact ? 'px-2 text-[11px] font-black text-foreground hover:bg-accent' : 'border border-primary/20 bg-primary/[.06] pl-2.5 pr-3 text-[13px] font-black text-primary hover:bg-primary/10',
        )}
      >
        <motion.span
          key={sent ?? 'empty'}
          initial={sent && !reduceMotion ? { scale: 0.4 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 14 }}
          className={cn(!sent && 'text-base')}
        >
          {REACTION_EMOJI[sent ?? DEFAULT_KIND]}
        </motion.span>
        {!sent && <span>Cheer</span>}
        {sent && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card bg-[#447d3f] text-white">
            <Check className="h-2.5 w-2.5" strokeWidth={4} />
          </span>
        )}
      </button>
      {error && <span role="status" className="absolute left-0 top-full z-40 mt-1 whitespace-nowrap rounded-lg border border-border bg-popover px-2 py-1 text-[10px] font-bold text-destructive">Could not cheer. Try again.</span>}

      <AnimatePresence>
        {earned > 0 && (
          <motion.span
            initial={{ opacity: 0, y: 0, scale: reduceMotion ? 1 : 0.7 }}
            animate={{ opacity: 1, y: reduceMotion ? 0 : -26, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -38 }}
            className="pointer-events-none absolute right-0 top-0 z-30 flex items-center whitespace-nowrap rounded-full bg-[#447d3f] py-0.5 pl-2 pr-2 font-black text-white shadow-lg"
          >
            <FlyAmount amount={`+${earned}`} size={11} />
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            style={{ transformOrigin: 'bottom right' }}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setPicking(false); wrapRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); } }}
            className={cn('absolute bottom-full z-40 mb-2 rounded-2xl border border-border/60 bg-popover p-1.5 shadow-xl', compact && !alignRight ? 'left-0' : 'right-0')}
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
                  initial={{ scale: reduceMotion ? 1 : 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 600,
                    damping: 20,
                    delay: i * 0.03,
                  }}
                  whileHover={reduceMotion ? undefined : { scale: 1.15, y: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.85 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void send(kind);
                  }}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl text-2xl',
                    sent === kind
                      ? 'bg-[#447d3f]/15 ring-1 ring-inset ring-[#447d3f]/40'
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
      <FlyIcon textPx={12} />
      <span>
        Cheer {friends} today to earn{' '}
        <strong className="font-black text-emerald-700 dark:text-emerald-400">
          {reward}
          {cheerPaidLeft > 1 ? ' each' : ''}
        </strong>
      </span>
    </span>
  );
}
