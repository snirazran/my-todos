import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CatalogItemModel from '@/lib/models/CatalogItem';
import GiftDropConfigModel from '@/lib/models/GiftDropConfig';
import { getGiftConfigs, ensureGiftDropConfigs, loadBackgroundPrizes } from '@/lib/skins/gifts';
import GiftRulesConfigModel, {
  GIFT_RULES_CONFIG_ID,
  ensureGiftRulesConfig,
} from '@/lib/models/GiftRulesConfig';
import {
  DEFAULT_GIFT_RULES,
  clampGiftRules,
  luckPerReveal,
  TIER_BUMP_RARITIES,
} from '@/lib/skins/giftRules';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type DropInput = {
  itemId?: string;
  chance?: number;
  kind?: 'item' | 'background';
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
  const merged = new Map<string, { itemId: string; chance: number; kind: 'item' | 'background' }>();
  drops.forEach((drop) => {
    if (!drop.itemId || typeof drop.chance !== 'number' || drop.chance <= 0) return;
    const kind = drop.kind === 'background' ? 'background' : 'item';
    const key = `${kind}:${drop.itemId}`;
    const existing = merged.get(key);
    merged.set(key, {
      itemId: drop.itemId,
      kind,
      chance: (existing?.chance ?? 0) + drop.chance,
    });
  });
  return Array.from(merged.values());
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

    const [gifts, catalog, backgrounds, rules] = await Promise.all([
      getGiftConfigs(true),
      CatalogItemModel.find({ slot: { $ne: 'container' }, hidden: { $ne: true } })
        .sort({ slot: 1, rarity: 1, riveIndex: 1 })
        .lean(),
      loadBackgroundPrizes(),
      ensureGiftRulesConfig(),
    ]);

    return json({
      gifts,
      catalog,
      backgrounds,
      rules,
      rulesDefaults: DEFAULT_GIFT_RULES,
      tierBumpRarities: TIER_BUMP_RARITIES,
    });
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
      luckPerReveal?: number;
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
      luckPerReveal: luckPerReveal(body.luckPerReveal, rarity as any),
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
      luckPerReveal?: number;
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
    if (body.luckPerReveal !== undefined) {
      configUpdate.luckPerReveal = luckPerReveal(
        body.luckPerReveal,
        gift.rarity as any,
      );
    }

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

/** The shared rule set: pity, background share, and the four duplicate rules. */
export async function PATCH(req: NextRequest) {
  try {
    await requireUserId();

    let body: { rules?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    await connectMongo();
    const current = await ensureGiftRulesConfig();
    const rules = clampGiftRules({ ...current, ...(body.rules ?? {}) as object });

    if (rules.hardPityLuck < rules.softPityLuck) {
      return json(
        { error: 'Hard pity must be at least as high as soft pity.' },
        400,
      );
    }

    await GiftRulesConfigModel.updateOne(
      { configId: GIFT_RULES_CONFIG_ID },
      { $set: { configId: GIFT_RULES_CONFIG_ID, ...rules } },
      { upsert: true },
    );

    return json({ ok: true, rules });
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
