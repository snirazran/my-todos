import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { CATALOG, byId, ItemDef, Rarity } from '@/lib/skins/catalog';
import type { UserWardrobe } from '@/lib/types/UserDoc';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: Types.ObjectId };

const WIN_WEIGHTS: Record<Rarity, number> = {
  common: 0.6,
  uncommon: 0.25,
  rare: 0.1,
  epic: 0.04,
  legendary: 0.01,
};

const rollRarity = (): Rarity => {
  const rand = Math.random();
  let cumulative = 0;
  for (const [rarity, weight] of Object.entries(WIN_WEIGHTS)) {
    cumulative += weight;
    if (rand < cumulative) return rarity as Rarity;
  }
  return 'common';
};

const getRandomItem = (): ItemDef => {
  const catalogByRarity: Record<Rarity, ItemDef[]> = {
    common: [],
    uncommon: [],
    rare: [],
    epic: [],
    legendary: [],
  };
  
  CATALOG.forEach((item) => {
    // Don't award containers as prizes for now to prevent loops, or do?
    // Let's exclude containers.
    if (item.slot !== 'container') {
        if (catalogByRarity[item.rarity]) catalogByRarity[item.rarity].push(item);
    }
  });

  let rarity = rollRarity();
  while (catalogByRarity[rarity].length === 0) {
    if (rarity === 'legendary') rarity = 'epic';
    else if (rarity === 'epic') rarity = 'rare';
    else if (rarity === 'rare') rarity = 'uncommon';
    else if (rarity === 'uncommon') rarity = 'common';
    else break;
  }
  const pool = catalogByRarity[rarity];
  return pool[Math.floor(Math.random() * pool.length)];
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  let body: { giftBoxId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const giftBoxId = body.giftBoxId;
  if (!giftBoxId || !byId[giftBoxId]) return json({ error: 'Unknown giftBoxId' }, 400);

  // 1. Pick a prize
  const prize = getRandomItem();

  await connectMongo();
  const user = (await UserModel.findOne({
    email: session.user.email,
  }).lean()) as LeanUser | null;
  if (!user) return json({ error: 'User not found' }, 404);

  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const owned = wardrobe.inventory[giftBoxId] || 0;

  if (owned < 1) {
    return json({ error: 'You do not have any gift boxes to open' }, 403);
  }

  // 2. Atomic swap: decrement box, increment prize
  await UserModel.updateOne(
    { _id: user._id },
    { 
        $inc: { 
            [`wardrobe.inventory.${giftBoxId}`]: -1,
            [`wardrobe.inventory.${prize.id}`]: 1
        } 
    }
  );

  return json({ ok: true, prize });
}
