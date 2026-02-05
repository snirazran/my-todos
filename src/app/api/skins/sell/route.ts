import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { byId } from '@/lib/skins/catalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: Types.ObjectId };

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  let body: { itemId?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const itemId = body.itemId;
  // Default to 1 if not provided or invalid
  const amount = (typeof body.amount === 'number' && body.amount > 0) ? Math.floor(body.amount) : 1;

  if (!itemId || !byId[itemId]) return json({ error: 'Unknown itemId' }, 400);

  await connectMongo();
  const user = (await UserModel.findOne({
    email: session.user.email,
  }).lean()) as LeanUser | null;
  if (!user) return json({ error: 'User not found' }, 404);

  // Check if user has enough items
  const currentCount = user.wardrobe?.inventory?.[itemId] ?? 0;
  if (currentCount < amount) {
    return json({ error: 'Not enough items' }, 400);
  }

  // Calculate refund price (50% of original price) * amount
  const originalPrice = byId[itemId].priceFlies ?? 0;
  const singleRefund = Math.floor(originalPrice / 2);
  const totalRefund = singleRefund * amount;

  // Transaction: Atomic check-and-update to prevent race conditions
  const update: any = {
    $inc: {
      [`wardrobe.inventory.${itemId}`]: -amount,
      'wardrobe.flies': totalRefund,
    },
  };

  const result = await UserModel.updateOne(
    {
      _id: user._id,
      [`wardrobe.inventory.${itemId}`]: { $gte: amount },
    },
    update
  );

  if (result.modifiedCount === 0) {
    return json({ error: 'Failed to sell items (race condition?)' }, 400);
  }

  return json({ ok: true, refund: totalRefund, soldAmount: amount });
}
