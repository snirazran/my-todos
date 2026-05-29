import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestCategoryModel, {
  type QuickAddSuggestionEntry,
} from '@/lib/models/QuestCategory';
import {
  isCoverDataUrl,
  isCoverProxyUrl,
  uploadCoverFromDataUrl,
} from '@/lib/quests/coverStorage';

function sanitizeCoverImageUrl(value: unknown) {
  // A new data URL, or our existing proxy URL (unchanged edit). Else cleared.
  return typeof value === 'string' &&
    (value.startsWith('data:image/') || value.startsWith('/api/quests/cover'))
    ? value
    : undefined;
}

function sanitizeQuickAddSuggestions(value: unknown): QuickAddSuggestionEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: QuickAddSuggestionEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const text =
      typeof (raw as { text?: unknown }).text === 'string'
        ? (raw as { text: string }).text.trim().slice(0, 80)
        : '';
    if (!text) continue;
    const emojiRaw =
      typeof (raw as { emoji?: unknown }).emoji === 'string'
        ? (raw as { emoji: string }).emoji.trim().slice(0, 8)
        : '';
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, emoji: emojiRaw });
    if (out.length >= 50) break;
  }
  return out;
}

function categoryToJSON(c: {
  categoryId: string;
  name: string;
  shortLabel: string;
  description: string;
  onboardingSentence?: string;
  coverImageUrl?: string;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
  isBuiltIn: boolean;
  quickAddSuggestions?: QuickAddSuggestionEntry[];
}) {
  return {
    id: c.categoryId,
    name: c.name,
    shortLabel: c.shortLabel,
    description: c.description,
    onboardingSentence: c.onboardingSentence ?? '',
    coverImageUrl: c.coverImageUrl,
    accent: c.accent,
    backgroundFrom: c.backgroundFrom,
    backgroundTo: c.backgroundTo,
    isBuiltIn: c.isBuiltIn,
    quickAddSuggestions: c.quickAddSuggestions ?? [],
  };
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    await QuestCategoryModel.updateMany(
      { isBuiltIn: true },
      { $set: { isBuiltIn: false } },
    );
    const categories = await QuestCategoryModel.find().sort({ createdAt: 1 });
    return NextResponse.json({
      categories: categories.map((c) =>
        categoryToJSON({
          categoryId: c.categoryId,
          name: c.name,
          shortLabel: c.shortLabel,
          description: c.description,
          onboardingSentence: c.onboardingSentence,
          coverImageUrl: c.coverImageUrl,
          accent: c.accent,
          backgroundFrom: c.backgroundFrom,
          backgroundTo: c.backgroundTo,
          isBuiltIn: false,
          quickAddSuggestions: c.quickAddSuggestions,
        }),
      ),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();
    const body = await req.json();
    const { name, shortLabel, description, onboardingSentence, accent, backgroundFrom, backgroundTo } = body;
    const rawCoverImageUrl = sanitizeCoverImageUrl(body.coverImageUrl);
    const quickAddSuggestions = sanitizeQuickAddSuggestions(body.quickAddSuggestions);

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const categoryId = crypto.randomUUID();

    // Upload a new cover to Firebase; store only the proxy URL + metadata.
    let coverImageUrl: string | undefined;
    let coverImageFile;
    if (isCoverDataUrl(rawCoverImageUrl)) {
      const uploaded = await uploadCoverFromDataUrl('category', categoryId, rawCoverImageUrl);
      if (uploaded) {
        coverImageUrl = uploaded.url;
        coverImageFile = uploaded.file;
      }
    }

    const category = await QuestCategoryModel.create({
      categoryId,
      name: name.trim(),
      shortLabel: shortLabel?.trim() ?? '',
      description: description?.trim() ?? '',
      onboardingSentence: onboardingSentence?.trim() ?? '',
      ...(coverImageUrl ? { coverImageUrl } : {}),
      ...(coverImageFile ? { coverImageFile } : {}),
      accent: accent ?? '#6366f1',
      backgroundFrom: backgroundFrom ?? '#1e1b4b',
      backgroundTo: backgroundTo ?? '#312e81',
      isBuiltIn: false,
      quickAddSuggestions,
    });

    return NextResponse.json({
      ok: true,
      category: categoryToJSON({
        categoryId: category.categoryId,
        name: category.name,
        shortLabel: category.shortLabel,
        description: category.description,
        onboardingSentence: category.onboardingSentence,
        coverImageUrl: category.coverImageUrl,
        accent: category.accent,
        backgroundFrom: category.backgroundFrom,
        backgroundTo: category.backgroundTo,
        isBuiltIn: category.isBuiltIn,
        quickAddSuggestions: category.quickAddSuggestions,
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();
    const body = await req.json();
    const { id, name, shortLabel, description, onboardingSentence, accent, backgroundFrom, backgroundTo } = body;
    const rawCoverImageUrl = sanitizeCoverImageUrl(body.coverImageUrl);
    const quickAddSuggestions = sanitizeQuickAddSuggestions(body.quickAddSuggestions);

    if (!id) return NextResponse.json({ error: 'Category id required' }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const updateSet: Record<string, unknown> = {
      name: name.trim(),
      shortLabel: shortLabel?.trim() ?? '',
      description: description?.trim() ?? '',
      onboardingSentence: onboardingSentence?.trim() ?? '',
      accent: accent ?? '#6366f1',
      backgroundFrom: backgroundFrom ?? '#1e1b4b',
      backgroundTo: backgroundTo ?? '#312e81',
      isBuiltIn: false,
      quickAddSuggestions,
    };
    const unsetFields: Record<string, 1> = {};

    if (isCoverDataUrl(rawCoverImageUrl)) {
      // New image — upload to Firebase, store proxy URL + metadata.
      const uploaded = await uploadCoverFromDataUrl('category', id, rawCoverImageUrl);
      if (uploaded) {
        updateSet.coverImageUrl = uploaded.url;
        updateSet.coverImageFile = uploaded.file;
      }
    } else if (!isCoverProxyUrl(rawCoverImageUrl)) {
      // Cleared (proxy URL means unchanged — leave the stored cover alone).
      unsetFields.coverImageUrl = 1;
      unsetFields.coverImageFile = 1;
    }

    const category = await QuestCategoryModel.findOneAndUpdate(
      { categoryId: id },
      {
        $set: updateSet,
        ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
      },
      { new: true },
    );

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    return NextResponse.json({
      ok: true,
      category: categoryToJSON({
        categoryId: category.categoryId,
        name: category.name,
        shortLabel: category.shortLabel,
        description: category.description,
        onboardingSentence: category.onboardingSentence,
        coverImageUrl: category.coverImageUrl,
        accent: category.accent,
        backgroundFrom: category.backgroundFrom,
        backgroundTo: category.backgroundTo,
        isBuiltIn: category.isBuiltIn,
        quickAddSuggestions: category.quickAddSuggestions,
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();
    const body = await req.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: 'Category id required' }, { status: 400 });

    const category = await QuestCategoryModel.findOne({ categoryId: id });
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    await QuestCategoryModel.deleteOne({ categoryId: id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
