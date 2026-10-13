'use client';

import React from 'react';
import { Check, ChevronRight, Headphones, Loader2, LockKeyhole, Sparkles, X } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import type { FriendSummary } from '@/lib/friends/indices';
import { ROOM_DURATIONS, ROOM_CAPACITY, type Keepsake, type KeepsakeId, type PondRoom } from '@/lib/friends/social';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { POND_PRIMARY, POND_SECONDARY } from './PondSocial';
import { cn } from '@/lib/utils';

function DialogBody({ title, onClose, children, bindScroll }: { title: string; onClose: () => void; children: React.ReactNode; bindScroll: (el: HTMLElement | null) => void }) {
  const id = React.useId();
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => { cancelAnimationFrame(frame); previous?.focus(); };
  }, []);
  return <div ref={(element) => { ref.current = element; bindScroll(element); }} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    }} className="max-h-[min(82dvh,680px)] overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2 outline-none sm:px-6 sm:pb-6 sm:pt-5">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 id={id} className="text-xl font-black tracking-tight text-foreground">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-5 w-5" aria-hidden /></button></div>{children}
  </div>;
}

export function BuddyPickerSheet({ open, onClose, friends, onSelect }: { open: boolean; onClose: () => void; friends: FriendSummary[]; onSelect: (friend: FriendSummary) => void }) {
  return <BaseSheet open={open} onOpenChange={(value) => { if (!value) onClose(); }} showClose={false} className="sm:max-w-md">{({ bindScroll }) => <DialogBody title="Who’s coming along?" onClose={onClose} bindScroll={bindScroll}><p className="mb-4 text-[13px] font-medium text-muted-foreground">Pick a friend. Then pick one little habit to share.</p><div className="flex flex-col gap-2">{friends.map((friend) => <button key={friend.userId} type="button" onClick={() => onSelect(friend)} className="flex min-h-[76px] w-full items-center gap-3 rounded-2xl border border-border/60 bg-background px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><FrogSnapshot width={68} height={60} indices={friend.indices} visualOffsetY={0} /><span className="min-w-0 flex-1 truncate text-[14px] font-black text-foreground">{friend.name || friend.frogName}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /></button>)}</div></DialogBody>}</BaseSheet>;
}

export function KeepsakeSheet({ item, onClose, pinnedId, onPin, busy, error }: { item: Keepsake | null; onClose: () => void; pinnedId?: string | null; onPin: (id: KeepsakeId | null) => Promise<boolean>; busy: boolean; error: string | null }) {
  const wearing = pinnedId === item?.id;
  return <BaseSheet open={!!item} onOpenChange={(value) => { if (!value) onClose(); }} showClose={false} className="sm:max-w-md">{({ bindScroll }) => item && <DialogBody title="A little memory" onClose={onClose} bindScroll={bindScroll}><div className="text-center"><div className={cn('mx-auto grid h-28 w-28 place-items-center rounded-full border-4 text-6xl shadow-sm', item.earnedAt ? 'border-primary/15 bg-primary/10' : 'border-border bg-muted grayscale')} aria-hidden>{item.emoji}</div><h3 className="mt-5 text-2xl font-black tracking-tight text-foreground">{item.name}</h3><p className="mx-auto mt-2 max-w-xs text-[13px] font-medium leading-relaxed text-muted-foreground">{item.description}</p>{item.earnedAt ? <p className="mt-3 text-[12px] font-bold text-primary">{item.partnerName ? 'Earned with ' + item.partnerName + ' · ' : 'Collected · '}{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(item.earnedAt))}</p> : <p className="mt-3 text-[12px] font-bold text-muted-foreground">{item.progress}/{item.required} · Something to look forward to</p>}</div>{error && <p role="alert" className="mt-4 text-center text-[12px] font-bold text-destructive">{error}</p>}<button type="button" disabled={busy || !item.earnedAt} onClick={() => void onPin(wearing ? null : item.id).then((success) => { if (success) onClose(); })} className={cn(POND_PRIMARY, 'mt-6 w-full')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : item.earnedAt ? <Sparkles className="h-4 w-4" aria-hidden /> : <LockKeyhole className="h-4 w-4" aria-hidden />}{!item.earnedAt ? 'Keep showing up together' : wearing ? 'Take off this keepsake' : 'Wear on my pond profile'}</button><p className="mt-3 text-center text-[11px] font-medium text-muted-foreground">Your friends can see the keepsake beside your frog.</p></DialogBody>}</BaseSheet>;
}

export function FocusRoomSheet({ open, room, roomId, serverNow, busy, error, onClose, onAction }: {
  open: boolean; room?: PondRoom | null; roomId?: string | null; serverNow?: number; busy: boolean; error: string | null; onClose: () => void;
  onAction: (action: 'create' | 'join' | 'leave', options?: { roomId?: string; duration?: number }) => Promise<string | null>;
}) {
  const [duration, setDuration] = React.useState<number>(25);
  const [clock, setClock] = React.useState(Date.now());
  const previous = React.useRef<PondRoom | null>(null);
  if (room) previous.current = room;
  const shown = room ?? (roomId && previous.current?.id === roomId ? previous.current : null);
  const skew = React.useMemo(() => (serverNow ?? Date.now()) - Date.now(), [serverNow]);
  const remaining = shown ? Math.max(0, Math.ceil((Date.parse(shown.endsAt) - clock - skew) / 1000)) : 0;
  const finished = !!shown && remaining === 0;
  const openTimer = useFrogodoroUiStore((state) => state.openFocusLauncher);
  React.useEffect(() => { if (!open) return; setClock(Date.now()); const interval = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(interval); }, [open]);
  return <BaseSheet open={open} onOpenChange={(value) => { if (!value) onClose(); }} showClose={false} className="sm:max-w-lg">{({ bindScroll }) => <DialogBody title={shown ? 'A little quiet company' : 'Pull up a lily pad'} onClose={onClose} bindScroll={bindScroll}>
    {shown ? <><div className="flex min-h-[148px] flex-wrap items-end justify-center rounded-[24px] bg-gradient-to-b from-primary/10 to-primary/[.03] px-3 pb-4 pt-3">{shown.members.map((member) => <div key={member.userId} className="flex w-[100px] flex-col items-center"><FrogSnapshot width={104} height={106} indices={member.indices} visualOffsetY={0} /><span className="max-w-[96px] truncate text-[11px] font-black text-foreground">{member.isYou ? 'You' : member.name}</span><span className="mt-1 text-[10px] font-semibold text-muted-foreground">{finished ? 'Showed up' : member.focusing ? 'Focusing' : 'Taking a breath'}</span></div>)}</div><div className="mt-5 text-center"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{finished ? 'A little time well spent' : 'We finish this sitting together'}</p><p className="mt-1 text-5xl font-black tabular-nums tracking-tight text-foreground">{finished ? <Check className="mx-auto h-12 w-12 text-primary" aria-label="Room finished" /> : String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0')}</p><p className="mt-3 text-[13px] font-medium leading-relaxed text-muted-foreground">{finished ? 'A little progress counts. Come back for another sitting.' : 'Work on your own thing. You’ve got company here.'}</p></div>
      {!shown.joined && !finished ? <button type="button" disabled={busy || remaining < 60 || shown.members.length >= ROOM_CAPACITY} onClick={() => void onAction('join', { roomId: shown.id })} className={cn(POND_PRIMARY, 'mt-5 w-full')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Headphones className="h-4 w-4" aria-hidden />}{shown.members.length >= ROOM_CAPACITY ? 'This room is full' : remaining < 60 ? 'This sitting is wrapping up' : 'Join this focus room'}</button> : <button type="button" onClick={() => { onClose(); openTimer(); }} className={cn(POND_PRIMARY, 'mt-5 w-full')}><Headphones className="h-4 w-4" aria-hidden />{finished ? 'See my focus session' : 'Open my timer'}</button>}
      {shown.joined && !finished ? <><button type="button" disabled={busy} onClick={() => void onAction('leave', { roomId: shown.id }).then((result) => { if (result) onClose(); })} className={cn(POND_SECONDARY, 'mt-2 w-full')}>Leave room</button><p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">Leaving the room keeps your personal timer running.</p></> : null}
    </> : <><div className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] bg-primary/10 text-primary"><Headphones className="h-9 w-9" aria-hidden /></div><h3 className="mt-5 text-center text-xl font-black tracking-tight text-foreground">Your own thing. Together.</h3><p className="mx-auto mt-2 max-w-xs text-center text-[13px] font-medium leading-relaxed text-muted-foreground">Start a quiet sitting. Your friends can join your room and finish at the same time.</p><div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="Focus room duration">{ROOM_DURATIONS.map((minutes) => <button key={minutes} type="button" aria-pressed={duration === minutes} onClick={() => setDuration(minutes)} className={cn(POND_SECONDARY, 'min-h-14 flex-col gap-0', duration === minutes && 'border-primary bg-primary/10 text-primary')}><span className="text-lg tabular-nums">{minutes}</span><span className="text-[10px] font-medium">minutes</span></button>)}</div><button type="button" disabled={busy} onClick={() => void onAction('create', { duration })} className={cn(POND_PRIMARY, 'mt-5 w-full')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Headphones className="h-4 w-4" aria-hidden />}{busy ? 'Making room…' : 'Start a room'}</button><p className="mt-3 text-center text-[11px] font-medium text-muted-foreground">Visible to your friends. Up to {ROOM_CAPACITY} frogs.</p></>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2.5 text-[12px] font-bold text-destructive">{error}</p>}
  </DialogBody>}</BaseSheet>;
}
