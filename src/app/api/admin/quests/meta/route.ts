import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { getFullCatalog } from '@/lib/skins/getCatalog';

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();

    const [categories, catalog] = await Promise.all([
      QuestCategoryModel.find().sort({ createdAt: 1 }),
      getFullCatalog(),
    ]);

    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.categoryId,
        name: c.name,
      })),
      rewardsCatalog: catalog.map((item) => ({
        id: item.id,
        name: item.name,
        slot: item.slot,
        rarity: item.rarity,
        riveIndex: item.riveIndex,
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
