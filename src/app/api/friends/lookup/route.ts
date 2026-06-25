export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { normalizeFriendCode, areFriends } from '@/lib/friends/code';

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const code = normalizeFriendCode(req.nextUrl.searchParams.get('code') || '');
  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  try {
    await connectMongo();
    const target = await UserModel.findOne({ friendCode: code })
      .select('name frogName')
      .lean();

    if (!target) {
      return NextResponse.json({ error: 'No frog found with that code' }, { status: 404 });
    }
    if (target._id === userId) {
      return NextResponse.json({ error: "That's your own code!" }, { status: 400 });
    }

    const alreadyFriends = await areFriends(userId, target._id);

    return NextResponse.json({
      userId: target._id,
      name: target.name ?? '',
      frogName: target.frogName ?? 'Frog',
      alreadyFriends,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lookup failed' },
      { status: 500 },
    );
  }
}
