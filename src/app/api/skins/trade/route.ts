import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import User from '@/lib/models/User';
import { CATALOG, RARITY_ORDER, ItemDef } from '@/lib/skins/catalog';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const { itemIds } = await req.json(); // Expecting string[] of length 10

    if (!Array.isArray(itemIds) || itemIds.length !== 10) {
      return NextResponse.json(
        { error: 'Must provide exactly 10 items to trade.' },
        { status: 400 },
      );
    }

    await dbConnect();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // FIX 1: Use optional chaining (?.) here
    // If wardrobe is undefined, inventory becomes {}
    const inventory = user.wardrobe?.inventory || {};

    // 1. Validate ownership and get definitions
    const inputItems: ItemDef[] = [];
    const countsToDeduct: Record<string, number> = {};

    for (const id of itemIds) {
      const def = CATALOG.find((i) => i.id === id);
      if (!def) {
        return NextResponse.json(
          { error: `Invalid item ID: ${id}` },
          { status: 400 },
        );
      }
      inputItems.push(def);
      countsToDeduct[id] = (countsToDeduct[id] || 0) + 1;
    }

    // Check ownership
    // If user.wardrobe was undefined above, inventory is empty,
    // so this check will fail correctly (0 < count)
    for (const [id, count] of Object.entries(countsToDeduct)) {
      if ((inventory[id] || 0) < count) {
        return NextResponse.json(
          { error: `Not enough items of type ${id}` },
          { status: 400 },
        );
      }
    }

    // 2. Validate Rarity Consistency
    const firstRarity = inputItems[0].rarity;
    const allSameRarity = inputItems.every((i) => i.rarity === firstRarity);

    if (!allSameRarity) {
      return NextResponse.json(
        { error: 'All items must be of the same rarity.' },
        { status: 400 },
      );
    }

    if (firstRarity === 'legendary') {
      return NextResponse.json(
        { error: 'Cannot trade up from Legendary.' },
        { status: 400 },
      );
    }

    // 3. Determine Next Tier
    const currentRankIndex = RARITY_ORDER.indexOf(firstRarity);
    if (
      currentRankIndex === -1 ||
      currentRankIndex >= RARITY_ORDER.length - 1
    ) {
      return NextResponse.json(
        { error: 'Invalid rarity tier for trade up.' },
        { status: 400 },
      );
    }
    const nextRarity = RARITY_ORDER[currentRankIndex + 1];

    // 4. Select Reward
    const possibleRewards = CATALOG.filter((i) => i.rarity === nextRarity);

    if (possibleRewards.length === 0) {
      return NextResponse.json(
        { error: `No items found for rarity ${nextRarity}` },
        { status: 500 },
      );
    }

    const reward =
      possibleRewards[Math.floor(Math.random() * possibleRewards.length)];

    // 5. Execute Trade (Atomic-ish via Document save)
    // Deduct items
    for (const [id, count] of Object.entries(countsToDeduct)) {
      // FIX 2: Use non-null assertion (!)
      // We know wardrobe exists because the ownership check passed
      user.wardrobe!.inventory[id] -= count;

      if (user.wardrobe!.inventory[id] <= 0) {
        delete user.wardrobe!.inventory[id];
      }
    }

    // Add reward
    // FIX 3: Use non-null assertion (!) here as well
    user.wardrobe!.inventory[reward.id] =
      (user.wardrobe!.inventory[reward.id] || 0) + 1;

    // Add to unseen items
    if (!user.wardrobe!.unseenItems) {
      user.wardrobe!.unseenItems = [];
    }
    if (!user.wardrobe!.unseenItems.includes(reward.id)) {
      user.wardrobe!.unseenItems.push(reward.id);
    }

    // Mark modified because we are mutating the mixed type map directly
    user.markModified('wardrobe.inventory');
    user.markModified('wardrobe.unseenItems'); // Make sure Mongoose knows unseenItems changed
    await user.save();

    return NextResponse.json({
      success: true,
      reward,
      consumed: itemIds,
    });
  } catch (error) {
    console.error('Trade error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
