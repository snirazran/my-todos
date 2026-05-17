export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel, { type TaskDoc, type Weekday } from '@/lib/models/Task';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import type { FocusCategoryTagMap } from '@/lib/quests/types';

function getWeekRange(tz: string, weeksAgo: number) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now);
  const today = new Date(todayStr + 'T12:00:00Z');
  const dow = today.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;

  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() + mondayOffset);

  const startMonday = new Date(thisMonday);
  startMonday.setUTCDate(thisMonday.getUTCDate() - 7 * weeksAgo);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startMonday);
    d.setUTCDate(startMonday.getUTCDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return { dates, weekStart: dates[0], weekEnd: dates[6] };
}

type DayStats = {
  date: string;
  dayName: string;
  tasksTotal: number;
  tasksCompleted: number;
  focusMinutes: number;
};

type TagStat = {
  tagId: string;
  tagName: string;
  tagColor: string;
  completedCount: number;
  totalCount: number;
};

type FocusAreaStat = {
  categoryId: string;
  categoryName: string;
  accent: string;
  tagIds: string[];
  tasksTotal: number;
  tasksCompleted: number;
  focusMinutes: number;
  topTags: TagStat[];
};

export type WeeklyRecapData = {
  weekStart: string;
  weekEnd: string;
  isPremium: boolean;

  // General stats
  tasksAdded: number;
  tasksCompleted: number;
  completionRate: number;
  activeDays: number;
  bestDay: DayStats | null;
  totalFocusMinutes: number;
  fliesEarned: number;
  currentStreak: number;
  days: DayStats[];

  // Tag breakdown
  topTags: TagStat[];

  // Focus areas
  focusAreas: FocusAreaStat[];
  selectedCategoryIds: string[];

  // Week-over-week (premium)
  prevWeek: {
    tasksCompleted: number;
    completionRate: number;
    totalFocusMinutes: number;
    activeDays: number;
  } | null;

  // Has user seen this recap already
  alreadySeen: boolean;

  // Skins (New)
  skinsNew: number;
  skinsRarest: string | null;
  skinsRarestDetail?: { slot: string; riveIndex: number; name: string } | null;
};

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
}

function computeWeekStats(
  tasks: TaskDoc[],
  dates: string[],
  tz: string,
) {
  const getZonedYMD = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  const days: DayStats[] = dates.map((dateStr) => {
    const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay() as Weekday;

    const dayTasks = tasks.filter((t) => {
      let matchesDay = false;
      if (t.type === 'regular') matchesDay = t.date === dateStr;
      else if (t.type === 'weekly') matchesDay = t.dayOfWeek === dow;
      if (!matchesDay) return false;

      if (t.createdAt) {
        const createdYMD = getZonedYMD(t.createdAt);
        if (createdYMD > dateStr) return false;
      }
      if (t.deletedAt) {
        const deletedYMD = getZonedYMD(t.deletedAt);
        if (deletedYMD <= dateStr) return false;
      }
      if ((t.suppressedDates ?? []).includes(dateStr)) return false;
      return true;
    });

    let focusMinutes = 0;
    for (const t of dayTasks) {
      const session = t.frogodoroSessions?.find((s) => s.date === dateStr);
      if (session) {
        focusMinutes += Math.round((session.focusTime ?? 0) / 60000);
      }
    }

    return {
      date: dateStr,
      dayName: getDayName(dateStr),
      tasksTotal: dayTasks.length,
      tasksCompleted: dayTasks.filter(
        (t) =>
          (t.completedDates ?? []).includes(dateStr) ||
          (!!t.completed && t.type === 'regular'),
      ).length,
      focusMinutes,
    };
  });

  const tasksCompleted = days.reduce((s, d) => s + d.tasksCompleted, 0);
  const tasksTotal = days.reduce((s, d) => s + d.tasksTotal, 0);
  const activeDays = days.filter(
    (d) => d.tasksCompleted > 0,
  ).length;
  const totalFocusMinutes = days.reduce((s, d) => s + d.focusMinutes, 0);
  const completionRate = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  const bestDay =
    [...days].sort(
      (a, b) =>
        b.tasksCompleted - a.tasksCompleted,
    )[0] ?? null;

  return {
    days,
    tasksCompleted,
    tasksTotal,
    completionRate,
    activeDays,
    totalFocusMinutes,
    bestDay,
  };
}

export async function GET(req: NextRequest) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    const url = new URL(req.url);
    const tz = url.searchParams.get('timezone') || 'UTC';

    const user = await UserModel.findById(uid).lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isPremium =
      !!(user as any).premiumUntil &&
      new Date((user as any).premiumUntil) > new Date();

    const lastRecapWeek = (user as any).lastRecapWeek || '';

    // Last week = 1 week ago
    const lastWeek = getWeekRange(tz, 1);
    const prevWeekRange = getWeekRange(tz, 2);

    const alreadySeen = lastRecapWeek === lastWeek.weekStart;

    // Fetch all relevant tasks
    const allTasks = await TaskModel.find({
      userId: uid,
      deletedAt: { $exists: false },
      $or: [
        { type: 'regular', date: { $gte: prevWeekRange.weekStart, $lte: lastWeek.weekEnd } },
        { type: 'weekly' },
      ],
    }).lean<TaskDoc[]>();

    // Compute last week stats
    const lastWeekStats = computeWeekStats(allTasks, lastWeek.dates, tz);

    // Count tasks added last week
    const tasksAdded = allTasks.filter((t) => {
      if (t.type === 'weekly') return false;
      const created = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(t.createdAt);
      return created >= lastWeek.weekStart && created <= lastWeek.weekEnd;
    }).length;

    // Compute streak (consecutive days with completions, ending at last week's end)
    let currentStreak = 0;
    for (let i = lastWeek.dates.length - 1; i >= 0; i--) {
      const d = lastWeekStats.days[i];
      if (d.tasksCompleted > 0) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Flies earned (approximate from completed tasks)
    const fliesEarned = lastWeekStats.tasksCompleted;

    // Tag breakdown
    const tagMap = new Map<string, { total: number; completed: number }>();
    const userTags: Record<string, { name: string; color: string }> = {};
    for (const t of (user as any).tags ?? []) {
      userTags[t.id] = { name: t.name, color: t.color };
    }

    for (const dateStr of lastWeek.dates) {
      const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay() as Weekday;
      for (const t of allTasks) {
        let matchesDay = false;
        if (t.type === 'regular') matchesDay = t.date === dateStr;
        else if (t.type === 'weekly') matchesDay = t.dayOfWeek === dow;
        if (!matchesDay) continue;

        const isCompleted =
          (t.completedDates ?? []).includes(dateStr) ||
          (!!t.completed && t.type === 'regular');

        for (const tagId of t.tags ?? []) {
          const entry = tagMap.get(tagId) ?? { total: 0, completed: 0 };
          entry.total++;
          if (isCompleted) entry.completed++;
          tagMap.set(tagId, entry);
        }
      }
    }

    const topTags: TagStat[] = Array.from(tagMap.entries())
      .map(([tagId, { total, completed }]) => ({
        tagId,
        tagName: userTags[tagId]?.name ?? tagId,
        tagColor: userTags[tagId]?.color ?? '#6b7280',
        completedCount: completed,
        totalCount: total,
      }))
      .sort((a, b) => b.completedCount - a.completedCount)
      .slice(0, 5);

    // Focus areas
    const focusProfile = (user as any).focusProfile;
    const selectedCategoryIds: string[] = focusProfile?.selectedCategoryIds ?? [];
    const categoryTagMap: FocusCategoryTagMap[] = focusProfile?.categoryTagMap ?? [];

    const focusAreas: FocusAreaStat[] = selectedCategoryIds.map((catId) => {
      const category = QUEST_MACRO_CATEGORIES.find((c) => c.id === catId);
      const tagEntry = categoryTagMap.find((m) => m.categoryId === catId);
      const tagIds = tagEntry?.tagIds ?? [];
      const tagSet = new Set(tagIds);

      let tasksTotal = 0;
      let tasksCompleted = 0;
      let focusMinutes = 0;

      for (const dateStr of lastWeek.dates) {
        const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay() as Weekday;
        for (const t of allTasks) {
          const hasFocusTag = (t.tags ?? []).some((tid) => tagSet.has(tid));
          if (!hasFocusTag) continue;

          let matchesDay = false;
          if (t.type === 'regular') matchesDay = t.date === dateStr;
          else if (t.type === 'weekly') matchesDay = t.dayOfWeek === dow;
          if (!matchesDay) continue;

          const isCompleted =
            (t.completedDates ?? []).includes(dateStr) ||
            (!!t.completed && t.type === 'regular');

          tasksTotal++;
          if (isCompleted) tasksCompleted++;

          const session = t.frogodoroSessions?.find((s) => s.date === dateStr);
          if (session) {
            focusMinutes += Math.round((session.focusTime ?? 0) / 60000);
          }
        }
      }

      const areaTopTags: TagStat[] = tagIds
        .map((tagId) => {
          const stats = tagMap.get(tagId);
          return {
            tagId,
            tagName: userTags[tagId]?.name ?? tagId,
            tagColor: userTags[tagId]?.color ?? '#6b7280',
            completedCount: stats?.completed ?? 0,
            totalCount: stats?.total ?? 0,
          };
        })
        .filter((t) => t.totalCount > 0)
        .sort((a, b) => b.completedCount - a.completedCount);

      return {
        categoryId: catId,
        categoryName: category?.name ?? catId,
        accent: category?.accent ?? '#6b7280',
        tagIds,
        tasksTotal,
        tasksCompleted,
        focusMinutes,
        topTags: areaTopTags,
      };
    });

    // Previous week comparison (premium)
    let prevWeek = null;
    if (isPremium) {
      const prev = computeWeekStats(allTasks, prevWeekRange.dates, tz);
      prevWeek = {
        tasksCompleted: prev.tasksCompleted,
        completionRate: prev.completionRate,
        totalFocusMinutes: prev.totalFocusMinutes,
        activeDays: prev.activeDays,
      };
    }

    // Skins logic
    const wardrobe = (user as any).wardrobe || {};
    const inventoryHistory = wardrobe.inventoryHistory || {};
    const fullCatalog = await getFullCatalog();
    const catalogMap = buildById(fullCatalog);

    const newSkinIds = Object.entries(inventoryHistory)
      .filter(([id, timestamp]) => {
        const created = new Date(timestamp as string);
        // Include everything from start of last week until NOW
        return created >= new Date(lastWeek.weekStart);
      })
      .map(([id]) => id);

    // Fallback for skins that might have createdAt but not in history yet
    const inventory = (user as any).inventory || [];
    if (Array.isArray(inventory)) {
      inventory.forEach((item: any) => {
        if (item.id && item.createdAt && !inventoryHistory[item.id]) {
          const created = new Date(item.createdAt);
          if (created >= new Date(lastWeek.weekStart)) {
            if (!newSkinIds.includes(item.id)) newSkinIds.push(item.id);
          }
        }
      });
    }

    const rarityOrder: Record<string, number> = {
      'common': 1,
      'uncommon': 2,
      'rare': 3,
      'epic': 4,
      'legendary': 5
    };

    const rarestSkinItem = newSkinIds.length > 0 
      ? newSkinIds
          .map(id => catalogMap[id])
          .filter(Boolean)
          .sort((a, b) => (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0))[0]
      : null;

    const result: WeeklyRecapData = {
      weekStart: lastWeek.weekStart,
      weekEnd: lastWeek.weekEnd,
      isPremium,
      tasksAdded,
      tasksCompleted: lastWeekStats.tasksCompleted,
      completionRate: lastWeekStats.completionRate,
      activeDays: lastWeekStats.activeDays,
      bestDay: lastWeekStats.bestDay,
      totalFocusMinutes: lastWeekStats.totalFocusMinutes,
      fliesEarned,
      currentStreak,
      days: lastWeekStats.days,
      topTags,
      focusAreas,
      selectedCategoryIds,
      prevWeek,
      alreadySeen,
      skinsNew: newSkinIds.length,
      skinsRarest: rarestSkinItem?.name ?? null,
      skinsRarestDetail: rarestSkinItem ? { slot: rarestSkinItem.slot, riveIndex: rarestSkinItem.riveIndex, name: rarestSkinItem.name } : null,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[weekly-recap] error:', err);
    return NextResponse.json(
      { error: 'Failed to generate recap' },
      { status: 500 },
    );
  }
}

// Mark recap as seen
export async function POST(req: NextRequest) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    const { weekStart } = await req.json();
    if (!weekStart) {
      return NextResponse.json({ error: 'Missing weekStart' }, { status: 400 });
    }

    await UserModel.updateOne(
      { _id: uid },
      { $set: { lastRecapWeek: weekStart } },
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
