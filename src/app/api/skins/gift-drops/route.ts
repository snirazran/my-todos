import { NextRequest, NextResponse } from 'next/server';
import { getGiftConfig, expandGiftDrops, getRewardPool } from '@/lib/skins/gifts';
import { ensureGiftRulesConfig } from '@/lib/models/GiftRulesConfig';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

export async function GET(req: NextRequest) {
  const giftId = new URL(req.url).searchParams.get('giftId');
  if (!giftId) return json({ error: 'Missing giftId' }, 400);

  const config = await getGiftConfig(giftId);
  if (!config) return json({ error: 'Gift not found' }, 404);

  const [prizePool, rules] = await Promise.all([
    getRewardPool(),
    ensureGiftRulesConfig(),
  ]);
  const drops = expandGiftDrops(config, prizePool).map((drop) => ({
    itemId: drop.itemId,
    chance: drop.chance,
    kind: drop.kind,
    item: drop.item,
  }));

  return json({
    gift: config.gift,
    drops,
    dropMode: config.dropMode,
    rarityDrops: config.rarityDrops,
    // Published because randomised rewards have to disclose their mechanics.
    // The player's own counter is deliberately not here — the sheet explains
    // the rules, the pond hints at the state.
    mechanics: {
      luckPerReveal: config.luckPerReveal,
      softPityLuck: rules.softPityLuck,
      softPityBonusPoints: rules.softPityBonusPoints,
      hardPityLuck: rules.hardPityLuck,
      epicPityLuck: rules.epicPityLuck,
      backgroundSharePercent: rules.backgroundSharePercent,
      newFirstWeight: rules.newFirstWeight,
      wishlistRedirectPercent: rules.wishlistRedirectPercent,
      tierBumpEnabled: rules.tierBumpEnabled,
    },
  });
}
