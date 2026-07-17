import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { getMacroCategory } from '@/lib/quests/catalog';
import { getZonedToday } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    if (!categoryId) {
      return NextResponse.json({ error: 'Choose a focus area' }, { status: 400 });
    }

    await connectMongo();
    const user = await UserModel.findById(userId, { focusProfile: 1 }).lean<{
      focusProfile?: {
        selectedCategoryIds?: string[];
        categoryTagMap?: Array<{ categoryId: string; tagIds: string[] }>;
      };
    }>();
    if (!user?.focusProfile?.selectedCategoryIds?.includes(categoryId)) {
      return NextResponse.json({ error: 'This focus area is not active' }, { status: 403 });
    }

    const storedCategory = await QuestCategoryModel.findOne(
      { categoryId },
      { name: 1, accent: 1 },
    ).lean<{ name?: string; accent?: string }>();
    const builtIn = getMacroCategory(categoryId);
    const name = storedCategory?.name || builtIn?.name || 'Focus area';
    const accent = storedCategory?.accent || builtIn?.accent || '#22c55e';
    const tags = user.focusProfile.categoryTagMap?.find(
      (entry) => entry.categoryId === categoryId,
    )?.tagIds ?? [];
    const id = `focus-area:${categoryId}`;

    const task = await TaskModel.findOneAndUpdate(
      { userId, id },
      {
        $set: {
          type: 'focus-area',
          text: name,
          tags,
          focusAreaId: categoryId,
        },
        $unset: { deletedAt: 1 },
        $setOnInsert: {
          userId,
          id,
          order: 0,
          completed: false,
          completedDates: [],
          suppressedDates: [],
          frogodoroSessions: [],
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    const today = getZonedToday(timezone);
    return NextResponse.json({
      task: {
        id,
        text: name,
        completed: false,
        tags,
        frogodoroSettings: task?.frogodoroSettings,
        frogodoroSession:
          task?.frogodoroSessions?.find((session) => session.date === today) ?? null,
      },
      area: { id: categoryId, name, accent },
    });
  } catch (error) {
    console.error('Focus target creation failed:', error);
    return NextResponse.json({ error: 'Focus timer could not be opened' }, { status: 500 });
  }
}
