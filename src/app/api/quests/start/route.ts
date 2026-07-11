import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import QuestCounterModel from '@/lib/models/QuestCounter';
import { saveFocusProfile, normalizeFocusProfile } from '@/lib/quests/engine';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import type { FocusCategoryTagMap, MacroCategoryId } from '@/lib/quests/types';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const FREE_TAG_LIMIT = 6;
const PREMIUM_TAG_LIMIT = 50;
const TAG_NAME_MAX_LENGTH = 20;

type NormalizedTag = { id: string; name: string; color: string };

function normalizeUserTags(tags: unknown[]): NormalizedTag[] {
  const out: NormalizedTag[] = [];
  for (const tag of tags ?? []) {
    if (typeof tag === 'string') {
      const name = tag.trim();
      if (name) out.push({ id: name, name, color: '#22c55e' });
      continue;
    }
    if (!tag || typeof tag !== 'object') continue;
    const raw = tag as { id?: string; name?: string; color?: string };
    const name =
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : typeof raw.id === 'string'
          ? raw.id.trim()
          : '';
    if (!name) continue;
    const id =
      typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : name;
    const color =
      typeof raw.color === 'string' && raw.color.trim()
        ? raw.color.trim()
        : '#22c55e';
    out.push({ id, name, color });
  }
  return out;
}

// Commits the one-tap quest start: resolves or creates the area's tag,
// optionally applies it to tasks, and links it to the quest category.
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const categoryId =
      typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const requestedTagId =
      typeof body.tagId === 'string' ? body.tagId.trim() : '';
    const requestedTagName =
      typeof body.tagName === 'string' ? body.tagName.trim() : '';
    const requestedTagColor =
      typeof body.tagColor === 'string' && body.tagColor.trim()
        ? body.tagColor.trim()
        : '#22c55e';
    const taskIds = Array.isArray(body.taskIds)
      ? (body.taskIds as unknown[])
          .filter((id): id is string => typeof id === 'string' && !!id.trim())
          .slice(0, 200)
      : [];

    if (!categoryId) {
      return NextResponse.json(
        { error: 'Category required' },
        { status: 400 },
      );
    }
    if (!requestedTagId && !requestedTagName) {
      return NextResponse.json({ error: 'Pick a tag' }, { status: 400 });
    }
    if (requestedTagName.length > TAG_NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Tag name too long (max ${TAG_NAME_MAX_LENGTH} chars)` },
        { status: 400 },
      );
    }

    await connectMongo();

    const [category, user] = await Promise.all([
      QuestCategoryModel.findOne({ categoryId })
        .select('categoryId')
        .lean<{ categoryId: string }>(),
      UserModel.findById(userId, {
        tags: 1,
        premiumUntil: 1,
        focusProfile: 1,
      }).lean(),
    ]);
    if (!category) {
      return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
    }
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isPremium = user.premiumUntil
      ? new Date(user.premiumUntil) > new Date()
      : false;
    const existingTags = normalizeUserTags((user.tags ?? []) as unknown[]);
    const profile = normalizeFocusProfile(user);
    const hadStartedArea = (profile.categoryTagMap ?? []).some(
      (entry) => entry.tagIds.length > 0,
    );

    let tag: NormalizedTag | undefined;
    if (requestedTagId) {
      tag = existingTags.find((t) => t.id === requestedTagId);
      if (!tag) {
        return NextResponse.json({ error: 'Tag not found' }, { status: 400 });
      }
    } else {
      tag = existingTags.find(
        (t) => t.name.toLowerCase() === requestedTagName.toLowerCase(),
      );
      if (!tag) {
        const tagLimit = isPremium ? PREMIUM_TAG_LIMIT : FREE_TAG_LIMIT;
        if (existingTags.length >= tagLimit) {
          // At the limit we can't mint a new tag, but starting the quest must
          // still be possible: offer the user's free tags to link instead.
          const assignedElsewhere = new Set(
            (profile.categoryTagMap ?? [])
              .filter((entry) => entry.categoryId !== categoryId)
              .flatMap((entry) => entry.tagIds),
          );
          return NextResponse.json(
            {
              error: `You've used all ${tagLimit} tags`,
              code: 'TAG_LIMIT',
              tagLimit,
              tags: existingTags.filter((t) => !assignedElsewhere.has(t.id)),
            },
            { status: 400 },
          );
        }
        tag = { id: uuid(), name: requestedTagName, color: requestedTagColor };
        await UserModel.updateOne({ _id: userId }, { $push: { tags: tag } });
      }
    }

    let taggedCount = 0;
    if (taskIds.length > 0) {
      const result = await TaskModel.updateMany(
        {
          userId,
          id: { $in: taskIds },
          deletedAt: { $exists: false },
        },
        { $addToSet: { tags: tag.id } },
      );
      taggedCount = result.modifiedCount ?? 0;
    }

    const selectedCategoryIds = profile.selectedCategoryIds.includes(
      categoryId as MacroCategoryId,
    )
      ? profile.selectedCategoryIds
      : [...profile.selectedCategoryIds, categoryId as MacroCategoryId];
    const categoryTagMap: FocusCategoryTagMap[] = (
      profile.categoryTagMap ?? []
    )
      .filter((entry) => entry.categoryId !== categoryId)
      .map((entry) => ({
        ...entry,
        tagIds: entry.tagIds.filter((id) => id !== tag.id),
      }))
      .filter((entry) => entry.tagIds.length > 0);
    categoryTagMap.push({
      categoryId: categoryId as MacroCategoryId,
      tagIds: [tag.id],
    });

    const alreadyCounted = await QuestCounterModel.exists({
      userId,
      metric: 'focus_tag_linked',
    });
    if (!alreadyCounted) {
      await bumpQuestMetric({ userId, metric: 'focus_tag_linked', timezone });
    }

    await saveFocusProfile({
      userId,
      selectedCategoryIds,
      categoryTagMap,
      createSuggestions: false,
      timezone,
    });

    // A free user's first started area becomes their active focus, so the
    // quest they just started is the one that actually tracks.
    if (!isPremium && !hadStartedArea) {
      await UserModel.updateOne(
        { _id: userId },
        { $set: { 'focusProfile.activeFocusCategoryId': categoryId } },
      );
    }

    return NextResponse.json({ ok: true, tag, taggedCount });
  } catch (error) {
    console.error('Quest start failed:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not start the quest',
      },
      { status: 400 },
    );
  }
}
