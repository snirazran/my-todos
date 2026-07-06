import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import User from '@/lib/models/User';
import { RARITY_ORDER, TRADE_ITEM_COUNT } from '@/lib/skins/catalog';
import { getPrizePool, type GiftPrize } from '@/lib/skins/gifts';
import { bumpQuestMetric } from '@/lib/quests/metrics';

type Pick = { id: string; kind: 'item' | 'background' };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const body = await req.json();
    // Back-compat: legacy clients send `itemIds: string[]` (all items).
    const picks: Pick[] = Array.isArray(body?.picks)
      ? body.picks.map((p: any) => ({
          id: String(p?.id ?? ''),
          kind: p?.kind === 'background' ? 'background' : 'item',
        }))
      : Array.isArray(body?.itemIds)
        ? body.itemIds.map((id: any) => ({ id: String(id), kind: 'item' as const }))
        : [];

    if (picks.length !== TRADE_ITEM_COUNT || picks.some((p) => !p.id)) {
      return NextResponse.json(
        { error: `Must provide exactly ${TRADE_ITEM_COUNT} items to trade.` },
        { status: 400 },
      );
    }

    await dbConnect();
    const pool = await getPrizePool();
    const byKey = new Map<string, GiftPrize>(
      pool.map((p) => [`${p.kind}:${p.id}`, p]),
    );

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const itemInv = user.wardrobe?.inventory || {};
    const bgInv = user.wardrobe?.backgrounds?.inventory || {};

    // 1. Validate ownership and resolve definitions
    const inputs: GiftPrize[] = [];
    const deduct: Record<string, number> = {};
    for (const pick of picks) {
      const key = `${pick.kind}:${pick.id}`;
      const def = byKey.get(key);
      if (!def) {
        return NextResponse.json({ error: `Invalid item: ${pick.id}` }, { status: 400 });
      }
      inputs.push(def);
      deduct[key] = (deduct[key] || 0) + 1;
    }

    for (const [key, count] of Object.entries(deduct)) {
      const [kind, ...rest] = key.split(':');
      const id = rest.join(':');
      const owned = (kind === 'background' ? bgInv[id] : itemInv[id]) || 0;
      if (owned < count) {
        return NextResponse.json({ error: `Not enough of ${id}` }, { status: 400 });
      }
    }

    // 2. Same rarity, not legendary
    const firstRarity = inputs[0].rarity;
    if (!inputs.every((i) => i.rarity === firstRarity)) {
      return NextResponse.json(
        { error: 'All items must be of the same rarity.' },
        { status: 400 },
      );
    }
    if (firstRarity === 'legendary') {
      return NextResponse.json({ error: 'Cannot trade up from Legendary.' }, { status: 400 });
    }

    // 3. Next tier
    const currentRankIndex = RARITY_ORDER.indexOf(firstRarity);
    if (currentRankIndex === -1 || currentRankIndex >= RARITY_ORDER.length - 1) {
      return NextResponse.json({ error: 'Invalid rarity tier for trade up.' }, { status: 400 });
    }
    const nextRarity = RARITY_ORDER[currentRankIndex + 1];

    // 4. Reward — any prize (item or background) of the next rarity
    const possibleRewards = pool.filter(
      (i) => i.rarity === nextRarity && i.slot !== 'container',
    );
    if (possibleRewards.length === 0) {
      return NextResponse.json({ error: `No prizes for rarity ${nextRarity}` }, { status: 500 });
    }
    const reward = possibleRewards[Math.floor(Math.random() * possibleRewards.length)];

    // 5. Execute
    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.inventory = user.wardrobe.inventory ?? {};
    if (!user.wardrobe.backgrounds) {
      user.wardrobe.backgrounds = { equipped: null, inventory: {} };
    }
    user.wardrobe.backgrounds.inventory = user.wardrobe.backgrounds.inventory ?? {};

    for (const [key, count] of Object.entries(deduct)) {
      const [kind, ...rest] = key.split(':');
      const id = rest.join(':');
      if (kind === 'background') {
        user.wardrobe.backgrounds.inventory[id] =
          (user.wardrobe.backgrounds.inventory[id] || 0) - count;
        if (user.wardrobe.backgrounds.inventory[id] <= 0) {
          delete user.wardrobe.backgrounds.inventory[id];
        }
      } else {
        user.wardrobe.inventory[id] = (user.wardrobe.inventory[id] || 0) - count;
        if (user.wardrobe.inventory[id] <= 0) {
          delete user.wardrobe.inventory[id];
        }
      }
    }

    if (reward.kind === 'background') {
      user.wardrobe.backgrounds.inventory[reward.id] =
        (user.wardrobe.backgrounds.inventory[reward.id] || 0) + 1;
      user.markModified('wardrobe.backgrounds');
    } else {
      user.wardrobe.inventory[reward.id] = (user.wardrobe.inventory[reward.id] || 0) + 1;
      if (!user.wardrobe.inventoryHistory) user.wardrobe.inventoryHistory = {};
      if (!user.wardrobe.inventoryHistory[reward.id]) {
        user.wardrobe.inventoryHistory[reward.id] = new Date().toISOString();
      }
      if (!user.wardrobe.unseenItems) user.wardrobe.unseenItems = [];
      if (!user.wardrobe.unseenItems.includes(reward.id)) {
        user.wardrobe.unseenItems.push(reward.id);
      }
      user.markModified('wardrobe.inventoryHistory');
      user.markModified('wardrobe.unseenItems');
    }

    const rerollClaimId = randomUUID();
    (user as any).tradeRerollClaim = {
      id: rerollClaimId,
      rewardId: reward.id,
      rewardKind: reward.kind,
      rarity: nextRarity,
      used: false,
      createdAt: new Date(),
    };
    user.markModified('tradeRerollClaim');

    user.markModified('wardrobe.inventory');
    await user.save();

    const timezone = typeof body?.timezone === 'string' ? body.timezone : undefined;
    await bumpQuestMetric({ userId, metric: 'trade_completed', timezone });
    await bumpQuestMetric({ userId, metric: 'skin_acquired', timezone });

    return NextResponse.json({ success: true, reward, rerollClaimId });
  } catch (error) {
    console.error('Trade error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
