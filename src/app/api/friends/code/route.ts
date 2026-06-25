export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { ensureFriendCode } from '@/lib/friends/code';

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const code = await ensureFriendCode(userId);
    const user = await UserModel.findById(userId).select('name frogName').lean();
    return NextResponse.json({
      code,
      name: user?.name ?? '',
      frogName: user?.frogName ?? 'Frog',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load code' },
      { status: 500 },
    );
  }
}
