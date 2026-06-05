import { NextRequest, NextResponse } from 'next/server';
import { getGiftConfig, expandGiftDrops } from '@/lib/skins/gifts';
import { getFullCatalog } from '@/lib/skins/getCatalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

export async function GET(req: NextRequest) {
  const giftId = new URL(req.url).searchParams.get('giftId');
  if (!giftId) return json({ error: 'Missing giftId' }, 400);

  const config = await getGiftConfig(giftId);
  if (!config) return json({ error: 'Gift not found' }, 404);

  const catalog = await getFullCatalog();
  const drops = expandGiftDrops(config, catalog).map((drop) => ({
    itemId: drop.itemId,
    chance: drop.chance,
    item: drop.item,
  }));

  return json({
    gift: config.gift,
    drops,
    dropMode: config.dropMode,
    rarityDrops: config.rarityDrops,
  });
}
