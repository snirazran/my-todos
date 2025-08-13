// app/api/skins/shop/route.ts
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import type { UserDoc, UserSkins } from '@/lib/types/UserDoc';
import { byId } from '@/lib/skins/catalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  let body: { skinId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const skinId = body.skinId;
  if (!skinId || !byId[skinId]) return json({ error: 'Unknown skinId' }, 400);

  const db = (await clientPromise).db('todoTracker');
  const users = db.collection<UserDoc>('users');

  const user = await users.findOne({ email: session.user.email });
  if (!user) return json({ error: 'User not found' }, 404);

  // Initialize skins if missing
  if (!user.skins) {
    const initSkins: UserSkins = {
      equippedId: null,
      inventory: { [skinId]: 1 },
      flies: 0,
    };
    await users.updateOne({ _id: user._id }, { $set: { skins: initSkins } });
    return json({ ok: true });
  }

  // For now, allow only one copy per skin (prevent infinite free buys)
  const alreadyOwned = (user.skins.inventory?.[skinId] ?? 0) > 0;
  if (alreadyOwned) {
    return json({ ok: true, message: 'Already owned' });
  }

  await users.updateOne(
    { _id: user._id },
    { $inc: { [`skins.inventory.${skinId}`]: 1 } }
  );

  return json({ ok: true });
}
