'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronRight, Handshake, Loader2, Plus, Sparkles } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import type { FrogIndices } from '@/lib/friends/indices';
import type { PondData, PondHabit, Keepsake, PondRoom } from '@/lib/friends/social';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { cn } from '@/lib/utils';

export const POND_PRIMARY = 'inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-black text-primary-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] transition-[transform,opacity,filter] hover:brightness-105 active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
export const POND_SECONDARY = 'inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 text-[12px] font-black text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60';

export function PondSectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-3 px-1"><div className="min-w-0"><h2 className="text-lg font-black tracking-tight text-foreground">{title}</h2>{subtitle && <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">{subtitle}</p>}</div>{action}</div>;
}

export function SharedHabits({ data, indices, completedById, onComplete, onStart, hasFriends, paused }: {
  data?: PondData; indices: Partial<FrogIndices>; completedById: Record<string, boolean>;
  onComplete: (taskId: string) => Promise<void>; onStart: () => void; hasFriends: boolean; paused: boolean;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const [busyTask, setBusyTask] = React.useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const habits = (data?.habits ?? []).filter((habit) => habit.dueToday && !!habit.taskId && !(completedById[habit.taskId] ?? habit.mineDone));
  const caughtUp = (data?.completedToday ?? 0) > 0 || !!data?.habits.some((habit) => habit.taskId && (completedById[habit.taskId] ?? habit.mineDone));
  const visible = showAll ? habits : habits.slice(0, 3);
  const complete = async (habit: PondHabit) => {
    if (!habit.taskId || busyTask) return;
    setBusyTask(habit.taskId);
    try { await onComplete(habit.taskId); } finally { setBusyTask(null); }
  };
  return <section data-hint="buddy-habits">
    <PondSectionTitle title="Better together" subtitle="A little progress, with someone on your side." action={habits.length ? <button type="button" onClick={onStart} aria-label="Start another buddy habit" className="grid h-11 w-11 place-items-center rounded-full border border-border/50 bg-card text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Plus className="h-5 w-5" aria-hidden /></button> : undefined} />
    {!data ? <div role="status" aria-label="Loading shared habits" className="h-36 animate-pulse rounded-[20px] border border-border/60 bg-card motion-reduce:animate-none" /> : !habits.length ?
      <div className="relative overflow-hidden rounded-[20px] border border-border/60 bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3"><div className="relative flex h-20 w-[100px] shrink-0 items-end justify-center overflow-hidden"><FrogSnapshot width={90} height={85} indices={indices} visualOffsetY={0} /><span className="absolute bottom-1 right-0 grid h-8 w-8 place-items-center rounded-full border border-primary/20 bg-card text-primary"><Handshake className="h-4 w-4" aria-hidden /></span></div><div className="min-w-0"><h3 className="text-[16px] font-black tracking-tight text-foreground">{caughtUp ? 'Your part is done for today.' : 'Start small. Show up together.'}</h3><p className="mt-1 text-[12px] font-medium leading-relaxed text-muted-foreground">{caughtUp ? 'Come back for your next shared habit, or start a new one together.' : 'A walk, a few pages, a glass of water. Pick one little habit and bring a friend along.'}</p></div></div>
        <button type="button" onClick={onStart} className={cn(POND_PRIMARY, 'mt-4 w-full')}><Handshake className="h-4 w-4" aria-hidden />{hasFriends ? 'Start a buddy habit' : 'Invite a friend to a habit'}</button>
      </div> : <div className="flex flex-col gap-2.5">{visible.map((habit) => {
        const mineDone = habit.taskId && completedById[habit.taskId] !== undefined ? completedById[habit.taskId] : habit.mineDone;
        const bothDone = mineDone && habit.partnerDone;
        return <motion.div key={habit.bondId} animate={reduceMotion || paused ? {} : { scale: bothDone ? [1, 1.012, 1] : 1 }} transition={{ duration: 0.4 }} className={cn('overflow-hidden rounded-[20px] border bg-card p-3.5 sm:p-4', bothDone ? 'border-primary/25' : 'border-border/60')}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-bold text-primary">You + {habit.partnerName}</p><h3 className="mt-0.5 break-words text-[16px] font-black tracking-tight text-foreground">{habit.text}</h3><p className="mt-1 text-[11px] font-medium text-muted-foreground">{habit.schedule}{habit.streak > 0 ? ' · ' + habit.streak + ' together in a row' : ''}</p></div><span className="flex h-[66px] w-[128px] shrink-0 items-center justify-center"><FrogSnapshot className="shrink-0" width={64} height={66} indices={indices} visualOffsetY={0} /><FrogSnapshot className="shrink-0" width={64} height={66} indices={habit.partnerIndices} visualOffsetY={0} /></span></div>
          <div className="mt-3 grid grid-cols-2 gap-2">{[{ name: 'You', done: mineDone }, { name: habit.partnerName, done: habit.partnerDone }].map((person, index) => <span key={index} className={cn('flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold', person.done ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-muted-foreground')}><span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full', person.done ? 'bg-primary text-primary-foreground' : 'border border-border')}>{person.done && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}</span><span className="truncate">{person.name}</span><span className="ml-auto shrink-0">{person.done ? 'Done' : habit.dueToday ? 'Up next' : 'Next time'}</span></span>)}</div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p aria-live="polite" className={cn('text-[12px] font-bold', bothDone ? 'text-primary' : 'text-muted-foreground')}>{bothDone ? 'You both showed up. That’s a win.' : habit.partnerDone && habit.dueToday ? habit.partnerName + ' is done. Your little win is next.' : mineDone ? 'Your part is done. Send a little encouragement.' : habit.dueToday ? 'A little better, together.' : 'A shared habit for your next scheduled day.'}</p>{habit.taskId && habit.dueToday && <button type="button" disabled={!!busyTask} onClick={() => void complete(habit)} className={cn(mineDone ? POND_SECONDARY : POND_PRIMARY, 'ml-auto min-h-10 text-[12px]')} aria-label={mineDone ? 'Undo your completion of ' + habit.text : 'Complete ' + habit.text}>{busyTask === habit.taskId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{mineDone ? 'Done · undo' : 'I did it'}</button>}</div>
        </motion.div>;
      })}</div>}
    {data?.weekReward.enabled && hasFriends ? <div className="mt-2.5 flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card px-3.5 py-3"><span aria-hidden className="relative -my-1 flex h-[48px] w-[48px] shrink-0 items-center justify-center"><span className="absolute -left-4 -top-6"><GiftRive width={70} height={70} color={data.weekReward.giftRiveIndex ?? 1} paused={paused || !!reduceMotion} /></span></span><div className="min-w-0 flex-1"><p className="text-[12px] font-black text-foreground">{data.weekReward.earned ? 'You earned your duo gift this week!' : 'A good week deserves a little gift'}</p><p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{data.weekReward.earned ? 'Find it in your wardrobe.' : 'Finish ' + data.weekReward.required + ' habits with the same buddy this week to earn ' + data.weekReward.giftName + '.'}</p></div><span className="shrink-0 text-[12px] font-black tabular-nums text-primary">{Math.min(data.weekReward.required, (data.weekReward.progress ?? Math.max(0, ...habits.map((habit) => habit.weekProgress))))}/{data.weekReward.required}</span></div> : null}
    {habits.length > 3 && <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{showAll ? 'Show less' : 'See all ' + habits.length + ' shared habits'}<ChevronRight className="h-3.5 w-3.5" aria-hidden /></button>}
  </section>;
}

export function PondFocusSection({ rooms = [], hasFriends, onOpen, onInvite }: { rooms?: PondRoom[]; hasFriends: boolean; onOpen: (id?: string) => void; onInvite: () => void }) {
  const timerActive = useFrogodoroStore((state) => state.timerActive);
  const openTimer = useFrogodoroUiStore((state) => state.openFocusLauncher);
  const joined = rooms.find((room) => room.joined);
  return <section>
    <PondSectionTitle title="A little quiet company" subtitle="Your own thing. The same little space." />
    <div className="overflow-hidden rounded-[20px] border border-border/60 bg-card">
      {rooms.filter((room) => room.members.length > 0).slice(0, 3).map((room) => <button key={room.id} type="button" onClick={() => onOpen(room.id)} className="flex min-h-[78px] w-full touch-manipulation items-center gap-3 border-b border-border/50 px-3.5 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><span className="flex w-20 shrink-0 -space-x-4">{room.members.slice(0, 3).map((member) => <FrogSnapshot key={member.userId} width={40} height={42} indices={member.indices} visualOffsetY={0} />)}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-black text-foreground">{room.joined ? 'Your focus room' : room.hostName + '’s focus room'}</span><span className="mt-1 block text-[11px] font-medium text-muted-foreground">{room.members.length} {room.members.length === 1 ? 'frog' : 'frogs'} · {room.duration} minute sitting</span></span><span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1.5 text-[11px] font-black text-primary">{room.joined ? 'You’re here' : 'Join'}</span></button>)}
      <div className="flex items-center gap-3 p-3.5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon name="clock" className="h-9 w-9" /></span><div className="min-w-0 flex-1"><p className="text-[13px] font-black text-foreground">{joined ? 'Settle in. You’ve got company.' : 'Pull up a lily pad'}</p><p className="mt-0.5 text-[11px] font-medium leading-relaxed text-muted-foreground">Focus, read, or study. Your friends can sit beside you.</p></div></div>
      <div className="px-3.5 pb-3.5"><button type="button" onClick={() => joined ? onOpen(joined.id) : !hasFriends ? onInvite() : timerActive ? openTimer() : onOpen()} className={cn(POND_SECONDARY, 'w-full')}><Icon name="clock" className="h-6 w-6" />{joined ? 'Back to your room' : !hasFriends ? 'Invite someone to sit with you' : timerActive ? 'Open my timer' : 'Start a focus room'}</button></div>
    </div>
  </section>;
}

export function KeepsakeShelf({ keepsakes, pinnedId, onSelect }: { keepsakes: Keepsake[]; pinnedId?: string | null; onSelect: (item: Keepsake) => void }) {
  const earned = keepsakes.filter((item) => !!item.earnedAt).length;
  const party = keepsakes.find((item) => item.id.startsWith('pond-party-') && !item.earnedAt) ?? keepsakes.find((item) => item.id.startsWith('pond-party-'));
  return <section>
    <PondSectionTitle title="Little memories" subtitle="Things you earn by showing up together." action={<span className="shrink-0 text-[11px] font-bold text-muted-foreground">{earned} collected</span>} />
    {party ? <button type="button" onClick={() => onSelect(party)} className="mb-2.5 flex w-full touch-manipulation items-center gap-3 rounded-[20px] border border-amber-400/20 bg-card px-4 py-3.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400/10 text-3xl" aria-hidden>{party.emoji}</span><span className="min-w-0 flex-1"><span className="block text-[13px] font-black text-foreground">{party.name}</span><span className="mt-1 block text-[11px] font-medium text-muted-foreground">{party.earnedAt ? 'You were here. Wear your little souvenir.' : '3 shared habit days. A souvenir that’s yours to keep.'}</span></span><span className="flex shrink-0 gap-1" aria-label={party.progress + ' of 3 shared days'}>{[1, 2, 3].map((day) => <span key={day} className={cn('h-2 w-2 rounded-full', party.progress >= day ? 'bg-amber-400' : 'bg-muted')} />)}</span></button> : null}
    <div className="grid grid-cols-4 gap-2">{keepsakes.filter((item) => item !== party).map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)} aria-label={item.name + (item.earnedAt ? ', collected' : ', ' + item.progress + ' of ' + item.required) + (pinnedId === item.id ? ', wearing' : '')} className={cn('relative flex min-w-0 touch-manipulation flex-col items-center gap-2 rounded-2xl border bg-card px-1.5 py-3 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', pinnedId === item.id ? 'border-primary/40' : 'border-border/50')}><span className={cn('grid h-10 w-10 place-items-center rounded-full text-2xl', item.earnedAt ? 'bg-primary/10' : 'bg-muted grayscale opacity-55')} aria-hidden>{item.emoji}</span><span className="text-[10px] font-bold leading-tight text-muted-foreground">{item.name}</span>{pinnedId === item.id ? <Sparkles className="absolute right-1.5 top-1.5 h-3 w-3 text-primary" aria-hidden /> : null}</button>)}</div>
  </section>;
}
