import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
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

  await connectMongo();
  
  const newTag = {
    id: uuid(),
    name: name.trim(),
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

  await UserModel.updateOne(
    { _id: session.user.id },
    { $pull: { tags: { id } } }
  );

  return NextResponse.json({ ok: true });
}
