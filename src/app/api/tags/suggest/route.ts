import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import QuestCategoryModel from '@/lib/models/QuestCategory';

export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 200;

function normalizeTag(tag: any): { id: string; name: string } | null {
  if (typeof tag === 'string') {
    const name = tag.trim();
    return name ? { id: name, name } : null;
  }
  if (tag && typeof tag.id === 'string' && typeof tag.name === 'string') {
    return { id: tag.id, name: tag.name };
  }
  return null;
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ tagIds: [] });
  }

  let text = '';
  try {
    const body = await req.json();
    text = typeof body?.text === 'string' ? body.text.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (text.length < 3) {
    return NextResponse.json({ tagIds: [] });
  }
  text = text.slice(0, MAX_TEXT_LENGTH);

  try {
    await connectMongo();
    const user = await UserModel.findById(userId)
      .select('tags focusProfile')
      .lean();
    if (!user) {
      return NextResponse.json({ tagIds: [] });
    }

    const profile: any = (user as any).focusProfile ?? {};
    const selectedIds: string[] = Array.isArray(profile.selectedCategoryIds)
      ? profile.selectedCategoryIds
      : [];
    const tagMap: { categoryId: string; tagIds: string[] }[] = Array.isArray(
      profile.categoryTagMap,
    )
      ? profile.categoryTagMap
      : [];
    if (selectedIds.length === 0 || tagMap.length === 0) {
      return NextResponse.json({ tagIds: [] });
    }

    const tagsById = new Map<string, { id: string; name: string }>();
    for (const raw of (user as any).tags ?? []) {
      const tag = normalizeTag(raw);
      if (tag) tagsById.set(tag.id, tag);
    }

    const categories = await QuestCategoryModel.find({
      categoryId: { $in: selectedIds },
    })
      .select('categoryId name')
      .lean();
    const areaNames = new Map(categories.map((c) => [c.categoryId, c.name]));

    const areas: { categoryId: string; name: string; tagIds: string[] }[] = [];
    for (const entry of tagMap) {
      if (!selectedIds.includes(entry.categoryId)) continue;
      const tagIds = (entry.tagIds ?? []).filter((id) => tagsById.has(id));
      if (tagIds.length === 0) continue;
      areas.push({
        categoryId: entry.categoryId,
        name: areaNames.get(entry.categoryId) ?? entry.categoryId,
        tagIds,
      });
    }
    if (areas.length === 0) {
      return NextResponse.json({ tagIds: [] });
    }

    const list = areas.map((a, i) => `${i + 1}. ${a.name}`).join('\n');

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8,
      system:
        'You classify a to-do task into a life focus area. Reply with only the number of the single best matching focus area, or 0 if the task does not clearly belong to any of them. The task must genuinely be an activity of that area — when unsure, reply 0. Never explain.',
      messages: [
        {
          role: 'user',
          content: `Task: "${text}"\n\nFocus areas:\n${list}`,
        },
      ],
    });

    const block = response.content[0];
    const raw = block?.type === 'text' ? block.text : '';
    const index = parseInt(raw.match(/\d+/)?.[0] ?? '0', 10);
    const area = index >= 1 && index <= areas.length ? areas[index - 1] : null;
    const tagIds = (area?.tagIds ?? []).slice(0, 6);

    return NextResponse.json(
      { tagIds },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Tag suggest failed:', error);
    return NextResponse.json({ tagIds: [] });
  }
}
