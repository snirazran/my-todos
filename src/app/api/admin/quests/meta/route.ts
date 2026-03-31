import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';
import { getFullCatalog } from '@/lib/skins/getCatalog';

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();

    const catalog = await getFullCatalog();

    return NextResponse.json({
      categories: QUEST_MACRO_CATEGORIES.map((category) => ({
        id: category.id,
        name: category.name,
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
