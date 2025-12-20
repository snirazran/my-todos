import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();
  const user = await UserModel.findById(session.user.id, { tags: 1 }).lean();
  // Ensure tags is always an array
  return NextResponse.json({ tags: user?.tags ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, color } = await req.json();
  if (!name || !color) {
    return NextResponse.json({ error: 'Name and color required' }, { status: 400 });
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 20) {
    return NextResponse.json({ error: 'Tag name too long (max 20 chars)' }, { status: 400 });
  }

  await connectMongo();
  
  const user = await UserModel.findById(session.user.id, { tags: 1 }).lean();
  if (user?.tags && user.tags.length >= 15) {
    return NextResponse.json({ error: 'Tag limit reached (max 15)' }, { status: 400 });
  }
  
  const newTag = {
    id: uuid(),
    name: trimmedName,
    color,
  };

  await UserModel.updateOne(
    { _id: session.user.id },
    { $push: { tags: newTag } }
  );

  return NextResponse.json({ tag: newTag });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Tag ID required' }, { status: 400 });
  }

  await connectMongo();

  // Find the tag to get its name (for legacy cleanup)
  const user = await UserModel.findById(session.user.id, { tags: 1 }).lean();
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
      { userId: session.user.id },
      { $pull: { tags: { $in: [id, tagToRemove?.name].filter(Boolean) } } }
    ),
    // 2. Remove the tag definition from the user
    UserModel.updateOne(
      { _id: session.user.id },
      { $pull: { tags: { id } } }
    )
  ]);

  return NextResponse.json({ ok: true });
}
