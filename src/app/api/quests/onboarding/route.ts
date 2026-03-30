import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';
import { saveFocusProfile } from '@/lib/quests/engine';
import type { FocusCategoryTagMap, MacroCategoryId } from '@/lib/quests/types';

function isMacroCategoryId(value: string): value is MacroCategoryId {
  return QUEST_MACRO_CATEGORIES.some((category) => category.id === value);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const timezone = body.timezone || 'UTC';
    const selectedCategoryIds = Array.isArray(body.selectedCategoryIds)
      ? body.selectedCategoryIds.filter((value: string) => isMacroCategoryId(value))
      : [];
    const categoryTagMap = (Array.isArray(body.categoryTagMap)
      ? body.categoryTagMap
      : []
    ).filter(
      (entry: FocusCategoryTagMap) =>
        isMacroCategoryId(entry.categoryId) &&
        Array.isArray(entry.tagIds) &&
        entry.tagIds.length > 0,
    );

    if (!selectedCategoryIds.length) {
      return NextResponse.json(
        { error: 'Select at least one focus category' },
        { status: 400 },
      );
    }

    await connectMongo();
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
