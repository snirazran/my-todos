'use client';
import React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Sparkles, UserPlus } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { HomeFocusFlies } from '@/components/ui/HomeFocusFlies';
import { FlyCatchSwipeLauncher } from '@/components/ui/FlyCatchSwipeLauncher';
import { FrogBellyDeck } from '@/components/ui/FrogBellyDeck';
import { StatusDock, statusDockRowClass } from '@/components/home/StatusDock';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { keepsakeEmoji } from '@/lib/friends/social';
import type { FriendSummary } from '@/lib/friends/indices';
import { cn } from '@/lib/utils';
import { hapticTick } from '@/lib/haptics';

const PLACES = [
  'left-[16%] md:left-[22%] lg:left-[28%]',
  'left-[84%] md:left-[78%] lg:left-[72%]',
  'hidden lg:flex lg:left-[8%]',
  'hidden lg:flex lg:left-[92%]',
];
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
  const ready = claimable > 0 && gate?.open !== false;
  const focusing = friends.filter((friend) => friend.focusing).length;
  const activeToday = friends.filter((friend) => (friend.tasksToday ?? 0) > 0).length;
  const pin = keepsakeEmoji(pinnedKeepsakeId);
  return (
    <div className="relative flex w-full flex-col items-center">
      <h1 className="sr-only">Friends</h1>
      <div className="relative isolate h-[232px] w-full max-w-[480px] md:h-[286px] md:max-w-[760px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-[4%] bottom-3 h-12 rounded-[50%] bg-primary/[0.07]" />
        {friends.slice(0, 4).map((friend, index) => (
          <motion.button key={friend.userId} type="button" onClick={() => { hapticTick(); onOpenFriend(friend); }}
            aria-label={'Visit ' + (friend.name || friend.frogName) + "'s pond" + (friend.focusing ? ', focusing now' : '')}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 24, delay: index * 0.055 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            className={cn('group absolute bottom-[18px] z-20 -ml-[58px] flex w-[116px] touch-manipulation flex-col items-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', PLACES[index])}>
            <span className="relative block h-[124px] w-[116px]">
              <span aria-hidden className="absolute inset-x-3 bottom-2 h-5 rounded-[50%] border border-primary/20 bg-primary/20 shadow-sm" />
              {index === 0 && !reduceMotion ? <Frog width={116} height={124} indices={friend.indices} visualOffsetY={0} paused={paused} /> : <FrogSnapshot width={116} height={124} indices={friend.indices} visualOffsetY={0} />}
              {keepsakeEmoji(friend.pinnedKeepsakeId) && <span className="absolute bottom-0 right-2 grid h-7 w-7 place-items-center rounded-full border border-border/60 bg-card text-sm shadow-sm" aria-label="Friendship keepsake">{keepsakeEmoji(friend.pinnedKeepsakeId)}</span>}
            </span>
            <span className="max-w-[105px] truncate rounded-full border border-border/50 bg-card px-2.5 py-1 text-[11px] font-black text-foreground shadow-sm backdrop-blur-sm">{friend.name || friend.frogName}</span>
            {friend.focusing ? <span className="mt-1 flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Focusing</span> : null}
          </motion.button>
        ))}
        {!friends.length && [16, 84].map((left) => <button key={left} type="button" onClick={onInvite} aria-label="Invite a friend to sit beside you" className="absolute bottom-9 z-10 -ml-11 flex h-24 w-[88px] touch-manipulation flex-col items-center justify-center gap-2 rounded-[30px] border-2 border-dashed border-primary/20 bg-card/40 text-primary/60 transition-colors hover:border-primary/50 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" style={{ left: left + '%' }}><UserPlus className="h-6 w-6" aria-hidden /><span className="text-[11px] font-bold">A spot for a friend</span></button>)}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center">
          <FlyCatchSwipeLauncher source="friends" shouldStart={(x, y) => frogRef.current?.hitTest(x, y) !== false}>
            <div ref={frogBoxRef} data-fly-hero className="relative h-[215px] w-[192px] md:h-[244px] md:w-[216px]">
              <HomeFocusFlies frogRef={frogRef} frogBoxRef={frogBoxRef} onGrabActive={setMouthOpen} hidden={paused} />
              <button type="button" aria-label="Say hello with your frog" onClick={() => { hapticTick(); if (!reduceMotion) frogRef.current?.fireEmote('love'); }} className="pointer-events-auto relative h-full w-full touch-manipulation rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span aria-hidden className="absolute inset-x-5 bottom-3 h-7 rounded-[50%] border border-primary/25 bg-primary/25 shadow-sm" />
                <div data-fly-hero-frog className="h-full"><Frog ref={frogRef} width="100%" height="100%" indices={indices} visualOffsetY={0} paused={paused || !!reduceMotion} mouthOpen={mouthOpen} /></div>
                {pin ? <span className="absolute bottom-1 right-5 grid h-9 w-9 place-items-center rounded-full border border-amber-400/40 bg-card text-xl shadow-sm">{pin}</span> : null}
              </button>
            </div>
          </FlyCatchSwipeLauncher>
          <Link href="/wardrobe" className="pointer-events-auto relative -mt-3 inline-flex min-h-9 items-center gap-1 rounded-full border border-border/50 bg-card/95 px-3 text-[11px] font-black text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Sparkles className="h-3 w-3 text-primary" aria-hidden />You<ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden /></Link>
        </div>
      </div>
      <StatusDock>
        <div className="hidden md:contents"><FrogBellyDeck bare hunger={hunger ?? undefined} maxHunger={maxHunger} animateHunger={!paused && !reduceMotion} className="rounded-[19px] md:w-[250px] md:shrink-0 group-has-[[data-dock-row]]/dock:rounded-b-none md:group-has-[[data-dock-row]]/dock:rounded-bl-[19px] md:group-has-[[data-dock-row]]/dock:rounded-r-none" /></div>
        <div data-dock-row className={cn(statusDockRowClass(ready ? 'ready' : 'idle', false), 'min-w-0 rounded-[19px] border-t-0 md:flex-1 md:rounded-l-none')}>
          <div className="min-w-0 flex-1"><p className="text-[12px] font-black text-foreground">{ready ? 'A little gift from your friends' : focusing ? focusing + (focusing === 1 ? ' friend is focusing' : ' friends are focusing') : activeToday ? activeToday + (activeToday === 1 ? ' friend showed up today' : ' friends showed up today') : friends.length ? friends.length + (friends.length === 1 ? ' friend in your circle' : ' friends in your circle') : 'A spot for your favorite people'}</p><p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{claimable > 0 && !ready ? Math.max(0, (gate?.required ?? 0) - (gate?.done ?? 0)) + ' more of your tasks unlocks ' + claimable + ' flies' : friends.length ? focusing ? 'Come sit beside them in a focus room.' : 'Start a habit. Give each other a little boost.' : 'Bring a friend. Grow together.'}</p></div>
          {ready ? <button type="button" onClick={onClaim} disabled={claiming} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-[12px] font-black text-primary-foreground transition-[opacity,transform] active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{claiming ? 'Catching…' : 'Catch'}{!claiming && <FlyAmount amount={claimable} size={18} />}</button> : claimable > 0 ? <Link href="/" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Go to your tasks to unlock your pond flies"><ChevronRight className="h-5 w-5" /></Link> : null}
        </div>
      </StatusDock>
    </div>
  );
}
