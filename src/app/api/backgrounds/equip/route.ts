import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel from '@/lib/models/Background';
import UserModel, { type UserDoc } from '@/lib/models/User';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { id?: string | null };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const id = body.id ?? null;

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    if (id === null) {
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { 'wardrobe.backgrounds.equipped': null } },
      );
      return json({ ok: true });
    }

    const bg = await BackgroundModel.findOne({ id, hidden: { $ne: true } }).lean();
    if (!bg) return json({ error: 'Unknown background' }, 400);

    const owned = (user.wardrobe?.backgrounds?.inventory?.[id] ?? 0) > 0;
    if (!owned) return json({ error: 'You do not own this background' }, 403);

    await UserModel.updateOne(
      { _id: user._id },
      { $set: { 'wardrobe.backgrounds.equipped': id } },
    );
    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
