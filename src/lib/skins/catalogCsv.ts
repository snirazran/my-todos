import type { CatalogItemDoc } from '@/lib/models/CatalogItem';
import { parseAvailabilityDate, parseSeasonMonth } from '@/lib/skins/availability';

export const COSMETIC_SLOTS = ['skin', 'body', 'hat', 'hand_item'] as const;
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

function parseWindowDate(
  value: string,
  label: string,
  edge: 'start' | 'end',
  rowNumber: number,
) {
  if (!value.trim()) return null;
  const parsed = parseAvailabilityDate(value, edge);
  if (!parsed) {
    throw new Error(
      `Row ${rowNumber}: ${label} must be a date like 2026-08-01, or blank for always available`,
    );
  }
  return parsed;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseVariantGroup(value: string, rowNumber: number) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error(`Row ${rowNumber}: duplicate can only contain letters, numbers, underscores, and hyphens`);
  }
  return trimmed;
}

function parseSeasonCell(value: string, rowNumber: number) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const month = parseSeasonMonth(trimmed);
  if (!month) {
    throw new Error(`Row ${rowNumber}: season must be a month like 2026-12, or blank`);
  }
  return month;
}

function parseSwatchColor(value: string, rowNumber: number) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/').map((part) => part.trim());
  if (parts.length > 2 || !parts.every((part) => HEX_COLOR.test(part))) {
    throw new Error(`Row ${rowNumber}: color must be a hex like #4f8bff, or two like #ff8fb1/#ffb347`);
  }
  return parts.join('/');
}

export function csvToCatalogDocs(text: string) {
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

    const availableFrom = parseWindowDate(cell('startdate'), 'startDate', 'start', rowNumber);
    const availableUntil = parseWindowDate(cell('enddate'), 'endDate', 'end', rowNumber);
    if (availableFrom && availableUntil && availableUntil <= availableFrom) {
      throw new Error(`Row ${rowNumber}: endDate must be after startDate`);
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
      availableFrom,
      availableUntil,
      hidden: false,
      variantGroup: parseVariantGroup(cell('duplicate'), rowNumber),
      color: parseSwatchColor(cell('color'), rowNumber),
      seasonMonth: parseSeasonCell(cell('season'), rowNumber),
    });
  });

  const groupSlots = new Map<string, string>();
  docs.forEach((doc, index) => {
    if (!doc.variantGroup) return;
    const slot = groupSlots.get(doc.variantGroup);
    if (slot && slot !== doc.slot) {
      throw new Error(
        `Row ${index + 2}: duplicate group "${doc.variantGroup}" mixes ${slot} and ${doc.slot} items; colors of one item must share a slot`,
      );
    }
    groupSlots.set(doc.variantGroup, doc.slot);
  });

  return docs;
}
