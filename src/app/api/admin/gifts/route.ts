import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CatalogItemModel from '@/lib/models/CatalogItem';
import GiftDropConfigModel from '@/lib/models/GiftDropConfig';
import { getGiftConfigs, ensureGiftDropConfigs } from '@/lib/skins/gifts';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type DropInput = {
  itemId?: string;
  chance?: number;
};

type RarityDropInput = {
  rarity?: string;
  chance?: number;
};

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function sanitizeDrops(drops: DropInput[] | undefined) {
  if (!Array.isArray(drops)) return [];
  const merged = new Map<string, number>();
  drops.forEach((drop) => {
    if (!drop.itemId || typeof drop.chance !== 'number' || drop.chance <= 0) return;
    merged.set(drop.itemId, (merged.get(drop.itemId) ?? 0) + drop.chance);
  });
  return Array.from(merged.entries()).map(([itemId, chance]) => ({ itemId, chance }));
}

function sanitizeRarityDrops(drops: RarityDropInput[] | undefined) {
  if (!Array.isArray(drops)) return [];
  const merged = new Map<string, number>();
  drops.forEach((drop) => {
    if (!drop.rarity || !RARITIES.includes(drop.rarity)) return;
    if (typeof drop.chance !== 'number' || drop.chance <= 0) return;
    merged.set(drop.rarity, (merged.get(drop.rarity) ?? 0) + drop.chance);
  });
  return Array.from(merged.entries()).map(([rarity, chance]) => ({ rarity, chance }));
}

function normalizeDropMode(mode: unknown): 'item' | 'rarity' {
  return mode === 'rarity' ? 'rarity' : 'item';
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    await ensureGiftDropConfigs();

    const [gifts, catalog] = await Promise.all([
      getGiftConfigs(true),
      CatalogItemModel.find({ slot: { $ne: 'container' }, hidden: { $ne: true } })
        .sort({ slot: 1, rarity: 1, riveIndex: 1 })
        .lean(),
    ]);

    return json({ gifts, catalog });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    let body: {
      name?: string;
      riveIndex?: number;
      rarity?: string;
      priceFlies?: number;
      dropMode?: string;
      drops?: DropInput[];
      rarityDrops?: RarityDropInput[];
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    if (!body.name?.trim() || typeof body.riveIndex !== 'number') {
      return json({ error: 'Missing required fields: name, riveIndex' }, 400);
    }

    const rarity = body.rarity || 'common';
    if (!['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(rarity)) {
      return json({ error: 'Invalid rarity' }, 400);
    }

    await connectMongo();
    const id = `gift_${slugify(body.name)}`;
    const existing = await CatalogItemModel.findOne({ id });
    if (existing) return json({ error: 'Gift with this name already exists' }, 400);

    const gift = await CatalogItemModel.create({
      id,
      name: body.name.trim(),
      slot: 'container',
      rarity,
      riveIndex: body.riveIndex,
      icon: '/skins/container/gift.png',
      priceFlies: body.priceFlies ?? 100,
      hidden: false,
    });

    await GiftDropConfigModel.create({
      giftId: id,
      dropMode: normalizeDropMode(body.dropMode),
      drops: sanitizeDrops(body.drops),
      rarityDrops: sanitizeRarityDrops(body.rarityDrops),
    });

    return json({ ok: true, gift });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();

    let body: {
      id?: string;
      name?: string;
      riveIndex?: number;
      rarity?: string;
      priceFlies?: number;
      hidden?: boolean;
      dropMode?: string;
      drops?: DropInput[];
      rarityDrops?: RarityDropInput[];
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    if (!body.id) return json({ error: 'Missing id' }, 400);

    await connectMongo();

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (typeof body.riveIndex === 'number') update.riveIndex = body.riveIndex;
    if (body.rarity) update.rarity = body.rarity;
    if (typeof body.priceFlies === 'number') update.priceFlies = body.priceFlies;
    if (typeof body.hidden === 'boolean') update.hidden = body.hidden;

    const gift = await CatalogItemModel.findOneAndUpdate(
      { id: body.id, slot: 'container' },
      { $set: update },
      { new: true },
    );
    if (!gift) return json({ error: 'Gift not found' }, 404);

    const configUpdate: Record<string, unknown> = {};
    if (body.dropMode !== undefined) configUpdate.dropMode = normalizeDropMode(body.dropMode);
    if (Array.isArray(body.drops)) configUpdate.drops = sanitizeDrops(body.drops);
    if (Array.isArray(body.rarityDrops))
      configUpdate.rarityDrops = sanitizeRarityDrops(body.rarityDrops);

    if (Object.keys(configUpdate).length > 0) {
      await GiftDropConfigModel.findOneAndUpdate(
        { giftId: body.id },
        { $set: configUpdate },
        { new: true, upsert: true },
      );
    }

    return json({ ok: true, gift });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUserId();

    let body: { id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    if (!body.id) return json({ error: 'Missing id' }, 400);

    await connectMongo();
    await Promise.all([
      CatalogItemModel.deleteOne({ id: body.id, slot: 'container' }),
      GiftDropConfigModel.deleteOne({ giftId: body.id }),
    ]);

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
