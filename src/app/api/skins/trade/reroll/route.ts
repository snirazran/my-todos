import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import User from '@/lib/models/User';
import { getPrizePool } from '@/lib/skins/gifts';
import { DOUBLE_CLAIM_WINDOW_MS } from '@/lib/rewards/adDouble';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { claimId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const claimId = String(body.claimId ?? '');
  if (!claimId) {
    return NextResponse.json({ error: 'Missing claimId' }, { status: 400 });
  }

  try {
    await dbConnect();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const claim = (user as any).tradeRerollClaim as
      | {
          id: string;
          rewardId: string;
          rewardKind: 'item' | 'background';
          rarity: string;
          used: boolean;
          createdAt: Date | string;
        }
      | undefined;
    if (!claim || claim.id !== claimId || claim.used) {
      return NextResponse.json({ granted: false });
    }
    const age = Date.now() - new Date(claim.createdAt).getTime();
    if (age > DOUBLE_CLAIM_WINDOW_MS) {
      return NextResponse.json({ granted: false });
    }

    const itemInv = user.wardrobe?.inventory ?? {};
    const bgInv = user.wardrobe?.backgrounds?.inventory ?? {};
    const ownedCount =
      claim.rewardKind === 'background'
        ? bgInv[claim.rewardId] || 0
        : itemInv[claim.rewardId] || 0;
    if (ownedCount < 1) {
      return NextResponse.json({ granted: false });
    }

    const pool = await getPrizePool();
    let candidates = pool.filter(
      (p) =>
        p.rarity === claim.rarity &&
        p.slot !== 'container' &&
        !(p.kind === claim.rewardKind && p.id === claim.rewardId),
    );
    if (candidates.length === 0) {
      candidates = pool.filter(
        (p) => p.rarity === claim.rarity && p.slot !== 'container',
      );
    }
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: `No prizes for rarity ${claim.rarity}` },
        { status: 500 },
      );
    }
    const reward = candidates[Math.floor(Math.random() * candidates.length)];

    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.inventory = user.wardrobe.inventory ?? {};
    if (!user.wardrobe.backgrounds) {
      user.wardrobe.backgrounds = { equipped: null, inventory: {} };
    }
    user.wardrobe.backgrounds.inventory =
      user.wardrobe.backgrounds.inventory ?? {};
    user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];

    if (claim.rewardKind === 'background') {
      const next = (user.wardrobe.backgrounds.inventory[claim.rewardId] || 0) - 1;
      if (next <= 0) delete user.wardrobe.backgrounds.inventory[claim.rewardId];
      else user.wardrobe.backgrounds.inventory[claim.rewardId] = next;
    } else {
      const next = (user.wardrobe.inventory[claim.rewardId] || 0) - 1;
      if (next <= 0) {
        delete user.wardrobe.inventory[claim.rewardId];
        user.wardrobe.unseenItems = user.wardrobe.unseenItems.filter(
          (id: string) => id !== claim.rewardId,
        );
      } else {
        user.wardrobe.inventory[claim.rewardId] = next;
      }
    }

    if (reward.kind === 'background') {
      user.wardrobe.backgrounds.inventory[reward.id] =
        (user.wardrobe.backgrounds.inventory[reward.id] || 0) + 1;
      user.markModified('wardrobe.backgrounds');
    } else {
      user.wardrobe.inventory[reward.id] =
        (user.wardrobe.inventory[reward.id] || 0) + 1;
      if (!user.wardrobe.inventoryHistory) user.wardrobe.inventoryHistory = {};
      if (!user.wardrobe.inventoryHistory[reward.id]) {
        user.wardrobe.inventoryHistory[reward.id] = new Date().toISOString();
      }
      if (!user.wardrobe.unseenItems.includes(reward.id)) {
        user.wardrobe.unseenItems.push(reward.id);
      }
      user.markModified('wardrobe.inventoryHistory');
    }
    user.markModified('wardrobe.unseenItems');
    user.markModified('wardrobe.inventory');

    (user as any).tradeRerollClaim = { ...claim, used: true };
    user.markModified('tradeRerollClaim');
    await user.save();

    return NextResponse.json({ granted: true, reward });
  } catch (error) {
    console.error('Trade reroll error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
