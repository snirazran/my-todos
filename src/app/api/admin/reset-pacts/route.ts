import { NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import PactModel, { type PactDoc } from '@/lib/models/Pact';
import UserModel from '@/lib/models/User';
import { releasePactTasks } from '@/lib/pact/commit';
import { notifyTaskChanged } from '@/lib/taskSync';

/**
 * Puts the weekly leap back to never-committed: every pact doc, the tasks any
 * of them wrote into the list, and the whole streak/shield/swap ledger.
 *
 * The tasks matter — leaving them behind would put a fresh commitment on a
 * list that already has last run's sessions on it, which is exactly the state
 * that makes a re-test lie.
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const pacts = await PactModel.find({ userId }).lean<PactDoc[]>();
    for (const pact of pacts) {
      await releasePactTasks({ userId, pact });
    }

    const [deleted] = await Promise.all([
      PactModel.deleteMany({ userId }),
      UserModel.updateOne({ _id: userId }, { $unset: { 'quests.pactStreak': 1 } }),
    ]);

    await notifyTaskChanged(userId);

    return NextResponse.json({
      ok: true,
      pactsDeleted: deleted.deletedCount ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not reset commitments',
      },
      { status: 400 },
    );
  }
}
