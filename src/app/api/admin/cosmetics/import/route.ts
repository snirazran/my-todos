import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CatalogItemModel, { type CatalogItemDoc } from '@/lib/models/CatalogItem';
import UserModel from '@/lib/models/User';
import { CATALOG } from '@/lib/skins/catalog';
import { invalidateCatalogCache } from '@/lib/skins/getCatalog';

const COSMETIC_SLOTS = ['skin', 'body', 'hat', 'hand_item'] as const;
type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];
type Rarity = CatalogItemDoc['rarity'];

const SLOT_COLUMNS: Array<{ key: string; slot: CosmeticSlot }> = [
  { key: 'skin', slot: 'skin' },
  { key: 'body', slot: 'body' },
  { key: 'hat', slot: 'hat' },
  { key: 'handitem', slot: 'hand_item' },
];

const RARITY_ALIASES: Record<string, Rarity> = {
  common: 'common',
  uncommon: 'uncommon',
  uncomon: 'uncommon',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legendary',
};

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  return rows.filter((csvRow) =>
    csvRow.some((cell) => cell.trim().length > 0),
  );
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseInteger(value: string, label: string, rowNumber: number) {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`Row ${rowNumber}: ${label} must be a whole number`);
  }
  return Number(trimmed);
}

function csvToCatalogDocs(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one item row');
  }

  const headers = rows[0].map(normalizeHeader);
  const requiredHeaders = ['id', 'name', 'rarity', 'price', ...SLOT_COLUMNS.map((c) => c.key)];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required column(s): ${missingHeaders.join(', ')}`);
  }

  const docs: Array<Omit<CatalogItemDoc, '_id'>> = [];
  const seenIds = new Set<string>();

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const cell = (header: string) => row[headers.indexOf(header)]?.trim() ?? '';
    const csvId = cell('id');
    const name = cell('name');
    const rarity = RARITY_ALIASES[cell('rarity').toLowerCase()];
    const priceFlies = parseInteger(cell('price'), 'price', rowNumber);

    if (!csvId) throw new Error(`Row ${rowNumber}: id is required`);
    if (!name) throw new Error(`Row ${rowNumber}: name is required`);
    if (!rarity) throw new Error(`Row ${rowNumber}: rarity is invalid`);
    if (priceFlies < 0) throw new Error(`Row ${rowNumber}: price cannot be negative`);
    if (!/^[a-zA-Z0-9_-]+$/.test(csvId)) {
      throw new Error(`Row ${rowNumber}: id can only contain letters, numbers, underscores, and hyphens`);
    }

    const activeInputs = SLOT_COLUMNS.map(({ key, slot }) => ({
      slot,
      riveIndex: parseInteger(cell(key), key, rowNumber),
    })).filter((input) => input.riveIndex !== -1);

    if (activeInputs.length !== 1) {
      throw new Error(
        `Row ${rowNumber}: exactly one of skin, body, hat, or handItem must be set; use -1 for the others`,
      );
    }

    const activeInput = activeInputs[0];
    if (activeInput.riveIndex < 0) {
      throw new Error(`Row ${rowNumber}: rive input must be -1 or zero/positive`);
    }

    if (seenIds.has(csvId)) throw new Error(`Row ${rowNumber}: duplicate id "${csvId}"`);
    seenIds.add(csvId);

    docs.push({
      id: csvId,
      name,
      slot: activeInput.slot,
      rarity,
      riveIndex: activeInput.riveIndex,
      icon: '',
      priceFlies,
      hidden: false,
    });
  });

  return docs;
}

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

    return json({ ok: true, imported: docs.length, removed: removedIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    if (message.includes('Unauthorized') || message.includes('Forbidden')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    return json({ error: message }, 400);
  }
}
