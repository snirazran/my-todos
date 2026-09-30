import { NextResponse } from 'next/server';
import { getCachedCatalog } from '@/lib/skins/getCatalog';

const WEARABLE_SLOTS = new Set(['skin', 'hat', 'body', 'hand_item']);

export async function GET() {
  try {
    const catalog = await getCachedCatalog();
    const items = catalog
      .filter((item) => WEARABLE_SLOTS.has(item.slot))
      .map(({ id, name, slot, rarity, riveIndex }) => ({ id, name, slot, rarity, riveIndex }));
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } },
    );
  } catch {
    return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
