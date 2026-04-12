import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';

async function seedBuiltIns() {
  for (const cat of QUEST_MACRO_CATEGORIES) {
    await QuestCategoryModel.updateOne(
      { categoryId: cat.id },
      {
        $setOnInsert: {
          categoryId: cat.id,
          name: cat.name,
          shortLabel: cat.shortLabel,
          description: cat.description,
          accent: cat.accent,
          backgroundFrom: cat.backgroundFrom,
          backgroundTo: cat.backgroundTo,
          isBuiltIn: true,
        },
      },
      { upsert: true },
    );
  }
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    await seedBuiltIns();
    const categories = await QuestCategoryModel.find().sort({ isBuiltIn: -1, createdAt: 1 });
    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.categoryId,
        name: c.name,
        shortLabel: c.shortLabel,
        description: c.description,
        accent: c.accent,
        backgroundFrom: c.backgroundFrom,
        backgroundTo: c.backgroundTo,
        isBuiltIn: c.isBuiltIn,
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

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const categoryId = crypto.randomUUID();
    const category = await QuestCategoryModel.create({
      categoryId,
      name: name.trim(),
      shortLabel: shortLabel?.trim() ?? '',
      description: description?.trim() ?? '',
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

    if (!id) return NextResponse.json({ error: 'Category id required' }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const category = await QuestCategoryModel.findOneAndUpdate(
      { categoryId: id },
      {
        $set: {
          name: name.trim(),
          shortLabel: shortLabel?.trim() ?? '',
          description: description?.trim() ?? '',
          accent: accent ?? '#6366f1',
          backgroundFrom: backgroundFrom ?? '#1e1b4b',
          backgroundTo: backgroundTo ?? '#312e81',
        },
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
    if (category.isBuiltIn) {
      return NextResponse.json({ error: 'Built-in categories cannot be deleted' }, { status: 400 });
    }

    await QuestCategoryModel.deleteOne({ categoryId: id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
