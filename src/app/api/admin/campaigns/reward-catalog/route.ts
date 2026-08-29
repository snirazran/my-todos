import { NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel from '@/lib/models/Background';
import { getFullCatalog } from '@/lib/skins/getCatalog';

export const dynamic = 'force-dynamic';

export type RewardCatalogEntry = {
  id: string;
  name: string;
  kind: 'item' | 'background';
  rarity: string;
  slot?: string;
  priceFlies?: number;
};

/** Everything a reward button is allowed to hand out, so the picker is a real
 *  list rather than a text box an id gets mistyped into. */
export async function GET() {
  try {
    await requireAdminUserId();
    await connectMongo();

    const [items, backgrounds] = await Promise.all([
      getFullCatalog(),
      BackgroundModel.find({}).select('id name rarity priceFlies').lean(),
    ]);

    const entries: RewardCatalogEntry[] = [
      ...items.map((item) => ({
        id: item.id,
        name: item.name,
        kind: 'item' as const,
        rarity: item.rarity,
        slot: item.slot,
        priceFlies: item.priceFlies,
      })),
      ...backgrounds.map((background) => ({
        id: background.id,
        name: background.name,
        kind: 'background' as const,
        rarity: background.rarity,
        priceFlies: background.priceFlies,
      })),
    ];

    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] }, { status: 200 });
  }
}
