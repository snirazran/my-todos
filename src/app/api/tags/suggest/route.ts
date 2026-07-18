import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import QuestCategoryModel from '@/lib/models/QuestCategory';

export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 200;

type Candidate = { id: string; name: string; areaName: string };

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
    return NextResponse.json({ tagId: null });
  }

  let text = '';
  try {
    const body = await req.json();
    text = typeof body?.text === 'string' ? body.text.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (text.length < 3) {
    return NextResponse.json({ tagId: null });
  }
  text = text.slice(0, MAX_TEXT_LENGTH);

  try {
    await connectMongo();
    const user = await UserModel.findById(userId)
      .select('tags focusProfile')
      .lean();
    if (!user) {
      return NextResponse.json({ tagId: null });
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
      return NextResponse.json({ tagId: null });
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

    const candidates: Candidate[] = [];
    const seen = new Set<string>();
    for (const entry of tagMap) {
      if (!selectedIds.includes(entry.categoryId)) continue;
      const areaName = areaNames.get(entry.categoryId) ?? entry.categoryId;
      for (const tagId of entry.tagIds ?? []) {
        if (seen.has(tagId)) continue;
        const tag = tagsById.get(tagId);
        if (!tag) continue;
        seen.add(tagId);
        candidates.push({ id: tag.id, name: tag.name, areaName });
      }
    }
    if (candidates.length === 0) {
      return NextResponse.json({ tagId: null });
    }

    const list = candidates
      .map((c, i) => `${i + 1}. ${c.name} (focus area: ${c.areaName})`)
      .join('\n');

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8,
      system:
        'You match a to-do task to the single most relevant tag. Reply with only the number of the best matching tag, or 0 if no tag clearly relates to the task. A tag must genuinely fit the activity described — when unsure, reply 0. Never explain.',
      messages: [
        {
          role: 'user',
          content: `Task: "${text}"\n\nTags:\n${list}`,
        },
      ],
    });

    const block = response.content[0];
    const raw = block?.type === 'text' ? block.text : '';
    const index = parseInt(raw.match(/\d+/)?.[0] ?? '0', 10);
    const picked =
      index >= 1 && index <= candidates.length ? candidates[index - 1] : null;

    return NextResponse.json(
      { tagId: picked?.id ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Tag suggest failed:', error);
    return NextResponse.json({ tagId: null });
  }
}
