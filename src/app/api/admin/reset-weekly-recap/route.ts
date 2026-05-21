import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    // Reset lastRecapWeek to an empty string so the current week's recap shows again
    await UserModel.updateOne(
      { _id: uid },
      { $set: { lastRecapWeek: '' } }
    );

    return NextResponse.json({ ok: true, message: 'Weekly recap reset successfully' });
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/reset-weekly-recap] error:', err);
    return NextResponse.json({ error: 'Failed to reset recap' }, { status: 500 });
  }
}
