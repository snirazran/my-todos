'use client';

import { SWRConfig } from 'swr';
import { BuddyStartFlow } from '@/components/ui/BuddyStartFlow';
import type { FriendSummary } from '@/lib/friends/indices';

const FRIENDS: FriendSummary[] = [
  { userId: 'maya', name: 'Maya', frogName: 'Pebble', indices: { skin: 1, hat: 3, body: 3, hand_item: 0 }, fliesToday: 12 },
  { userId: 'noam', name: 'Noam', frogName: 'Beans', indices: { skin: 2, hat: 4, body: 0, hand_item: 3 }, fliesToday: 8 },
];

if (typeof window !== 'undefined' && !(window as any).__buddyMock) {
  (window as any).__buddyMock = true;
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/api/buddy/invite')
      ? new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })), 300))
      : real(input, init);
}

export default function BuddyFlowPreview() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = `/api/buddy/shareable?timezone=${encodeURIComponent(tz)}`;
  return (
    <SWRConfig
      value={{
        fallback: {
          [key]: {
            habits: [
              { id: 'h1', text: 'Take 3 deep breaths', schedule: 'Every day' },
              { id: 'h2', text: 'Get out of bed', schedule: 'Every day' },
              { id: 'h3', text: 'Workout', schedule: 'Mon · Wed · Fri' },
            ],
            today: [{ id: 't1', text: 'Call grandma', schedule: 'Today' }],
          },
          '/api/buddy/state': { bonusFlies: 5, byTaskId: {} },
        },
        revalidateOnMount: false,
      }}
    >
      <BuddyStartFlow open onClose={() => {}} friends={FRIENDS} indices={{ skin: 1, hat: 0, body: 0, hand_item: 0 }} source="preview" />
    </SWRConfig>
  );
}
