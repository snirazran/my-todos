import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CatalogItemModel from '@/lib/models/CatalogItem';
import UserModel from '@/lib/models/User';
import { CATALOG } from '@/lib/skins/catalog';
import { invalidateCatalogCache } from '@/lib/skins/getCatalog';
import { COSMETIC_SLOTS, csvToCatalogDocs } from '@/lib/skins/catalogCsv';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

async function ensureDefaultContainers() {
  const containers = CATALOG.filter((item) => item.slot === 'container');
  await Promise.all(
    containers.map((item) =>
      CatalogItemModel.updateOne(
        { id: item.id },
        {
          $setOnInsert: {
            id: item.id,
            name: item.name,
            slot: item.slot,
            rarity: item.rarity,
            riveIndex: item.riveIndex,
            icon: item.icon || '',
            priceFlies: item.priceFlies ?? 0,
            hidden: false,
          },
        },
        { upsert: true },
      ),
    ),
  );
}

async function removeDeletedCosmeticsFromUsers(removedIds: string[]) {
  if (removedIds.length === 0) return;

  const unsetPaths = Object.fromEntries(
    removedIds.flatMap((id) => [
      [`wardrobe.inventory.${id}`, ''],
      [`wardrobe.inventoryHistory.${id}`, ''],
    ]),
  );

  await UserModel.updateMany(
    {},
    {
      $unset: unsetPaths,
      $pull: { 'wardrobe.unseenItems': { $in: removedIds } },
    },
  );

  await Promise.all(
    COSMETIC_SLOTS.map((slot) =>
      UserModel.updateMany(
        { [`wardrobe.equipped.${slot}`]: { $in: removedIds } },
        { $set: { [`wardrobe.equipped.${slot}`]: null } },
      ),
    ),
  );
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return json({ error: 'Missing CSV file' }, 400);
    }

    const docs = csvToCatalogDocs(await file.text());

    await connectMongo();
    const importIds = docs.map((doc) => doc.id);
    const idConflicts = await CatalogItemModel.find({
      id: { $in: importIds },
      slot: { $nin: COSMETIC_SLOTS },
    })
      .select('id')
      .lean();
    if (idConflicts.length > 0) {
      return json(
        {
          error: `CSV id conflicts with non-cosmetic item(s): ${idConflicts.map((item) => item.id).join(', ')}`,
        },
        400,
      );
    }

    const existingCosmetics = await CatalogItemModel.find({
      slot: { $in: COSMETIC_SLOTS },
    })
      .select('id')
      .lean();
    const importIdSet = new Set(importIds);
    const removedIds = existingCosmetics
      .map((item) => item.id)
      .filter((id) => !importIdSet.has(id));

    await CatalogItemModel.deleteMany({ slot: { $in: COSMETIC_SLOTS } });
    await CatalogItemModel.insertMany(docs, { ordered: true });
    await ensureDefaultContainers();
    await removeDeletedCosmeticsFromUsers(removedIds);
    invalidateCatalogCache();

    const now = new Date();
    const scheduled = docs.filter(
      (doc) => doc.availableFrom && doc.availableFrom > now,
    ).length;
    const expired = docs.filter(
      (doc) => doc.availableUntil && doc.availableUntil < now,
    ).length;

    const colorGroups = new Set(
      docs.map((doc) => doc.variantGroup).filter((group): group is string => !!group),
    ).size;

    return json({
      ok: true,
      imported: docs.length,
      removed: removedIds.length,
      scheduled,
      expired,
      colorGroups,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    if (message.includes('Unauthorized') || message.includes('Forbidden')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    return json({ error: message }, 400);
  }
}
