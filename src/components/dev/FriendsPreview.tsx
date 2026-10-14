'use client';

import React from 'react';
import { SWRConfig } from 'swr';
import { PondHero } from '@/components/ui/friends/PondHero';
import { FriendRow } from '@/components/ui/friends/FriendRow';
import { TogetherSection, KeepsakeShelf, PondSectionHeader } from '@/components/ui/friends/PondSocial';
import { FriendSuggestionsRow } from '@/components/ui/FriendSuggestionsRow';
import { FriendsPageSkeleton } from '@/components/ui/Skeleton';
import { BuddyPickerSheet, KeepsakeSheet, FocusRoomSheet } from '@/components/ui/friends/PondSheets';
import { GrowPondCard } from '@/components/ui/friends/GrowPondCard';
import { FriendDetailModal } from '@/components/ui/FriendDetailModal';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { BuddyGoalSheet } from '@/components/ui/buddy/BuddyGoalSheet';
import { CATALOG } from '@/lib/skins/catalog';
import { BuddyUpFlow } from '@/components/ui/BuddyUpFlow';
import type { FriendSummary } from '@/lib/friends/indices';
import { KEEPSAKES, partyKeepsake, type Keepsake, type PondData } from '@/lib/friends/social';

const indices = { skin: 0, hat: 6, body: 1, hand_item: 0 };
const FRIENDS: FriendSummary[] = [
  { userId: 'maya', name: 'Maya', frogName: 'Pebble', indices: { skin: 1, hat: 3, body: 3, hand_item: 0 }, fliesToday: 12, tasksToday: 3, focusing: true, pinnedKeepsakeId: 'quiet-company', streak: 12, premium: true },
  { userId: 'noam', name: 'Noam', frogName: 'Beans', indices: { skin: 2, hat: 4, body: 0, hand_item: 3 }, fliesToday: 8, tasksToday: 2, pinnedKeepsakeId: 'seven-together', streak: 4 },
  { userId: 'alex', name: 'Alex with a very long display name', frogName: 'Sprout', indices: { skin: 0, hat: 1, body: 0, hand_item: 1 }, fliesToday: 0, tasksToday: 0 },
  { userId: 'leo', name: 'Leo', frogName: 'Puddle', indices: { skin: 1, hat: 0, body: 1, hand_item: 0 }, fliesToday: 4, tasksToday: 1, streak: 1 },
];
const GIFTS = ['skin_blue', 'body_sailor_scarf', 'hat_pirate', 'skin_rainbow'].map(id => { const item = CATALOG.find(item => item.id === id)!; return { id, name: item.name, itemId: id, item }; });
const PREVIEW_CONFIG = { headline: 'Share Frogress, get rewards!', subheading: 'Invite a friend to gift them an outfit and earn rewards for yourself!', shareTitle: 'Join my pond', shareMessage: 'A welcome gift for you', giftOptions: GIFTS, rewards: ['hat_sailor', 'hat_pirate', 'skin_rainbow'].map((id, index) => { const item = CATALOG.find(item => item.id === id)!; return { tier: index + 1, label: (index + 1) + ['st', 'nd', 'rd'][index] + ' friend', item, itemId: id, rewards: [{ type: 'ITEM', itemId: id }] }; }) };
const previewCache = () => new Map();
const TODAY = new Intl.DateTimeFormat('en-CA').format(new Date());
const KEEPSAKE_ITEMS: Keepsake[] = [...KEEPSAKES.map((item, index) => ({ ...item, progress: index < 2 ? item.required : 0, earnedAt: index < 2 ? new Date().toISOString() : null, partnerName: 'Maya' })), { ...partyKeepsake(TODAY.slice(0, 7)), earnedAt: null, progress: 2 }];

export function FriendsPreview() {
  const [detail, setDetail] = React.useState<FriendSummary | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [goalOpen, setGoalOpen] = React.useState(false);
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
    habits: state === 'empty' || state === 'quiet' ? [] : [{ bondId: 'read', taskId: 'read', text: 'Read 10 pages', partnerId: 'maya', partnerName: 'Maya', partnerIndices: FRIENDS[0].indices, schedule: 'Every day', dueToday: true, mineDone: done, partnerDone: true, togetherCount: 6, streak: 3, weekProgress: done ? 4 : 3 }, { bondId: 'walk', taskId: 'walk', text: 'Evening walk', partnerId: 'noam', partnerName: 'Noam', partnerIndices: FRIENDS[1].indices, schedule: 'Mon, Wed, Fri', dueToday: true, mineDone: false, partnerDone: false, togetherCount: 2, streak: 0, weekProgress: 1 }],
    rooms: state !== 'active' ? [] : [{ id: 'room', hostId: 'maya', hostName: 'Maya', duration: 25, endsAt, joined, members: [{ userId: 'maya', name: 'Maya', indices: FRIENDS[0].indices, focusing: true, isYou: false }, ...(joined ? [{ userId: 'you', name: 'You', indices, focusing: true, isYou: true }] : [])] }],
    weekReward: { required: 5, giftName: 'a Rare Gift', giftRiveIndex: 1, enabled: true, earned: false },
  };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const fallback = {
    ['/api/friends/reactions?tz=' + encodeURIComponent(timezone)]: { reactions: [], unseenCount: 0, sentToday: {}, cheerFlies: 0, cheerPaidLeft: 0 },
    '/api/buddy/state': { byTaskId: {}, bonusFlies: 5 },
    '/api/invite/config': PREVIEW_CONFIG,
    '/api/buddy/invite': { incoming: [], outgoing: [] },
    '/api/skins/inventory': { wardrobe: { equipped: {}, inventory: {}, flies: 0 }, catalog: CATALOG },
    '/api/backgrounds': { catalog: [], equipped: null, inventory: {}, flies: 0 },
    '/api/invite/status': { claimedCount: 0, pendingCount: 0 },
    '/api/friends/suggestions': { suggestions: state === 'empty' ? [{ userId: 'dana', name: 'Dana', frogName: 'Lily', indices: { skin: 2, hat: 1, body: 0, hand_item: 0 }, reason: 'mutual', mutualCount: 2, mutualNames: ['Maya', 'Noam'] }] : [] },
  };
  React.useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      if (path.startsWith('/api/friends/reactions') && init?.method === 'POST') return Response.json({ earned: 0 });
      if (path.startsWith('/api/') && init?.method && init.method !== 'GET') return Response.json({ error: 'This is a design preview.' }, { status: 400 });
      return original(input, init);
    };
    return () => { window.fetch = original; };
  }, []);
  if (state === 'skeleton') return <><nav aria-label="Preview states" className="relative z-50 flex justify-center py-2"><button type="button" onClick={() => setState('active')} className="min-h-9 rounded-full border border-border bg-card px-3 text-[11px] font-bold">active</button></nav><FriendsPageSkeleton /></>;
  return <SWRConfig value={{ provider: previewCache, fallback, isPaused: () => true }}>
    <main className="relative min-h-screen overflow-x-hidden pb-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-emerald-100/70 via-primary/5 to-transparent dark:from-emerald-950/60 dark:via-primary/5" />
      <nav aria-label="Preview states" className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 px-3 py-3 text-[11px] text-muted-foreground"><span>Design preview</span><button type="button" onClick={() => setGoalOpen(true)} className="min-h-9 rounded-full border border-border bg-card px-3 font-bold">Buddy invite</button>{['active', 'gated', 'quiet', 'empty', 'skeleton'].map((variant) => <button key={variant} type="button" onClick={() => setState(variant)} aria-pressed={state === variant} className="min-h-9 rounded-full border border-border bg-card px-3 font-bold">{variant}</button>)}<button type="button" onClick={() => document.documentElement.classList.toggle('dark')} className="min-h-9 rounded-full border border-border bg-card px-3 font-bold">Theme</button></nav>
      <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-3 pb-4 pt-3 md:px-6">
        <PondHero indices={indices} friends={friends} paused={buddyPicker || !!buddy || roomOpen || !!keepsake || !!detail || inviteOpen || goalOpen} hunger={18_000_000} maxHunger={28_800_000} claimable={claimed || !friends.length || state === 'quiet' ? 0 : 8} claiming={false} gate={state === 'gated' ? { required: 3, done: 1, open: false } : { required: 2, done: 2, open: true }} pinnedKeepsakeId={pinned} onClaim={() => setClaimed(true)} onOpenFriend={setDetail} onInvite={() => setInviteOpen(true)} />
        <div className="relative z-20 -mx-3 -mt-12 flex w-[calc(100%+1.5rem)] flex-col gap-7 px-3 pt-16 md:mx-auto md:-mt-6 md:w-full md:max-w-3xl md:gap-9 md:px-8 md:pt-14">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-[linear-gradient(to_bottom,transparent,hsl(var(--background))_40px)]" />
          {!!friends.length && <TogetherSection data={data} completedById={{ read: done }} onComplete={async () => setDone((value) => !value)} onStartBuddy={() => setBuddyPicker(true)} onOpenRoom={(id) => { setSelectedRoom(id ?? null); setRoomOpen(true); }} hasFriends={!!friends.length} paused={false} />}
          <section>
            <PondSectionHeader title="Friends" count={friends.length ? String(friends.length) : null} />
            {!!friends.length && <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">{friends.map((friend, index) => <FriendRow key={friend.userId} entry={friend} buddyInvites={index === 2 ? 1 : 0} onOpen={() => setDetail(friend)} />)}</ul>}
            <div className={friends.length ? 'mt-2' : ''}><GrowPondCard enabled emphasize={!friends.length} paused={roomOpen || inviteOpen} onInvite={() => setInviteOpen(true)} /></div>
          </section>
          <FriendSuggestionsRow enabled variant="section" title="People you may know" />
          {!friends.length && <TogetherSection data={data} completedById={{}} onComplete={async () => {}} onStartBuddy={() => setInviteOpen(true)} onOpenRoom={() => setInviteOpen(true)} hasFriends={false} paused={false} />}
          <KeepsakeShelf keepsakes={data.keepsakes} pinnedId={pinned} onSelect={setKeepsake} />
        </div>
      </div>
      <FriendDetailModal entry={detail} allFriends={FRIENDS} onClose={() => setDetail(null)} onRemove={() => setDetail(null)} onBuddyUp={(friend) => { setDetail(null); setBuddy(friend); }} />
      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <BuddyGoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} onSubmit={() => {}} giftOptions={GIFTS} submitLabel="Share invite link" />
      <BuddyPickerSheet open={buddyPicker} friends={FRIENDS} onClose={() => setBuddyPicker(false)} onSelect={(friend) => { setBuddyPicker(false); setBuddy(friend); }} />
      <BuddyUpFlow open={!!buddy} friend={buddy} onClose={() => setBuddy(null)} />
      <KeepsakeSheet item={keepsake} pinnedId={pinned} onClose={() => setKeepsake(null)} onPin={async (id) => { setPinned(id); return true; }} busy={false} error={null} />
      <FocusRoomSheet open={roomOpen} roomId={selectedRoom} room={data.rooms.find((room) => room.id === selectedRoom)} serverNow={data.serverNow} busy={false} error={null} onClose={() => setRoomOpen(false)} onAction={async (action) => { if (action === 'leave') { setJoined(false); return 'room'; } setJoined(true); setSelectedRoom('room'); return 'room'; }} />
    </main>
  </SWRConfig>;
}
