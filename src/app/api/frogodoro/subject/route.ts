import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { getMacroCategory } from '@/lib/quests/catalog';
import { getZonedToday } from '@/lib/utils';
import {
  containerIdFor,
  OPEN_FOCUS_ID,
  OPEN_FOCUS_LABEL,
  type FocusSubjectKind,
} from '@/lib/focusSubject';
import type { UserTag } from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

const kinds = new Set<FocusSubjectKind>(['area', 'tag', 'open']);

// QuestCategorySchema's own default. A stored category still wearing it has
// never been given a colour, so the catalog's accent is the truer identity.
const SCHEMA_DEFAULT_ACCENT = '#6366f1';

const categoryCoverRef = (categoryId: string) =>
  `/api/quests/cover?type=category&id=${encodeURIComponent(categoryId)}`;

function normalizeTag(
  tag: UserTag | string,
): { id: string; name: string; color: string } | null {
  if (typeof tag === 'string') {
    const name = tag.trim();
    return name ? { id: name, name, color: '#22c55e' } : null;
  }
  const name = (tag?.name ?? '').trim();
  const id = (tag?.id ?? name).trim();
  return id && name ? { id, name, color: tag.color || '#22c55e' } : null;
}

type ResolvedSubject = {
  containerId: string;
  label: string;
  accent: string;
  tags: string[];
  focusAreaId?: string;
};

async function resolveSubject(
  userId: string,
  kind: FocusSubjectKind,
  id: string,
): Promise<ResolvedSubject | { error: string; status: number }> {
  if (kind === 'open') {
    return {
      containerId: OPEN_FOCUS_ID,
      label: OPEN_FOCUS_LABEL,
      accent: '#22c55e',
      tags: [],
    };
  }

  const user = await UserModel.findById(userId, { focusProfile: 1, tags: 1 }).lean<{
    focusProfile?: {
      selectedCategoryIds?: string[];
      categoryTagMap?: Array<{ categoryId: string; tagIds: string[] }>;
    };
    tags?: UserTag[];
  }>();

  if (kind === 'area') {
    if (!user?.focusProfile?.selectedCategoryIds?.includes(id)) {
      return { error: 'This area is not active', status: 403 };
    }
    const storedCategory = await QuestCategoryModel.findOne(
      { categoryId: id },
      { name: 1, accent: 1 },
    ).lean<{ name?: string; accent?: string }>();
    const builtIn = getMacroCategory(id);
    return {
      containerId: containerIdFor('area', id),
      label: storedCategory?.name || builtIn?.name || 'Area',
      accent: storedCategory?.accent || builtIn?.accent || '#22c55e',
      tags:
        user.focusProfile.categoryTagMap?.find((entry) => entry.categoryId === id)
          ?.tagIds ?? [],
      focusAreaId: id,
    };
  }

  const tag = (user?.tags ?? [])
    .map((entry) => normalizeTag(entry))
    .find((entry) => entry?.id === id);
  if (!tag) return { error: 'Tag not found', status: 404 };
  return {
    containerId: containerIdFor('tag', id),
    label: tag.name,
    accent: tag.color || '#22c55e',
    tags: [id],
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const user = await UserModel.findById(userId, { focusProfile: 1, tags: 1 }).lean<{
      focusProfile?: { selectedCategoryIds?: string[] };
      tags?: UserTag[];
    }>();

    const categoryIds = user?.focusProfile?.selectedCategoryIds ?? [];
    const stored = categoryIds.length
      ? await QuestCategoryModel.find(
          { categoryId: { $in: categoryIds } },
          { categoryId: 1, name: 1, accent: 1, coverImageUrl: 1, coverImageFile: 1 },
        ).lean<
          Array<{
            categoryId: string;
            name?: string;
            accent?: string;
            coverImageUrl?: string;
            coverImageFile?: { storagePath?: string } | null;
          }>
        >()
      : [];
    const storedById = new Map(stored.map((entry) => [entry.categoryId, entry]));

    const areas = categoryIds.map((id) => {
      const builtIn = getMacroCategory(id);
      const row = storedById.get(id);
      const hasCover =
        !!row?.coverImageFile?.storagePath ||
        (typeof row?.coverImageUrl === 'string' &&
          row.coverImageUrl.startsWith('data:'));
      return {
        id,
        name: row?.name || builtIn?.name || 'Area',
        // The schema's accent default is one shade of indigo, so every stored
        // category answered with it and the areas all looked identical. The
        // catalog's own colour is the real identity; the stored one only wins
        // when it has actually been customised away from that default.
        accent:
          row?.accent && row.accent !== SCHEMA_DEFAULT_ACCENT
            ? row.accent
            : builtIn?.accent || row?.accent || '#22c55e',
        coverImageUrl: hasCover
          ? categoryCoverRef(id)
          : row?.coverImageUrl || '',
      };
    });

    // Legacy tags are bare strings, where the name is also the id.
    const tags = (user?.tags ?? [])
      .map((tag) => normalizeTag(tag))
      .filter((tag): tag is { id: string; name: string; color: string } => !!tag);

    return NextResponse.json({ areas, tags });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const kind = (typeof body.kind === 'string' ? body.kind : '') as FocusSubjectKind;
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

    if (!kinds.has(kind) || (kind !== 'open' && !id)) {
      return NextResponse.json({ error: 'Choose what to focus on' }, { status: 400 });
    }

    await connectMongo();

    const resolved = await resolveSubject(userId, kind, id);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const task = await TaskModel.findOneAndUpdate(
      { userId, id: resolved.containerId },
      {
        $set: {
          type: 'focus-area',
          text: resolved.label,
          tags: resolved.tags,
          ...(resolved.focusAreaId ? { focusAreaId: resolved.focusAreaId } : {}),
        },
        $unset: { deletedAt: 1 },
        $setOnInsert: {
          userId,
          id: resolved.containerId,
          order: 0,
          completed: false,
          completedDates: [],
          suppressedDates: [],
          frogodoroSessions: [],
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    const today = getZonedToday(timezone);
    return NextResponse.json({
      task: {
        id: resolved.containerId,
        text: resolved.label,
        completed: false,
        tags: resolved.tags,
        // Only hand back a complete pair. A partial one read as a zero-minute
        // phase downstream, which starts and ends in the same instant.
        frogodoroSettings:
          task?.frogodoroSettings?.focusDuration &&
          task?.frogodoroSettings?.breakDuration
            ? task.frogodoroSettings
            : undefined,
        frogodoroSession:
          task?.frogodoroSessions?.find((session) => session.date === today) ?? null,
      },
      subject: {
        kind,
        id: resolved.containerId,
        label: resolved.label,
        accent: resolved.accent,
      },
    });
  } catch (error) {
    console.error('Focus subject creation failed:', error);
    return NextResponse.json(
      { error: 'Focus timer could not be opened' },
      { status: 500 },
    );
  }
}
