'use client';

import React from 'react';
import { SWRConfig } from 'swr';
import { PondHero } from '@/components/ui/friends/PondHero';
import { FriendRow } from '@/components/ui/friends/FriendRow';
import { SharedHabits, PondFocusSection, KeepsakeShelf, PondSectionTitle } from '@/components/ui/friends/PondSocial';
import { BuddyPickerSheet, KeepsakeSheet, FocusRoomSheet } from '@/components/ui/friends/PondSheets';
import { GrowPondCard } from '@/components/ui/friends/GrowPondCard';
import { BuddyUpFlow } from '@/components/ui/BuddyUpFlow';
import type { FriendSummary } from '@/lib/friends/indices';
import { KEEPSAKES, partyKeepsake, type Keepsake, type PondData } from '@/lib/friends/social';

const indices = { skin: 0, hat: 6, body: 1, hand_item: 0 };
const FRIENDS: FriendSummary[] = [
  { userId: 'maya', name: 'Maya', frogName: 'Pebble', indices: { skin: 1, hat: 3, body: 3, hand_item: 0 }, fliesToday: 12, tasksToday: 3, focusing: true, pinnedKeepsakeId: 'quiet-company' },
  { userId: 'noam', name: 'Noam', frogName: 'Beans', indices: { skin: 2, hat: 4, body: 0, hand_item: 3 }, fliesToday: 8, tasksToday: 2, pinnedKeepsakeId: 'seven-together' },
  { userId: 'alex', name: 'Alex with a very long display name', frogName: 'Sprout', indices: { skin: 0, hat: 1, body: 0, hand_item: 1 }, fliesToday: 0, tasksToday: 0 },
];
const TODAY = new Intl.DateTimeFormat('en-CA').format(new Date());
const KEEPSAKE_ITEMS: Keepsake[] = [...KEEPSAKES.map((item, index) => ({ ...item, progress: index < 2 ? item.required : 0, earnedAt: index < 2 ? new Date().toISOString() : null, partnerName: 'Maya' })), { ...partyKeepsake(TODAY.slice(0, 7)), earnedAt: null, progress: 2 }];

export function FriendsPreview() {
  const [state, setState] = React.useState('active');
  const [done, setDone] = React.useState(false);
  const [buddyPicker, setBuddyPicker] = React.useState(false);
  const [buddy, setBuddy] = React.useState<FriendSummary | null>(null);
  const [keepsake, setKeepsake] = React.useState<Keepsake | null>(null);
  const [pinned, setPinned] = React.useState<string | null>('first-duo');
  const [roomOpen, setRoomOpen] = React.useState(false);
  const [selectedRoom, setSelectedRoom] = React.useState<string | null>(null);
  const [joined, setJoined] = React.useState(false);
  const [claimed, setClaimed] = React.useState(false);
  const friends = state === 'empty' ? [] : FRIENDS.map((friend) => ({ ...friend, focusing: state !== 'quiet' && friend.focusing, tasksToday: state === 'quiet' ? 0 : friend.tasksToday }));
  const endsAt = React.useMemo(() => new Date(Date.now() + 25 * 60_000).toISOString(), []);
  const data: PondData = {
    today: TODAY, serverNow: Date.now(), pinnedKeepsakeId: pinned as PondData['pinnedKeepsakeId'], keepsakes: KEEPSAKE_ITEMS,
    habits: state === 'empty' || state === 'quiet' ? [] : [{ bondId: 'read', taskId: 'read', text: 'Read 10 pages', partnerId: 'maya', partnerName: 'Maya', partnerIndices: FRIENDS[0].indices, schedule: 'Every day', dueToday: true, mineDone: done, partnerDone: true, togetherCount: 6, streak: 3, weekProgress: done ? 4 : 3 }],
    rooms: state !== 'active' ? [] : [{ id: 'room', hostId: 'maya', hostName: 'Maya', duration: 25, endsAt, joined, members: [{ userId: 'maya', name: 'Maya', indices: FRIENDS[0].indices, focusing: true, isYou: false }, ...(joined ? [{ userId: 'you', name: 'You', indices, focusing: true, isYou: true }] : [])] }],
    weekReward: { required: 5, giftName: 'a Rare Gift', enabled: true, earned: false },
  };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const fallback = {
    ['/api/friends/reactions?tz=' + encodeURIComponent(timezone)]: { reactions: [], unseenCount: 0, sentToday: {}, cheerFlies: 0, cheerPaidLeft: 0 },
    '/api/buddy/state': { byTaskId: {}, bonusFlies: 5 },
    '/api/invite/config': { rewards: [{ tier: 1, label: 'First friend', item: { id: 'hat_sailor', name: 'Sailor Hat', slot: 'hat', riveIndex: 6 } }] },
    '/api/invite/status': { claimedCount: 0, pendingCount: 0 },
    '/api/friends/suggestions': { suggestions: [] },
  };
  React.useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      if (path.startsWith('/api/friends/reactions') && init?.method === 'POST') return Response.json({ earned: 0 });
      return original(input, init);
    };
    return () => { window.fetch = original; };
  }, []);
  return <SWRConfig value={{ provider: () => new Map(), fallback, isPaused: () => true }}>
    <main className="relative min-h-screen overflow-x-hidden pb-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-emerald-100/70 via-primary/5 to-transparent dark:from-emerald-950/60 dark:via-primary/5" />
      <nav aria-label="Preview states" className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 px-3 py-3 text-[11px] text-muted-foreground"><span>Design preview</span>{['active', 'quiet', 'empty'].map((variant) => <button key={variant} type="button" onClick={() => setState(variant)} aria-pressed={state === variant} className="min-h-9 rounded-full border border-border bg-card px-3 font-bold">{variant}</button>)}<button type="button" onClick={() => document.documentElement.classList.toggle('dark')} className="min-h-9 rounded-full border border-border bg-card px-3 font-bold">Theme</button></nav>
      <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-3 pb-4 pt-3 md:px-6">
        <PondHero indices={indices} friends={friends} paused={buddyPicker || !!buddy || roomOpen || !!keepsake} hunger={18_000_000} maxHunger={28_800_000} claimable={claimed || !friends.length ? 0 : 8} claiming={false} gate={{ required: 2, done: 2, open: true }} pinnedKeepsakeId={pinned} onClaim={() => setClaimed(true)} onOpenFriend={(friend) => setBuddy(friend)} onInvite={() => setBuddyPicker(true)} />
        <div className="relative z-20 -mx-3 -mt-12 flex w-[calc(100%+1.5rem)] flex-col gap-6 px-3 pt-16 md:mx-auto md:-mt-6 md:w-full md:max-w-3xl md:px-8 md:pt-14">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-[linear-gradient(to_bottom,transparent,hsl(var(--background))_40px)]" />
          <SharedHabits data={data} indices={indices} completedById={{ read: done }} onComplete={async () => setDone((value) => !value)} onStart={() => setBuddyPicker(true)} hasFriends={!!friends.length} paused={false} />
          <PondFocusSection rooms={data.rooms} hasFriends={!!friends.length} onOpen={(id) => { setSelectedRoom(id ?? null); setRoomOpen(true); }} onInvite={() => setBuddyPicker(true)} />
          {!!friends.length && <section><PondSectionTitle title="Your people" subtitle="3 friends. Lots of little possibilities." /><ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{friends.map((friend, index) => <FriendRow key={friend.userId} entry={friend} animate={index < 2} paused={roomOpen || !!keepsake} onOpen={() => setBuddy(friend)} onBuddyUp={() => setBuddy(friend)} />)}</ul></section>}
          <KeepsakeShelf keepsakes={data.keepsakes} pinnedId={pinned} onSelect={setKeepsake} />
          <GrowPondCard enabled paused={roomOpen} onInvite={() => setBuddyPicker(true)} onAdd={() => setBuddyPicker(true)} />
        </div>
      </div>
      <BuddyPickerSheet open={buddyPicker} friends={FRIENDS} onClose={() => setBuddyPicker(false)} onSelect={(friend) => { setBuddyPicker(false); setBuddy(friend); }} />
      <BuddyUpFlow open={!!buddy} friend={buddy} onClose={() => setBuddy(null)} />
      <KeepsakeSheet item={keepsake} pinnedId={pinned} onClose={() => setKeepsake(null)} onPin={async (id) => { setPinned(id); return true; }} busy={false} error={null} />
      <FocusRoomSheet open={roomOpen} roomId={selectedRoom} room={data.rooms.find((room) => room.id === selectedRoom)} serverNow={data.serverNow} busy={false} error={null} onClose={() => setRoomOpen(false)} onAction={async (action) => { if (action === 'leave') { setJoined(false); return 'room'; } setJoined(true); setSelectedRoom('room'); return 'room'; }} />
    </main>
  </SWRConfig>;
}
