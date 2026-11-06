import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import PromptAnswerModel from '@/lib/models/PromptAnswer';
import { loadJournal } from '@/lib/prompts/daily';

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json({ entries: await loadJournal(userId) });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const id = req.nextUrl.searchParams.get('id') ?? '';
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      return NextResponse.json({ error: 'Missing entry' }, { status: 400 });
    }
    await connectMongo();
    await PromptAnswerModel.deleteOne({ _id: id, userId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
