export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { createTasksForUser } from '@/app/api/tasks/route';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { buildStarterPlanForAreas } from '@/lib/quests/starterPlanServer';
import {
  applyStarterDayStart,
  normalizeStarterDayStart,
  pickStarterTagColor,
  type StarterPlanItem,
} from '@/lib/quests/starterPlan';

import { FREE_TAG_LIMIT, PREMIUM_TAG_LIMIT } from '@/lib/tags/limits';

function parseAreas(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function GET(req: NextRequest) {
  try {
    await connectMongo();
    const { searchParams } = new URL(req.url);
    const selectedCategoryIds = parseAreas(searchParams.get('areas'));
    const { config, items } = await buildStarterPlanForAreas({
      selectedCategoryIds,
    });
    return NextResponse.json({
      isActive: config.isActive,
      copy: {
        headline: config.headline,
        subheadline: config.subheadline,
        acceptLabel: config.acceptLabel,
        declineLabel: config.declineLabel,
        footnote: config.footnote,
      },
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        isActive: false,
        items: [],
        error: error instanceof Error ? error.message : 'Failed to build plan',
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const selectedCategoryIds = Array.isArray(body.selectedCategoryIds)
      ? body.selectedCategoryIds.filter((id: unknown) => typeof id === 'string')
      : [];
    const acceptedIds: string[] = Array.isArray(body.itemIds)
      ? body.itemIds.filter((id: unknown) => typeof id === 'string').slice(0, 20)
      : [];

    await connectMongo();

    const user = await UserModel.findById(userId)
      .select('tags premiumUntil focusProfile')
      .lean<{
        tags?: Array<{ id?: string; name?: string; color?: string }>;
        premiumUntil?: Date;
        focusProfile?: { suggestedContentCreatedAt?: Date };
      }>();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.focusProfile?.suggestedContentCreatedAt) {
      return NextResponse.json({ ok: true, alreadyApplied: true, created: 0 });
    }

    if (acceptedIds.length === 0) {
      await UserModel.updateOne(
        { _id: userId },
        { $set: { 'focusProfile.suggestedContentCreatedAt': new Date() } },
      );
      await recordAnalyticsEvent({
        userId,
        name: 'starter_plan_skipped',
        properties: { areas: selectedCategoryIds.length },
      });
      return NextResponse.json({ ok: true, created: 0, categoryTagMap: [] });
    }

    const { config, items } = await buildStarterPlanForAreas({
      selectedCategoryIds,
    });
    const dayStart = normalizeStarterDayStart(body.dayStart);
    const accepted = applyStarterDayStart(items, dayStart).filter((item) =>
      acceptedIds.includes(item.id),
    );
    if (accepted.length === 0) {
      return NextResponse.json({ ok: true, created: 0, categoryTagMap: [] });
    }

    const usedCategoryIds = Array.from(
      new Set(accepted.map((item) => item.categoryId)),
    );

    const tagIdByCategory = new Map<string, string>();
    const categoryTagMap: Array<{ categoryId: string; tagIds: string[] }> = [];
    if (config.linkTags) {
      const isPremium = user.premiumUntil
        ? new Date(user.premiumUntil) > new Date()
        : false;
      const limit = isPremium ? PREMIUM_TAG_LIMIT : FREE_TAG_LIMIT;
      const existingTags = (user.tags ?? []).filter((tag) => tag?.name);
      const byName = new Map(
        existingTags.map((tag) => [
          (tag.name ?? '').trim().toLowerCase(),
          (tag.id ?? tag.name ?? '').trim(),
        ]),
      );
      const categoryDocs = await QuestCategoryModel.find({
        categoryId: { $in: usedCategoryIds },
      })
        .select('categoryId name shortLabel accent')
        .lean<
          Array<{
            categoryId: string;
            name: string;
            shortLabel?: string;
            accent?: string;
          }>
        >();
      const takenColors = new Set(
        existingTags
          .map((tag) => (tag.color ?? '').trim().toLowerCase())
          .filter(Boolean),
      );
      const newTags: Array<{ id: string; name: string; color: string }> = [];
      let slots = limit - existingTags.length;
      for (const categoryId of usedCategoryIds) {
        const doc = categoryDocs.find((c) => c.categoryId === categoryId);
        if (!doc) continue;
        const label = (doc.shortLabel?.trim() || doc.name).slice(0, 20);
        const existingId = byName.get(label.toLowerCase());
        if (existingId) {
          tagIdByCategory.set(categoryId, existingId);
          continue;
        }
        if (slots <= 0) continue;
        const tag = {
          id: uuid(),
          name: label,
          color: pickStarterTagColor(categoryId, takenColors, doc.accent),
        };
        takenColors.add(tag.color.toLowerCase());
        newTags.push(tag);
        byName.set(label.toLowerCase(), tag.id);
        tagIdByCategory.set(categoryId, tag.id);
        slots -= 1;
      }
      if (newTags.length > 0) {
        await UserModel.updateOne(
          { _id: userId },
          { $push: { tags: { $each: newTags } } },
        );
      }
      tagIdByCategory.forEach((tagId, categoryId) => {
        categoryTagMap.push({ categoryId, tagIds: [tagId] });
      });
    }

    const creationBatchId = uuid();
    let created = 0;
    for (const item of accepted as StarterPlanItem[]) {
      const tagId = tagIdByCategory.get(item.categoryId);
      const result = await createTasksForUser(
        userId,
        {
          text: item.text,
          repeat: 'weekly',
          days: item.days,
          ...(item.startTime ? { startTime: item.startTime } : {}),
          ...(item.reminder ? { reminder: item.reminder } : {}),
          ...(item.anchor ? { notes: item.anchor } : {}),
          ...(tagId ? { tags: [tagId] } : {}),
        },
        timezone,
        { creationBatchId, isSeededPlan: true },
      );
      if (result.ok) created += 1;
    }

    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'focusProfile.suggestedContentCreatedAt': new Date() } },
    );

    await recordAnalyticsEvent({
      userId,
      name: 'starter_plan_accepted',
      properties: {
        tasks: created,
        offered: items.length,
        areas: usedCategoryIds.length,
        dayStart,
      },
    });

    return NextResponse.json({ ok: true, created, categoryTagMap });
  } catch (error) {
    console.error('Starter plan apply failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply plan' },
      { status: 400 },
    );
  }
}
