import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CatalogItemModel from '@/lib/models/CatalogItem';
import { CATALOG } from '@/lib/skins/catalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

/** Seed DB from static catalog if empty */
async function seedIfEmpty() {
  const count = await CatalogItemModel.countDocuments();
  if (count > 0) return;
  const docs = CATALOG.map((item) => ({
    id: item.id,
    name: item.name,
    slot: item.slot,
    rarity: item.rarity,
    riveIndex: item.riveIndex,
    icon: item.icon || '',
    priceFlies: item.priceFlies ?? 0,
    hidden: false,
  }));
  await CatalogItemModel.insertMany(docs, { ordered: false }).catch(() => {});
}

/** GET – return ALL DB catalog items (including hidden, so admin can restore) */
export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    await seedIfEmpty();
    const items = await CatalogItemModel.find({}).lean();
    return json({ items });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

/** POST – add a new catalog item */
export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    let body: { name?: string; slot?: string; riveIndex?: number; rarity?: string; priceFlies?: number };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const { name, slot, riveIndex, rarity, priceFlies } = body;
    if (!name || !slot || typeof riveIndex !== 'number') {
      return json({ error: 'Missing required fields: name, slot, riveIndex' }, 400);
    }

    const allowed = ['skin', 'hat', 'body', 'hand_item', 'container'];
    if (!allowed.includes(slot)) {
      return json({ error: 'Invalid slot' }, 400);
    }

    const id = `${slot}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

    await connectMongo();

    const existing = await CatalogItemModel.findOne({ id });
    if (existing) {
      return json({ error: 'Item with this name already exists in this slot' }, 400);
    }

    const item = await CatalogItemModel.create({
      id,
      name,
      slot,
      riveIndex,
      rarity: rarity || 'common',
      icon: '',
      priceFlies: priceFlies ?? 100,
      hidden: false,
    });

    return json({ ok: true, item });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

/** PUT – edit an existing catalog item */
export async function PUT(req: NextRequest) {
  try {
    await requireUserId();

    let body: { id?: string; name?: string; riveIndex?: number; rarity?: string; priceFlies?: number; hidden?: boolean };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    if (!body.id) return json({ error: 'Missing id' }, 400);

    await connectMongo();

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (typeof body.riveIndex === 'number') update.riveIndex = body.riveIndex;
    if (body.rarity) update.rarity = body.rarity;
    if (typeof body.priceFlies === 'number') update.priceFlies = body.priceFlies;
    if (typeof body.hidden === 'boolean') update.hidden = body.hidden;

    const result = await CatalogItemModel.findOneAndUpdate(
      { id: body.id },
      { $set: update },
      { new: true },
    );

    if (!result) return json({ error: 'Item not found' }, 404);

    return json({ ok: true, item: result });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

/** DELETE – permanently remove a catalog item */
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
    await CatalogItemModel.deleteOne({ id: body.id });

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
