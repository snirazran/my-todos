import { NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestModel from '@/lib/models/Quest';
import QuestCounterModel from '@/lib/models/QuestCounter';
import UserModel from '@/lib/models/User';

export async function POST() {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const [quests, counters] = await Promise.all([
      QuestModel.deleteMany({ userId }),
      QuestCounterModel.deleteMany({ userId }),
      UserModel.updateOne(
        { _id: userId },
        {
          $set: {
            focusProfile: {
              selectedCategoryIds: [],
              categoryTagMap: [],
              unlockedAnimationIds: [],
            },
          },
        },
      ),
    ]);

    return NextResponse.json({
      ok: true,
      questsDeleted: quests.deletedCount ?? 0,
      countersDeleted: counters.deletedCount ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not reset quests',
      },
      { status: 400 },
    );
  }
}
