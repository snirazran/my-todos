import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import { getZonedToday, getZonedYMD } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type InsightTask = Pick<
  TaskDoc,
  | 'id'
  | 'text'
  | 'type'
  | 'date'
  | 'dayOfWeek'
  | 'completed'
  | 'completedDates'
  | 'suppressedDates'
  | 'createdAt'
  | 'deletedAt'
  | 'tags'
  | 'repeatMode'
  | 'repeatGroupId'
  | 'frogodoroSessions'
>;

type Instance = {
  date: string;
  taskId: string;
  groupId: string;
  title: string;
  completed: boolean;
  tags: string[];
  recurring: boolean;
};

type DailyPoint = {
  date: string;
  planned: number;
  completed: number;
  focusSeconds: number;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function shiftDay(dayKey: string, amount: number) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = shiftDay(cursor, 1)) days.push(cursor);
  return days;
}

function weekday(dayKey: string) {
  return new Date(`${dayKey}T12:00:00Z`).getUTCDay();
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function summarize(points: DailyPoint[]) {
  const planned = points.reduce((sum, day) => sum + day.planned, 0);
  const completed = points.reduce((sum, day) => sum + day.completed, 0);
  const focusSeconds = points.reduce((sum, day) => sum + day.focusSeconds, 0);
  const activeDays = points.filter((day) => day.completed > 0 || day.focusSeconds > 0).length;
  let run = 0;
  let bestRun = 0;
  for (const day of points) {
    if (day.completed > 0) {
      run += 1;
      bestRun = Math.max(bestRun, run);
    } else {
      run = 0;
    }
  }
  return { planned, completed, focusSeconds, activeDays, bestRun, completionRate: percent(completed, planned) };
}

function timeline(points: DailyPoint[], rangeDays: number) {
  const size = rangeDays === 7 ? 1 : 7;
  const buckets: Array<DailyPoint & { from: string; to: string }> = [];
  for (let index = 0; index < points.length; index += size) {
    const slice = points.slice(index, index + size);
    buckets.push({
      date: slice[0].date,
      from: slice[0].date,
      to: slice[slice.length - 1].date,
      planned: slice.reduce((sum, day) => sum + day.planned, 0),
      completed: slice.reduce((sum, day) => sum + day.completed, 0),
      focusSeconds: slice.reduce((sum, day) => sum + day.focusSeconds, 0),
    });
  }
  return buckets;
}

function safeTimezone(value: string | null) {
  const timezone = value || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return timezone;
  } catch {
    return 'UTC';
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const timezone = safeTimezone(req.nextUrl.searchParams.get('timezone'));
    const rawDays = Number(req.nextUrl.searchParams.get('days'));
    const rangeDays = rawDays === 30 || rawDays === 90 ? rawDays : 7;
    const today = getZonedToday(timezone);
    const currentStart = shiftDay(today, -(rangeDays - 1));
    const previousEnd = shiftDay(currentStart, -1);
    const previousStart = shiftDay(previousEnd, -(rangeDays - 1));
    const patternDays = Math.max(56, rangeDays);
    const patternStart = shiftDay(today, -(patternDays - 1));
    const historyStart = [previousStart, patternStart].sort()[0];
    const eventStart = new Date(`${patternStart}T00:00:00Z`);

    const [tasks, user, completionEvents] = await Promise.all([
      TaskModel.find(
        {
          userId,
          type: { $ne: 'backlog' },
          $or: [
            { type: 'weekly' },
            { date: { $gte: historyStart, $lte: today } },
            { frogodoroSessions: { $elemMatch: { date: { $gte: historyStart, $lte: today } } } },
          ],
        },
        {
          id: 1,
          text: 1,
          type: 1,
          date: 1,
          dayOfWeek: 1,
          completed: 1,
          completedDates: 1,
          suppressedDates: 1,
          createdAt: 1,
          deletedAt: 1,
          tags: 1,
          repeatMode: 1,
          repeatGroupId: 1,
          frogodoroSessions: 1,
        },
      ).lean<InsightTask[]>(),
      UserModel.findById(userId, { name: 1, frogName: 1, tags: 1 }).lean<{
        name?: string;
        frogName?: string;
        tags?: Array<{ id: string; name: string; color: string }>;
      }>(),
      AnalyticsEventModel.find(
        { userId, name: 'task_completed', occurredAt: { $gte: eventStart } },
        { occurredAt: 1 },
      ).lean<Array<{ occurredAt: Date }>>(),
    ]);

    const regularByDate = new Map<string, InsightTask[]>();
    const weeklyByDay = new Map<number, InsightTask[]>();
    const focusByDate = new Map<string, number>();

    for (const task of tasks) {
      if (task.type === 'regular' && task.date) {
        const matches = regularByDate.get(task.date) ?? [];
        matches.push(task);
        regularByDate.set(task.date, matches);
      } else if (task.type === 'weekly' && typeof task.dayOfWeek === 'number') {
        const matches = weeklyByDay.get(task.dayOfWeek) ?? [];
        matches.push(task);
        weeklyByDay.set(task.dayOfWeek, matches);
      }
      for (const session of task.frogodoroSessions ?? []) {
        if (session.date < historyStart || session.date > today) continue;
        focusByDate.set(session.date, (focusByDate.get(session.date) ?? 0) + Math.max(0, session.focusTime ?? 0));
      }
    }

    const allDates = daysBetween(historyStart, today);
    const instances: Instance[] = [];
    for (const date of allDates) {
      const candidates = [...(regularByDate.get(date) ?? []), ...(weeklyByDay.get(weekday(date)) ?? [])];
      for (const task of candidates) {
        const createdKey = task.createdAt ? getZonedYMD(task.createdAt, timezone) : null;
        const deletedKey = task.deletedAt ? getZonedYMD(task.deletedAt, timezone) : null;
        if (createdKey && createdKey > date) continue;
        if (deletedKey && deletedKey <= date) continue;
        if ((task.suppressedDates ?? []).includes(date)) continue;

        const repeating = task.type === 'weekly' || !!task.repeatGroupId || (!!task.repeatMode && task.repeatMode !== 'none');
        instances.push({
          date,
          taskId: task.id,
          groupId: task.repeatGroupId || task.id,
          title: task.text,
          completed: (task.completedDates ?? []).includes(date) || (task.type === 'regular' && !!task.completed),
          tags: task.tags ?? [],
          recurring: repeating,
        });
      }
    }

    const byDate = new Map<string, Instance[]>();
    for (const instance of instances) {
      const list = byDate.get(instance.date) ?? [];
      list.push(instance);
      byDate.set(instance.date, list);
    }
    const daily = allDates.map((date) => {
      const scheduled = byDate.get(date) ?? [];
      return {
        date,
        planned: scheduled.length,
        completed: scheduled.filter((task) => task.completed).length,
        focusSeconds: focusByDate.get(date) ?? 0,
      };
    });

    const currentDaily = daily.filter((day) => day.date >= currentStart);
    const previousDaily = daily.filter((day) => day.date >= previousStart && day.date <= previousEnd);
    const patternDaily = daily.filter((day) => day.date >= patternStart);
    const current = summarize(currentDaily);
    const previous = summarize(previousDaily);
    const completionDelta = current.completionRate - previous.completionRate;
    const focusDelta = previous.focusSeconds > 0
      ? Math.round(((current.focusSeconds - previous.focusSeconds) / previous.focusSeconds) * 100)
      : null;

    const patternInstances = instances.filter((instance) => instance.date >= patternStart);
    const weekdayPatterns = DAY_NAMES.map((name, index) => {
      const matching = patternInstances.filter((instance) => weekday(instance.date) === index);
      const matchingDays = patternDaily.filter((day) => weekday(day.date) === index);
      const completed = matching.filter((instance) => instance.completed).length;
      return {
        day: index,
        name,
        short: name.slice(0, 3),
        planned: matching.length,
        completed,
        rate: percent(completed, matching.length),
        focusSeconds: matchingDays.reduce((sum, day) => sum + day.focusSeconds, 0),
      };
    });
    const meaningfulWeekdays = weekdayPatterns.filter((day) => day.planned >= 2);
    const bestDay = [...meaningfulWeekdays]
      .filter((day) => day.completed > 0)
      .sort((a, b) => b.rate - a.rate || b.completed - a.completed)[0] ?? null;
    const hardestDay = [...meaningfulWeekdays].sort((a, b) => a.rate - b.rate || b.planned - a.planned)[0] ?? null;

    const activePatternDays = patternDaily.filter((day) => day.planned > 0);
    const typicalLoad = median(activePatternDays.map((day) => day.planned));
    const lighterDays = activePatternDays.filter((day) => day.planned <= typicalLoad);
    const heavierDays = activePatternDays.filter((day) => day.planned > typicalLoad);
    const rateForDays = (points: DailyPoint[]) => percent(
      points.reduce((sum, day) => sum + day.completed, 0),
      points.reduce((sum, day) => sum + day.planned, 0),
    );
    const focusDays = activePatternDays.filter((day) => day.focusSeconds > 0);
    const nonFocusDays = activePatternDays.filter((day) => day.focusSeconds === 0);
    const loadPattern = {
      typicalTasks: typicalLoad,
      lighterRate: rateForDays(lighterDays),
      heavierRate: rateForDays(heavierDays),
      lighterDays: lighterDays.length,
      heavierDays: heavierDays.length,
    };
    const focusPattern = {
      focusedRate: rateForDays(focusDays),
      otherRate: rateForDays(nonFocusDays),
      focusedDays: focusDays.length,
      otherDays: nonFocusDays.length,
    };

    const tagDefinitions = new Map((user?.tags ?? []).map((tag) => [tag.id, tag]));
    const tagGroups = new Map<string, { planned: number; completed: number }>();
    for (const instance of patternInstances) {
      for (const tag of instance.tags) {
        const aggregate = tagGroups.get(tag) ?? { planned: 0, completed: 0 };
        aggregate.planned += 1;
        if (instance.completed) aggregate.completed += 1;
        tagGroups.set(tag, aggregate);
      }
    }
    const tags = Array.from(tagGroups.entries())
      .map(([id, value]) => ({
        id,
        name: tagDefinitions.get(id)?.name ?? 'Other',
        color: tagDefinitions.get(id)?.color ?? '#6b8f71',
        ...value,
        rate: percent(value.completed, value.planned),
      }))
      .filter((tag) => tag.planned >= 2)
      .sort((a, b) => b.planned - a.planned || b.rate - a.rate)
      .slice(0, 6);

    const habitGroups = new Map<string, Instance[]>();
    for (const instance of patternInstances) {
      if (!instance.recurring) continue;
      const list = habitGroups.get(instance.groupId) ?? [];
      list.push(instance);
      habitGroups.set(instance.groupId, list);
    }
    const habits = Array.from(habitGroups.entries())
      .map(([id, list]) => {
        const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
        const completed = ordered.filter((item) => item.completed).length;
        let streak = 0;
        for (let index = ordered.length - 1; index >= 0 && ordered[index].completed; index -= 1) streak += 1;
        return {
          id,
          title: ordered[ordered.length - 1]?.title ?? 'Recurring task',
          completed,
          scheduled: ordered.length,
          rate: percent(completed, ordered.length),
          streak,
          recent: ordered.slice(-8).map((item) => ({ date: item.date, completed: item.completed })),
        };
      })
      .filter((habit) => habit.scheduled >= 3)
      .sort((a, b) => b.scheduled - a.scheduled || b.rate - a.rate)
      .slice(0, 5);

    const timeBuckets = new Map<string, number>([
      ['Morning', 0],
      ['Afternoon', 0],
      ['Evening', 0],
      ['Night', 0],
    ]);
    const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
    for (const event of completionEvents) {
      const parsedHour = Number(hourFormatter.format(new Date(event.occurredAt))) % 24;
      const label = parsedHour >= 5 && parsedHour < 12
        ? 'Morning'
        : parsedHour >= 12 && parsedHour < 17
          ? 'Afternoon'
          : parsedHour >= 17 && parsedHour < 22
            ? 'Evening'
            : 'Night';
      timeBuckets.set(label, (timeBuckets.get(label) ?? 0) + 1);
    }
    const topTime = Array.from(timeBuckets.entries()).sort((a, b) => b[1] - a[1])[0];
    const timePattern = completionEvents.length >= 3 && topTime?.[1]
      ? { label: topTime[0], count: topTime[1], share: percent(topTime[1], completionEvents.length) }
      : null;

    const signals: Array<{ tone: 'positive' | 'watch' | 'neutral'; eyebrow: string; title: string; body: string }> = [];
    if (bestDay) {
      signals.push({
        tone: 'positive',
        eyebrow: 'Good spot',
        title: `${bestDay.name} is your strongest day`,
        body: `You finish ${bestDay.rate}% of what you plan on ${bestDay.name}s. That rhythm is worth protecting.`,
      });
    }
    const loadGap = loadPattern.lighterRate - loadPattern.heavierRate;
    if (loadPattern.heavierDays >= 2 && loadGap >= 10) {
      signals.push({
        tone: 'watch',
        eyebrow: 'Worth noticing',
        title: 'A shorter list works better',
        body: `On days with ${typicalLoad} tasks or fewer, your finish rate is ${loadPattern.lighterRate}%—${loadGap} points higher than fuller days.`,
      });
    } else if (hardestDay && bestDay && hardestDay.day !== bestDay.day && bestDay.rate - hardestDay.rate >= 10) {
      signals.push({
        tone: 'watch',
        eyebrow: 'Weak spot',
        title: `${hardestDay.name} needs a lighter touch`,
        body: `Your finish rate is ${hardestDay.rate}% on ${hardestDay.name}s. Try moving one flexible task to your stronger days.`,
      });
    }
    const focusGap = focusPattern.focusedRate - focusPattern.otherRate;
    if (focusPattern.focusedDays >= 2 && focusPattern.otherDays >= 2 && Math.abs(focusGap) >= 8) {
      signals.push({
        tone: focusGap > 0 ? 'positive' : 'neutral',
        eyebrow: 'Focus pattern',
        title: focusGap > 0 ? 'Focus time and follow-through show up together' : 'Focus days look different',
        body: `You finish ${focusPattern.focusedRate}% on focus-session days, compared with ${focusPattern.otherRate}% on other planned days.`,
      });
    } else if (timePattern) {
      signals.push({
        tone: 'neutral',
        eyebrow: 'Natural rhythm',
        title: `${timePattern.label} is your finish window`,
        body: `${timePattern.share}% of your recent task completions happened in the ${timePattern.label.toLowerCase()}.`,
      });
    }
    if (!signals.length && current.planned > 0) {
      signals.push({
        tone: 'neutral',
        eyebrow: 'Still learning',
        title: 'Your patterns are taking shape',
        body: 'Keep checking off tasks and using focus sessions. Clearer patterns appear as your history grows.',
      });
    }

    let nextStep = {
      title: 'Pick one task that matters most',
      body: 'Put it first tomorrow. A clear first win makes the rest of the list feel lighter.',
      href: `/planner?date=${shiftDay(today, 1)}`,
      action: 'Plan Tomorrow',
    };
    if (loadPattern.heavierDays >= 2 && loadGap >= 10) {
      nextStep = {
        title: `Aim for ${Math.max(1, typicalLoad)} key tasks`,
        body: 'That is the load where your history shows the best follow-through. Extra tasks can stay saved for later.',
        href: '/planner',
        action: 'Lighten My Plan',
      };
    } else if (hardestDay && bestDay && bestDay.rate - hardestDay.rate >= 15) {
      nextStep = {
        title: `Make ${hardestDay.name} a little easier`,
        body: `Move one flexible task to ${bestDay.name}, your most reliable day.`,
        href: '/planner',
        action: 'Adjust My Week',
      };
    } else if (focusPattern.focusedDays >= 2 && focusGap >= 10) {
      nextStep = {
        title: 'Start with one focus session',
        body: 'Focused days line up with stronger follow-through in your recent history.',
        href: '/',
        action: 'Choose a Task',
      };
    }

    const headline = current.planned === 0
      ? 'A fresh page'
      : completionDelta >= 8
        ? 'You’re gaining momentum'
        : current.completionRate >= 75
          ? 'Your rhythm looks strong'
          : current.completionRate >= 50
            ? 'You’re building a steady rhythm'
            : 'A gentle reset can help';
    const summaryMessage = current.planned === 0
      ? 'Plan a few tasks and your patterns will start appearing here.'
      : `You completed ${current.completed} of ${current.planned} planned tasks${bestDay ? `, with your best rhythm on ${bestDay.name}s` : ''}.`;

    return NextResponse.json({
      range: { days: rangeDays, from: currentStart, to: today, previousFrom: previousStart, previousTo: previousEnd },
      profile: { name: user?.name ?? null, frogName: user?.frogName ?? null },
      summary: {
        ...current,
        completionDelta,
        focusDelta,
        headline,
        message: summaryMessage,
      },
      previous,
      timeline: timeline(currentDaily, rangeDays),
      daily: currentDaily,
      weekdayPatterns,
      loadPattern,
      focusPattern,
      timePattern,
      tags,
      habits,
      signals: signals.slice(0, 3),
      nextStep,
      patternDays,
    });
  } catch (error) {
    console.error('User insights failed:', error);
    return NextResponse.json({ error: 'Insights could not be loaded' }, { status: 500 });
  }
}
