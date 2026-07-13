import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

const INTRO_KEYS = new Set(['bellyFull', 'frogodoro', 'savedTask']);

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const user = await UserModel.findById(userId, { seenIntros: 1 }).lean();
    return NextResponse.json({ seenIntros: user?.seenIntros ?? {} });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const intro = String(body?.intro ?? '');
    if (!INTRO_KEYS.has(intro)) {
      return NextResponse.json({ error: 'Unknown intro' }, { status: 400 });
    }
    await connectMongo();
    await UserModel.updateOne(
      { _id: userId },
      { $set: { [`seenIntros.${intro}`]: true } },
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
