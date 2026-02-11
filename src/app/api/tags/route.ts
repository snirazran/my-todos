import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const user = await UserModel.findById(userId, {
      tags: 1,
      premiumUntil: 1,
    }).lean();

    const now = new Date();
    const isPremium = user?.premiumUntil
      ? new Date(user.premiumUntil) > now
      : false;
    const freeLimit = 3;

    const tags = (user?.tags ?? []).map((tag: any, index: number) => ({
      ...tag,
      disabled: !isPremium && index >= freeLimit,
    }));

    return NextResponse.json({ tags, isPremium });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { name, color } = await req.json();
    if (!name || !color) {
      return NextResponse.json(
        { error: 'Name and color required' },
        { status: 400 },
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 20) {
      return NextResponse.json(
        { error: 'Tag name too long (max 20 chars)' },
        { status: 400 },
      );
    }

    await connectMongo();

    const user = await UserModel.findById(userId, {
      tags: 1,
      premiumUntil: 1,
    }).lean();

    const now = new Date();
    const isPremium = user?.premiumUntil
      ? new Date(user.premiumUntil) > now
      : false;
    const TAG_LIMIT = isPremium ? 50 : 3;

    if (user?.tags && user.tags.length >= TAG_LIMIT) {
      return NextResponse.json(
        {
          error: `Tag limit reached (${user.tags.length}/${TAG_LIMIT}). ${!isPremium ? 'Upgrade to Premium for more!' : ''}`,
        },
        { status: 400 },
      );
    }

    const newTag = {
      id: uuid(),
      name: trimmedName,
      color,
    };

    await UserModel.updateOne({ _id: userId }, { $push: { tags: newTag } });

    return NextResponse.json({ tag: newTag });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Tag ID required' }, { status: 400 });
    }

    await connectMongo();

    // Find the tag to get its name (for legacy cleanup)
    const user = await UserModel.findById(userId, { tags: 1 }).lean();
    const tagToRemove = user?.tags?.find((t: any) => t.id === id);

    const pullQuery: any = { tags: id };
    if (tagToRemove?.name) {
      // If we found the tag name, also try to pull it (legacy tasks might have stored name)
      // We use $in to match either ID or Name
      pullQuery.tags = { $in: [id, tagToRemove.name] };
    }

    // Run updates in parallel for better performance
    await Promise.all([
      // 1. Remove this tag (ID or Name) from all tasks belonging to this user
      TaskModel.updateMany(
        { userId: userId },
        { $pull: { tags: { $in: [id, tagToRemove?.name].filter(Boolean) } } },
      ),
      // 2. Remove the tag definition from the user
      UserModel.updateOne({ _id: userId }, { $pull: { tags: { id } } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
