import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { GET as getUser } from '@/app/api/user/route';
import { GET as getAdminMe } from '@/app/api/admin/me/route';
import { GET as getQuests } from '@/app/api/quests/route';
import { GET as getFriends } from '@/app/api/friends/route';
import { GET as getFriendRequests } from '@/app/api/friends/request/route';
import { GET as getBuddyInvites } from '@/app/api/buddy/invite/route';
import { GET as getInventory } from '@/app/api/skins/inventory/route';
import { GET as getBackgrounds } from '@/app/api/backgrounds/route';
import { GET as getBuddyState } from '@/app/api/buddy/state/route';

export type BootstrapSlice = {
  ok: boolean;
  status: number;
  data: unknown;
};

async function run(fn: () => Promise<Response>): Promise<BootstrapSlice> {
  try {
    const res = await fn();
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

// Bundles every layout-level GET fired on page load into one round trip.
// Each slice is produced by the real route handler, so shapes and behavior
// stay identical to the individual endpoints.
export async function GET(req: NextRequest) {
  try {
    await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const timezone =
    new URL(req.url).searchParams.get('timezone') || 'UTC';
  const sub = (path: string) =>
    new NextRequest(new URL(path, req.url), { headers: req.headers });

  const [
    user,
    adminMe,
    questsHome,
    friends,
    friendRequests,
    buddyInvites,
    inventorySummary,
    backgrounds,
    buddyState,
  ] = await Promise.all([
    run(() => getUser(sub('/api/user'))),
    run(() => getAdminMe()),
    run(() =>
      getQuests(
        sub(`/api/quests?view=home&timezone=${encodeURIComponent(timezone)}`),
      ),
    ),
    run(() => getFriends(sub(`/api/friends?tz=${encodeURIComponent(timezone)}`))),
    run(() => getFriendRequests()),
    run(() => getBuddyInvites()),
    run(() =>
      getInventory(
        sub(
          `/api/skins/inventory?view=summary&timezone=${encodeURIComponent(timezone)}`,
        ),
      ),
    ),
    run(() => getBackgrounds()),
    run(() => getBuddyState()),
  ]);

  return NextResponse.json(
    {
      user,
      adminMe,
      questsHome,
      friends,
      friendRequests,
      buddyInvites,
      inventorySummary,
      backgrounds,
      buddyState,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
