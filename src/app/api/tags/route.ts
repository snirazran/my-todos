import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { getZonedToday } from '@/lib/utils';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/** Add `n` days to a YYYY-MM-DD string (UTC-noon anchored to dodge DST). */
function addDaysYMD(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Friendly label for a YYYY-MM-DD relative to `today`. */
function dateLabel(ymd: string, today: string) {
  if (ymd === today) return 'Today';
  if (ymd === addDaysYMD(today, 1)) return 'Tomorrow';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Human label for a repeating task's cadence. */
function repeatLabel(t: any): string {
  switch (t.repeatMode) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekend':
      return 'Weekends';
    case 'monthly':
      return 'Monthly';
    case 'custom':
      return 'Custom';
    case 'weekly':
    default:
      return 'Weekly';
  }
}

const FREE_TAG_LIMIT = 6;
const PREMIUM_TAG_LIMIT = 50;

function normalizeUserTag(tag: any, index: number) {
  if (typeof tag === 'string') {
    const name = tag.trim();
    if (!name) return null;
    return {
      id: name,
      name,
      color: '#22c55e',
    };
  }

  if (!tag || typeof tag !== 'object') return null;

  const name =
    typeof tag.name === 'string' && tag.name.trim()
      ? tag.name.trim()
      : typeof tag.id === 'string' && tag.id.trim()
        ? tag.id.trim()
        : '';

  if (!name) return null;

  const id =
    typeof tag.id === 'string' && tag.id.trim()
      ? tag.id.trim()
      : name;

  const color =
    typeof tag.color === 'string' && tag.color.trim()
      ? tag.color.trim()
      : '#22c55e';

  return {
    ...tag,
    id,
    name,
    color,
    _key: `${id}-${index}`,
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const usageId = searchParams.get('usage');
    if (usageId) {
      return await handleTagUsage(req, userId, usageId);
    }

    const user = await UserModel.findById(userId, {
      tags: 1,
      premiumUntil: 1,
    }).lean();

    const now = new Date();
    const isPremium = user?.premiumUntil
      ? new Date(user.premiumUntil) > now
      : false;
    const tags = (user?.tags ?? [])
      .map((tag: any, index: number) => normalizeUserTag(tag, index))
      .filter(Boolean)
      .map((tag: any, index: number) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        key: tag._key ?? `${tag.id}-${index}`,
        disabled: !isPremium && index >= FREE_TAG_LIMIT,
      }));

    return NextResponse.json({ tags, isPremium });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

/**
 * Tasks that currently use a tag (today + future only; repeating tasks listed
 * once, not per occurrence) plus the focus area the tag is linked to, if any.
 */
async function handleTagUsage(
  req: NextRequest,
  userId: string,
  tagId: string,
) {
  const { searchParams } = new URL(req.url);
  const tz = searchParams.get('timezone') || 'UTC';
  const today = getZonedToday(tz);

  const user = await UserModel.findById(userId, {
    tags: 1,
    focusProfile: 1,
  }).lean<{ tags?: any[]; focusProfile?: any }>();

  const tagDef = (user?.tags ?? []).find(
    (t: any) => (typeof t === 'string' ? t : t?.id) === tagId,
  );
  const tagName =
    tagDef && typeof tagDef === 'object' ? tagDef.name : (tagDef as string);
  const tagMatch = { $in: [tagId, tagName].filter(Boolean) };

  const docs = await TaskModel.find(
    {
      userId,
      deletedAt: { $exists: false },
      tags: tagMatch,
      $or: [
        { type: 'regular', date: { $gte: today } },
        { type: 'weekly' },
      ],
    },
    {
      id: 1,
      text: 1,
      type: 1,
      date: 1,
      repeatMode: 1,
      repeatGroupId: 1,
      repeatEndDate: 1,
    },
  )
    .sort({ date: 1 })
    .lean<any[]>()
    .exec();

  const tasks: { id: string; text: string; type: 'repeating' | 'once'; when: string }[] = [];
  const seenGroups = new Set<string>();
  for (const d of docs) {
    if (d.type === 'weekly') {
      // Drop series that have already ended, and show each series only once.
      if (d.repeatEndDate && d.repeatEndDate < today) continue;
      const key = d.repeatGroupId || d.id;
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);
      tasks.push({ id: d.id, text: d.text, type: 'repeating', when: repeatLabel(d) });
    } else {
      tasks.push({
        id: d.id,
        text: d.text,
        type: 'once',
        when: d.date ? dateLabel(d.date, today) : '',
      });
    }
  }

  // Focus area association (from the user's focus profile tag map).
  let focus: { categoryId: string; name: string; accent?: string } | null = null;
  const map = user?.focusProfile?.categoryTagMap ?? [];
  const entry = map.find(
    (m: any) => Array.isArray(m.tagIds) && m.tagIds.includes(tagId),
  );
  if (entry?.categoryId) {
    const cat = await QuestCategoryModel.findOne(
      { categoryId: entry.categoryId },
      { name: 1, accent: 1 },
    ).lean<{ name?: string; accent?: string }>();
    focus = {
      categoryId: entry.categoryId,
      name: cat?.name || entry.categoryId,
      accent: cat?.accent,
    };
  }

  return NextResponse.json({ tasks, focus });
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { id, color, name } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Tag id required' }, { status: 400 });
    }
    await connectMongo();

    const set: Record<string, unknown> = {};
    if (typeof color === 'string' && color.trim()) {
      set['tags.$[t].color'] = color.trim();
    }
    if (typeof name === 'string' && name.trim()) {
      const trimmed = name.trim();
      if (trimmed.length > 20) {
        return NextResponse.json(
          { error: 'Tag name too long (max 20 chars)' },
          { status: 400 },
        );
      }
      set['tags.$[t].name'] = trimmed;
    }
    if (Object.keys(set).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    await UserModel.updateOne(
      { _id: userId },
      { $set: set },
      { arrayFilters: [{ 't.id': id }] },
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { name, color } = await req.json();
    if (!name || !color) {
      return NextResponse.json(
        { error: 'Name and color required' },
        { status: 400 },
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 20) {
      return NextResponse.json(
        { error: 'Tag name too long (max 20 chars)' },
        { status: 400 },
      );
    }

    await connectMongo();

    const user = await UserModel.findById(userId, {
      tags: 1,
      premiumUntil: 1,
    }).lean();

    const now = new Date();
    const isPremium = user?.premiumUntil
      ? new Date(user.premiumUntil) > now
      : false;
    const TAG_LIMIT = isPremium ? PREMIUM_TAG_LIMIT : FREE_TAG_LIMIT;

    if (user?.tags && user.tags.length >= TAG_LIMIT) {
      return NextResponse.json(
        {
          error: `Tag limit reached (${user.tags.length}/${TAG_LIMIT}). ${!isPremium ? 'Upgrade to Premium for more!' : ''}`,
        },
        { status: 400 },
      );
    }

    const newTag = {
      id: uuid(),
      name: trimmedName,
      color,
    };

    await UserModel.updateOne({ _id: userId }, { $push: { tags: newTag } });

    return NextResponse.json({ tag: newTag });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Tag ID required' }, { status: 400 });
    }

    await connectMongo();

    // Find the tag to get its name (for legacy cleanup)
    const user = await UserModel.findById(userId, {
      tags: 1,
      'focusProfile.categoryTagMap': 1,
    }).lean();
    const tagToRemove = user?.tags?.find((t: any) => t.id === id);

    const pullQuery: any = { tags: id };
    if (tagToRemove?.name) {
      // If we found the tag name, also try to pull it (legacy tasks might have stored name)
      // We use $in to match either ID or Name
      pullQuery.tags = { $in: [id, tagToRemove.name] };
    }

    // A deleted tag must also stop powering area quests, or the quest map
    // keeps a dead id and the quest looks half-started.
    const categoryTagMap = (user as any)?.focusProfile?.categoryTagMap as
      | Array<{ categoryId: string; tagIds?: string[] }>
      | undefined;
    const nextCategoryTagMap = (categoryTagMap ?? [])
      .map((entry) => ({
        ...entry,
        tagIds: (entry.tagIds ?? []).filter((tagId) => tagId !== id),
      }))
      .filter((entry) => entry.tagIds.length > 0);
    const mapChanged =
      (categoryTagMap ?? []).some((entry) =>
        (entry.tagIds ?? []).includes(id),
      );

    // Run updates in parallel for better performance
    await Promise.all([
      // 1. Remove this tag (ID or Name) from all tasks belonging to this user
      TaskModel.updateMany(
        { userId: userId },
        { $pull: { tags: { $in: [id, tagToRemove?.name].filter(Boolean) } } },
      ),
      // 2. Remove the tag definition from the user
      UserModel.updateOne({ _id: userId }, { $pull: { tags: { id } } }),
      // 3. Unlink it from any area quest it powered
      ...(mapChanged
        ? [
            UserModel.updateOne(
              { _id: userId },
              { $set: { 'focusProfile.categoryTagMap': nextCategoryTagMap } },
            ),
          ]
        : []),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
