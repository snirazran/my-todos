import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import type { UserWardrobe } from '@/lib/types/UserDoc';
import { byId } from '@/lib/skins/catalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: Types.ObjectId };

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

  await connectMongo();
  const user = (await UserModel.findOne({
    email: session.user.email,
  }).lean()) as LeanUser | null;
  if (!user) return json({ error: 'User not found' }, 404);

  // init if missing
  if (!user.wardrobe) {
    const init: UserWardrobe = {
      equipped: {},
      inventory: { [itemId]: 1 },
      flies: 0,
    };
    await UserModel.updateOne({ _id: user._id }, { $set: { wardrobe: init } });
    return json({ ok: true });
  }

  // For now: allow only one copy per item to keep UX simple
  if ((user.wardrobe.inventory?.[itemId] ?? 0) > 0) {
    return json({ ok: true, message: 'Already owned' });
  }

  await UserModel.updateOne(
    { _id: user._id },
    { $inc: { [`wardrobe.inventory.${itemId}`]: 1 } }
  );

  return json({ ok: true });
}
