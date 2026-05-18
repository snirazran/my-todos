import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import QuestCategoryModel from '@/lib/models/QuestCategory';

export async function GET() {
  try {
    await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const categories = await QuestCategoryModel.find({})
      .select('categoryId name quickAddSuggestions')
      .sort({ createdAt: 1 })
      .lean();

    return NextResponse.json(
      {
        categories: categories.map((c) => ({
          id: c.categoryId,
          name: c.name,
          quickAddSuggestions: Array.isArray(c.quickAddSuggestions)
            ? c.quickAddSuggestions.map((s) => ({
                text: s.text,
                emoji: s.emoji ?? '',
              }))
            : [],
        })),
      },
      {
        headers: { 'Cache-Control': 'private, max-age=60' },
      },
    );
  } catch (error) {
    console.error('Error loading quest categories:', error);
    return NextResponse.json(
      { error: 'Failed to load categories' },
      { status: 500 },
    );
  }
}
