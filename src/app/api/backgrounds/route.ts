import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel from '@/lib/models/Background';
import UserModel, { type UserDoc } from '@/lib/models/User';
import {
  DEFAULT_BACKGROUND_ID,
  ensureDefaultBackground,
} from '@/lib/backgrounds/defaults';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

async function loadCatalog() {
  return BackgroundModel.find({ hidden: { $ne: true } })
    .sort({ createdAt: 1 })
    .lean();
}

async function grantDefaultsIfNeeded(user: LeanUser) {
  const inventory = user.wardrobe?.backgrounds?.inventory ?? {};
  const equipped = user.wardrobe?.backgrounds?.equipped ?? null;
  const ownsDefault = (inventory[DEFAULT_BACKGROUND_ID] ?? 0) > 0;
  const hasEquipped = !!equipped;

  if (ownsDefault && hasEquipped) {
    return { equipped, inventory };
  }

  const set: Record<string, unknown> = {};
  const nextInventory = { ...inventory };
  if (!ownsDefault) {
    set[`wardrobe.backgrounds.inventory.${DEFAULT_BACKGROUND_ID}`] = 1;
    nextInventory[DEFAULT_BACKGROUND_ID] = 1;
  }
  let nextEquipped = equipped;
  if (!hasEquipped) {
    set['wardrobe.backgrounds.equipped'] = DEFAULT_BACKGROUND_ID;
    nextEquipped = DEFAULT_BACKGROUND_ID;
  }

  if (Object.keys(set).length > 0) {
    await UserModel.updateOne({ _id: user._id }, { $set: set });
  }

  return { equipped: nextEquipped, inventory: nextInventory };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    await ensureDefaultBackground();
    const catalog = await loadCatalog();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;

    if (!user) {
      return json({
        catalog,
        equipped: DEFAULT_BACKGROUND_ID,
        inventory: { [DEFAULT_BACKGROUND_ID]: 1 },
        flies: 0,
      });
    }

    const { equipped, inventory } = await grantDefaultsIfNeeded(user);

    return json({
      catalog,
      equipped,
      inventory,
      flies: user.wardrobe?.flies ?? 0,
    });
  } catch {
    let catalog: unknown[] = [];
    try {
      await connectMongo();
      await ensureDefaultBackground();
      catalog = await loadCatalog();
    } catch {
      catalog = [];
    }
    return json({
      catalog,
      equipped: DEFAULT_BACKGROUND_ID,
      inventory: { [DEFAULT_BACKGROUND_ID]: 1 },
      flies: 0,
    });
  }
}
