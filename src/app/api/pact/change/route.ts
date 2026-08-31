export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import PactModel from '@/lib/models/Pact';
import { dropPact } from '@/lib/pact/drop';
import { releasePactTasks } from '@/lib/pact/commit';
import { findLivePact, getPactView, newPactId } from '@/lib/pact/engine';
import { notifyTaskChanged } from '@/lib/taskSync';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const action = body.action === 'skip' ? 'skip' : 'drop';
    await connectMongo();

    const { pact: livePact, weekKey } = await findLivePact({ userId, timezone });

    if (action === 'skip') {
      const live = livePact;
      if (live && live.status !== 'skipped') {
        await releasePactTasks({ userId, pact: live });
        live.taskIds = [];
        await live.save();
      }
      await PactModel.updateOne(
        { userId, weekKey },
        {
          $setOnInsert: {
            pactId: newPactId(),
            categoryId: '',
            commitmentText: 'Skipped this week',
            days: [],
            startTime: '',
            target: 0,
            progress: 0,
            taskIds: [],
            source: 'library',
          },
          $set: { status: 'skipped', settledAt: new Date() },
        },
        { upsert: true },
      );
      await recordAnalyticsEvent({
        userId,
        name: 'pact_skipped',
        properties: { week_key: weekKey },
      });
      await notifyTaskChanged(userId);
      const view = await getPactView({ userId, timezone });
      return NextResponse.json({ ok: true, view });
    }

    const pact = livePact;
    if (!pact || pact.status === 'skipped') {
      return NextResponse.json({ error: 'No pact to change' }, { status: 400 });
    }
    // Finished is finished, collected or not. Allowing a swap after the last
    // session would let a kept week be thrown away — and, since a fresh pact
    // could then be committed in the same week, let one week be farmed twice.
    if (pact.claimedAt || pact.progress >= pact.target) {
      return NextResponse.json(
        { error: 'This week is already finished' },
        { status: 400 },
      );
    }

    // A week already past saving cannot be swapped out of its own outcome.
    const view = await getPactView({ userId, timezone });
    const holdable = view.active?.canHoldStreak ?? true;

    const { usedToken } = await dropPact({
      userId,
      pact,
      source: 'swap',
      holdable,
    });

    await notifyTaskChanged(userId);

    const next = await getPactView({ userId, timezone });
    return NextResponse.json({ ok: true, usedToken, view: next });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update' },
      { status: 400 },
    );
  }
}
