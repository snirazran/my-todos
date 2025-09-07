import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import type { UserDoc, UserWardrobe } from '@/lib/types/UserDoc';
import { byId } from '@/lib/skins/catalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  let body: { itemId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const itemId = body.itemId;
  if (!itemId || !byId[itemId]) return json({ error: 'Unknown itemId' }, 400);

  const db = (await clientPromise).db('todoTracker');
  const users = db.collection<UserDoc>('users');

  const user = await users.findOne({ email: session.user.email });
  if (!user) return json({ error: 'User not found' }, 404);

  // init if missing
  if (!user.wardrobe) {
    const init: UserWardrobe = {
      equipped: {},
      inventory: { [itemId]: 1 },
      flies: 0,
    };
    await users.updateOne({ _id: user._id }, { $set: { wardrobe: init } });
    return json({ ok: true });
  }

  // For now: allow only one copy per item to keep UX simple
  if ((user.wardrobe.inventory?.[itemId] ?? 0) > 0) {
    return json({ ok: true, message: 'Already owned' });
  }

  await users.updateOne(
    { _id: user._id },
    { $inc: { [`wardrobe.inventory.${itemId}`]: 1 } }
  );

  return json({ ok: true });
}
