import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { saveFocusProfile } from '@/lib/quests/engine';
import type { FocusCategoryTagMap, MacroCategoryId } from '@/lib/quests/types';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const timezone = body.timezone || 'UTC';
    await connectMongo();

    const categories = await QuestCategoryModel.find({})
      .select('categoryId')
      .lean<Array<{ categoryId: string }>>();
    const validCategoryIds = new Set(
      categories.map((category) => category.categoryId),
    );
    const isValidCategoryId = (value: string): value is MacroCategoryId =>
      validCategoryIds.has(value);

    const selectedCategoryIds = Array.isArray(body.selectedCategoryIds)
      ? body.selectedCategoryIds.filter((value: string) => isValidCategoryId(value))
      : [];
    const categoryTagMap = (Array.isArray(body.categoryTagMap)
      ? body.categoryTagMap
      : []
    )
      .filter(
        (entry: FocusCategoryTagMap) =>
          isValidCategoryId(entry.categoryId) &&
          Array.isArray(entry.tagIds) &&
          entry.tagIds.length > 0,
      )
      .map((entry: FocusCategoryTagMap) => ({
        categoryId: entry.categoryId,
        tagIds: entry.tagIds.slice(0, 1),
      }));

    if (!selectedCategoryIds.length) {
      return NextResponse.json(
        { error: 'Select at least one focus category' },
        { status: 400 },
      );
    }

    const dashboard = await saveFocusProfile({
      userId,
      selectedCategoryIds,
      categoryTagMap,
      createSuggestions: body.createSuggestions === true,
      timezone,
    });

    return NextResponse.json({
      ok: true,
      onboarding: {
        complete: !!dashboard.focusProfile.completedAt,
        selectedCategoryIds: dashboard.focusProfile.selectedCategoryIds,
        categoryTagMap: dashboard.focusProfile.categoryTagMap,
      },
    });
  } catch (error) {
    console.error('Quest onboarding failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Onboarding failed' },
      { status: 400 },
    );
  }
}
