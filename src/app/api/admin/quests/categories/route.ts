import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import QuestCategoryModel from '@/lib/models/QuestCategory';

function sanitizeCoverImageUrl(value: unknown) {
  return typeof value === 'string' && value.startsWith('data:image/')
    ? value
    : undefined;
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
      categories: categories.map((c) => ({
        id: c.categoryId,
        name: c.name,
        shortLabel: c.shortLabel,
        description: c.description,
        coverImageUrl: c.coverImageUrl,
        accent: c.accent,
        backgroundFrom: c.backgroundFrom,
        backgroundTo: c.backgroundTo,
        isBuiltIn: false,
      })),
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
    const { name, shortLabel, description, accent, backgroundFrom, backgroundTo } = body;
    const coverImageUrl = sanitizeCoverImageUrl(body.coverImageUrl);

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const categoryId = crypto.randomUUID();
    const category = await QuestCategoryModel.create({
      categoryId,
      name: name.trim(),
      shortLabel: shortLabel?.trim() ?? '',
      description: description?.trim() ?? '',
      ...(coverImageUrl ? { coverImageUrl } : {}),
      accent: accent ?? '#6366f1',
      backgroundFrom: backgroundFrom ?? '#1e1b4b',
      backgroundTo: backgroundTo ?? '#312e81',
      isBuiltIn: false,
    });

    return NextResponse.json({
      ok: true,
      category: {
        id: category.categoryId,
        name: category.name,
        shortLabel: category.shortLabel,
        description: category.description,
        coverImageUrl: category.coverImageUrl,
        accent: category.accent,
        backgroundFrom: category.backgroundFrom,
        backgroundTo: category.backgroundTo,
        isBuiltIn: category.isBuiltIn,
      },
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
    const { id, name, shortLabel, description, accent, backgroundFrom, backgroundTo } = body;
    const coverImageUrl = sanitizeCoverImageUrl(body.coverImageUrl);

    if (!id) return NextResponse.json({ error: 'Category id required' }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const updateSet = {
      name: name.trim(),
      shortLabel: shortLabel?.trim() ?? '',
      description: description?.trim() ?? '',
      accent: accent ?? '#6366f1',
      backgroundFrom: backgroundFrom ?? '#1e1b4b',
      backgroundTo: backgroundTo ?? '#312e81',
      isBuiltIn: false,
      ...(coverImageUrl ? { coverImageUrl } : {}),
    };

    const category = await QuestCategoryModel.findOneAndUpdate(
      { categoryId: id },
      {
        $set: updateSet,
        ...(!coverImageUrl ? { $unset: { coverImageUrl: 1 } } : {}),
      },
      { new: true },
    );

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    return NextResponse.json({
      ok: true,
      category: {
        id: category.categoryId,
        name: category.name,
        shortLabel: category.shortLabel,
        description: category.description,
        coverImageUrl: category.coverImageUrl,
        accent: category.accent,
        backgroundFrom: category.backgroundFrom,
        backgroundTo: category.backgroundTo,
        isBuiltIn: category.isBuiltIn,
      },
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
