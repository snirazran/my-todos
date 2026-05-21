import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel from '@/lib/models/Background';
import UserModel, { type UserDoc } from '@/lib/models/User';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const id = body.id;
    if (!id) return json({ error: 'Missing background id' }, 400);

    await connectMongo();
    const bg = await BackgroundModel.findOne({ id, hidden: { $ne: true } }).lean();
    if (!bg) return json({ error: 'Unknown background' }, 400);

    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const price = bg.priceFlies ?? 0;

    const update = {
      $inc: {
        [`wardrobe.backgrounds.inventory.${id}`]: 1,
        'wardrobe.flies': -price,
      },
    };

    const result = await UserModel.updateOne(
      { _id: user._id, 'wardrobe.flies': { $gte: price } },
      update,
    );

    if (result.modifiedCount === 0) {
      return json({ error: 'Not enough flies' }, 400);
    }

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
