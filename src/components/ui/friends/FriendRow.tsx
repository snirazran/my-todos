'use client';
import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Handshake } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { CheerButton } from './CheerButton';
import { keepsakeEmoji } from '@/lib/friends/social';
import { REACTION_EMOJI, type LookReactionKind } from '@/lib/friends/lookReactions';
import type { FriendSummary } from '@/lib/friends/indices';
import { cn } from '@/lib/utils';
import { hapticTick } from '@/lib/haptics';

export type FriendRowEntry = FriendSummary & { isYou?: boolean };
export function FriendRow({ entry, onOpen, onBuddyUp, buddyInvites = 0, paused = false }: {
  entry: FriendRowEntry; onOpen: () => void; onBuddyUp: () => void; buddyInvites?: number; paused?: boolean; animate?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const frogRef = React.useRef<FrogHandle | null>(null);
  const [reaction, setReaction] = React.useState<LookReactionKind | null>(null);
  const [reacting, setReacting] = React.useState(false);
  const reactionTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); }, []);
  const celebrate = (kind: LookReactionKind) => {
    if (!reduceMotion) frogRef.current?.fireEmote('love');
    setReaction(kind);
    setReacting(true);
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => { setReaction(null); setReacting(false); }, 1600);
  };
  const pin = keepsakeEmoji(entry.pinnedKeepsakeId);
  return (
    <motion.li initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}
      className="group relative min-w-0 rounded-[20px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow] hover:border-primary/25">
      <button type="button" onClick={() => { hapticTick(); onOpen(); }} aria-label={'Visit ' + (entry.name || entry.frogName) + "'s pond and see their outfit"} className="block w-full touch-manipulation rounded-t-[19px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
        <div className="relative h-[144px] overflow-hidden rounded-t-[19px] bg-gradient-to-b from-primary/10 to-primary/[0.03] sm:h-[170px]">
          {entry.backgroundPreview ? <img src={entry.backgroundPreview} alt="" width={320} height={180} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" /> : null}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-card/70 via-transparent to-transparent" />
          <span className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-card/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></span>
          {buddyInvites > 0 ? <span className="absolute left-2 top-2 z-10 rounded-full bg-primary px-2 py-1 text-[10px] font-black text-primary-foreground">Buddy invite</span> : null}
          <div className="absolute inset-x-0 bottom-0 flex justify-center">
            <FrogSnapshot width={164} height={156} indices={entry.indices} visualOffsetY={0} />
            {reacting && !reduceMotion && <div className="absolute inset-0 flex justify-center"><Frog ref={frogRef} width={164} height={156} indices={entry.indices} visualOffsetY={0} paused={paused} onDressed={() => frogRef.current?.fireEmote('love')} /></div>}
          </div>
          {pin ? <span aria-label="Friendship keepsake" className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full border border-border/50 bg-card/95 text-lg shadow-sm">{pin}</span> : null}
          <AnimatePresence>{reaction ? <motion.span key={reaction} aria-hidden initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 35, scale: 0.5 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -20 }} className="pointer-events-none absolute inset-x-0 top-5 z-20 text-center text-4xl drop-shadow-md">{REACTION_EMOJI[reaction]}</motion.span> : null}</AnimatePresence>
        </div>
        <div className="min-w-0 px-3 pb-2.5 pt-2.5">
          <p className="truncate text-[14px] font-black tracking-tight text-foreground">{entry.name || entry.frogName}</p>
          <p className={cn('mt-1 flex min-h-4 items-center gap-1.5 text-[11px] font-semibold', entry.focusing ? 'text-primary' : 'text-muted-foreground')}>
            {entry.focusing ? <><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Focusing now</> : (entry.tasksToday ?? 0) > 0 ? entry.tasksToday + (entry.tasksToday === 1 ? ' little win today' : ' little wins today') : 'Going at their own pace'}
          </p>
        </div>
      </button>
      <div className="flex items-center justify-between gap-1 border-t border-border/40 px-2 py-2">
        <CheerButton toUserId={entry.userId} compact onSent={celebrate} />
        <button type="button" onClick={onBuddyUp} aria-label={'Start a buddy habit with ' + (entry.name || entry.frogName)} className="flex min-h-11 min-w-0 touch-manipulation items-center gap-1 rounded-xl px-2 text-[11px] font-black text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Handshake className="h-4 w-4 shrink-0" aria-hidden />Buddy up</button>
      </div>
    </motion.li>
  );
}
