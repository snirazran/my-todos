export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { getPactView } from '@/lib/pact/engine';
import { movePactSession, PactMoveError } from '@/lib/pact/move';
import { notifyTaskChanged } from '@/lib/taskSync';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const taskId = typeof body.taskId === 'string' ? body.taskId : '';
    if (!taskId) {
      return NextResponse.json({ error: 'Missing session' }, { status: 400 });
    }

    const result = await movePactSession({
      userId,
      timezone,
      taskId,
      toDay: Number(body.toDay),
    });

    // The session now sits on a different day, so every board on every device
    // is showing it in the wrong place until they hear about it.
    await notifyTaskChanged(userId);

    const view = await getPactView({ userId, timezone });
    return NextResponse.json({ ...view, moved: result });
  } catch (error) {
    if (error instanceof PactMoveError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Pact session move failed:', error);
    return NextResponse.json({ error: 'Could not move it' }, { status: 500 });
  }
}
