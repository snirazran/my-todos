export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import QuestCategoryModel, {
  type QuestCategoryDoc,
} from '@/lib/models/QuestCategory';

const isDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:');

const categoryCoverRef = (categoryId: string) =>
  `/api/quests/cover?type=category&id=${encodeURIComponent(categoryId)}`;

// Public: onboarding runs before an account exists, and the focus-area options
// are global quest categories (not user-specific), so no auth is required.
export async function GET() {
  try {
    await connectMongo();
    const cats = await QuestCategoryModel.find({})
      .sort({ createdAt: 1 })
      .select(
        'categoryId name shortLabel onboardingSentence coverImageUrl coverImageFile accent backgroundFrom backgroundTo',
      )
      .lean<QuestCategoryDoc[]>();

    const macroCategories = cats.map((c) => {
      const hasCover =
        !!c.coverImageFile?.storagePath || isDataUrl(c.coverImageUrl);
      return {
        id: c.categoryId,
        name: c.name,
        shortLabel: c.shortLabel ?? '',
        onboardingSentence: c.onboardingSentence ?? '',
        coverImageUrl: hasCover
          ? categoryCoverRef(c.categoryId)
          : c.coverImageUrl ?? '',
        accent: c.accent,
        backgroundFrom: c.backgroundFrom,
        backgroundTo: c.backgroundTo,
      };
    });

    return NextResponse.json({ macroCategories });
  } catch (err) {
    return NextResponse.json(
      {
        macroCategories: [],
        error: err instanceof Error ? err.message : 'Failed to load categories',
      },
      { status: 500 },
    );
  }
}
