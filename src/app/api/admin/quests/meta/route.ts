import { NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { loadBackgroundPrizes } from '@/lib/skins/gifts';

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();

    const [categories, catalog, backgrounds] = await Promise.all([
      QuestCategoryModel.find().sort({ createdAt: 1 }),
      getFullCatalog(),
      loadBackgroundPrizes(),
    ]);

    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.categoryId,
        name: c.name,
      })),
      rewardsCatalog: [
        ...catalog.map((item) => ({
          id: item.id,
          name: item.name,
          slot: item.slot,
          rarity: item.rarity,
          riveIndex: item.riveIndex,
        })),
        ...backgrounds.map((bg) => ({
          id: bg.id,
          name: bg.name,
          slot: 'background' as const,
          rarity: bg.rarity,
          riveIndex: 0,
          imageUrl: bg.imageUrl,
        })),
      ],
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
