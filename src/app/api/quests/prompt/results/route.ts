import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { loadPromptResults } from '@/lib/prompts/daily';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const promptId = req.nextUrl.searchParams.get('promptId') ?? '';
    if (!promptId) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 });
    }
    return NextResponse.json(await loadPromptResults(userId, promptId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load results' },
      { status: 400 },
    );
  }
}
