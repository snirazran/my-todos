import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { saveActiveFocusCategory } from '@/lib/quests/engine';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const categoryId = String(body.categoryId ?? '');

    if (!categoryId) {
      return NextResponse.json(
        { error: 'Missing categoryId' },
        { status: 400 },
      );
    }

    await connectMongo();
    const result = await saveActiveFocusCategory({ userId, categoryId });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Set active focus failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Set active focus failed' },
      { status: 400 },
    );
  }
}
