import { milestoneForStreak } from '@/lib/flyValue';

export type DoneMomentKind =
  | 'day_cleared'
  | 'streak_milestone'
  | 'count_milestone'
  | 'tag_cleared'
  | 'first_ever'
  | 'comeback'
  | 'streak'
  | 'one_left'
  | 'focus'
  | 'steps'
  | 'early'
  | 'late'
  | 'first_of_day'
  | 'progress';

export type DoneBadge = 'flame' | 'sparkle' | 'party' | 'heart' | 'star' | 'tag';

export type DoneConfetti = 'burst' | 'shower';

export type DoneMoment = {
  id: string;
  kind: DoneMomentKind;
  title: string;
  detail: string;
  tag?: { name: string; color: string };
  badge?: DoneBadge;
  confetti?: DoneConfetti;
};

export type DoneTaskLike = {
  id: string;
  text: string;
  completed: boolean;
  type?: string;
  repeatMode?: string;
  tags?: string[];
  streak?: number;
  completedDates?: string[];
  checklist?: { done: boolean }[];
  frogodoroSession?: { date: string; focusTime: number } | null;
};

type TagLike = { id: string; name: string; color: string };

const GENERAL_TITLES = [
  'Done!',
  'Nailed it!',
  'Ribbit!',
  'Gulp! Done.',
  'Off the list!',
  'Crossed off!',
  'One less thing!',
  'Yum!',
  'Handled.',
  'Another one!',
  'Boom. Done.',
  'Sorted!',
  'Snack secured',
  'Done and done',
  'Smooth!',
  'Tasty!',
];

const COMPLIMENT_TITLES = [
  'Proud of you!',
  'Look at you go!',
  'Go you!',
  "That's my human!",
  'Big frog energy',
  "You're a gem!",
];

const NAMED_COMPLIMENT_TITLES = ['Nice one, {name}!', 'Go, {name}, go!', 'Proud of you, {name}!'];

const DAY_CLEARED_TITLES = [
  'List cleared!',
  'Clean sweep!',
  "That's a wrap!",
  'All done!',
  'Nothing left!',
  'Day: handled',
  'Ta-da!',
  'The list surrendered',
  'Everything. Done.',
  'Wow, all of it!',
  'Mic drop',
  'Not one left!',
];

const STREAK_TITLES = [
  'On a roll!',
  "Streak's alive!",
  'Look at you go!',
  'Unstoppable!',
  'Consistency!',
  'Again! Again!',
  "Can't stop you",
  'Like clockwork',
  'Keep it rolling',
  "You're on fire!",
];

const COUNT_MILESTONE_TITLES = ['Milestone!', 'Look at that!', 'Big moment!', 'Ooh, a milestone'];

const TAG_CLEARED_TITLES = ['Swept clean!', 'All wrapped up!', 'Tidy!', 'Done and dusted!', 'Nice sweep!'];

const FIRST_EVER_TITLES = ['A first!', 'Day one!', 'Brand new!', 'First of many?', 'Ooh, a first!', 'And so it begins'];

const COMEBACK_TITLES = ['Back on it!', 'Welcome back!', 'There it is!', "And we're back!", 'Hello again!'];

const EARLY_TITLES = ['Early frog!', 'Rise and ribbit!', 'Up and at it!'];

const LATE_TITLES = ['Late-night win!', 'Night frog!', 'Still going!'];

const FIRST_OF_DAY_TITLES = ["And we're off!", 'First one down!', 'There we go!', 'Warmed up!', 'Off to a start!'];

const DAY_CLEARED_DETAILS_MANY = ['All {n} done for today', 'Every task today, done', '{n} for {n} today!', "Nothing left on today's list"];
const DAY_CLEARED_DETAILS_ONE = ["That's everything for today", 'Your whole list, done'];
const FIRST_EVER_DETAILS = ['First time completing this!', 'First time doing this one!', 'First time checking this off!'];
const COMEBACK_DETAILS = ['Picked right back up', 'Fresh run starts now', 'Back in the groove'];
const COUNT_DETAILS = ['{n} times and counting', 'Done {n} times now', 'Your {nth} time!'];
const TAG_DETAILS = ['All {tag} tasks done today', 'Every {tag} task, done', '{tag}: done for today'];
const ONE_LEFT_DETAILS = ['Just 1 more for today', '1 left for today', "One more and the day's clear", 'Only 1 to go today'];
const FOCUS_DETAILS = ['After {m} min of focus', '{m} focused minutes, then done', 'Focused {m} min on this one'];
const STEPS_DETAILS = ['All {n} steps checked off', 'Every step, done', '{n} for {n} steps'];
const EARLY_DETAILS = ['Done before 8am', 'Early frog gets the fly', 'Done before most frogs wake up'];
const LATE_DETAILS = ['Done after 10pm. Rest up!', 'A late-night finish', 'Night owl mode: done'];
const FIRST_OF_DAY_DETAILS = ['First task of the day, done', "Today's first one, done", "Today's first check-off", 'The day is officially started'];
const PROGRESS_DETAILS = [
  '{n} done today',
  "That's {n} today",
  '{n} down today',
  '{n} checked off today',
  "Today's count: {n}",
  '{n} and counting today',
];

const STREAK_DETAILS: Record<'day' | 'month' | 'run', string[]> = {
  day: ['{n} days in a row!', 'A {n}-day streak!', '{n} days straight!', 'Day {n} of your streak!'],
  month: ['{n} months in a row!', 'A {n}-month streak!'],
  run: ['{n} in a row!', '{n} times in a row!', '{n} in a row now!', 'Streak: {n}!'],
};

const COUNT_MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 365, 500, 750, 1000];
const EXTRA_STREAK_MILESTONES = [100, 365];
const COMPLIMENT_CHANCE = 0.3;
const MIN_FOCUS_MINUTES = 5;
const MIN_STEPS = 3;

const RECENT_KEY = 'frog-done-toast:recent';
const RECENT_LIMIT = 40;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(lines: string[]) {
  const latestFirst: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (latestFirst.indexOf(lines[i]) === -1) latestFirst.push(lines[i]);
  }
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(latestFirst.slice(0, RECENT_LIMIT).reverse()));
  } catch {}
}

function pick(pool: string[], recent: string[]): string {
  const fresh = pool.filter((line) => recent.indexOf(line) === -1);
  if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
  let oldest = pool[0];
  let oldestAt = Infinity;
  for (const line of pool) {
    const at = recent.lastIndexOf(line);
    if (at < oldestAt) {
      oldestAt = at;
      oldest = line;
    }
  }
  return oldest;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values && key !== 'tag' ? String(values[key]) : match,
  );
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function streakUnit(repeatMode?: string): 'day' | 'month' | 'run' {
  if (repeatMode === 'daily') return 'day';
  if (repeatMode === 'monthly') return 'month';
  return 'run';
}

function isStreakMilestone(streak: number): boolean {
  return milestoneForStreak(streak) !== null || EXTRA_STREAK_MILESTONES.indexOf(streak) !== -1;
}

function findTag(tags: TagLike[], key: string): TagLike | undefined {
  return tags.find((tag) => tag.id === key) ?? tags.find((tag) => tag.name === key);
}

function clearedTag(task: DoneTaskLike, dayTasks: DoneTaskLike[], tags: TagLike[]): TagLike | null {
  let best: { tag: TagLike; count: number } | null = null;
  for (const key of task.tags ?? []) {
    const tag = findTag(tags, key);
    if (!tag) continue;
    const withTag = dayTasks.filter((t) =>
      (t.tags ?? []).some((k) => k === tag.id || k === tag.name),
    );
    if (withTag.length < 2 || withTag.some((t) => !t.completed)) continue;
    if (!best || withTag.length > best.count) best = { tag, count: withTag.length };
  }
  return best?.tag ?? null;
}

export function friendlyFirstName(name?: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  if (!first || first.length > 12 || /^anonymous$/i.test(first)) return null;
  return first;
}

export function buildDoneMoment({
  task,
  dayTasks,
  tags,
  todayKey,
  now,
  name,
}: {
  task: DoneTaskLike;
  dayTasks: DoneTaskLike[];
  tags: TagLike[];
  todayKey: string;
  now: Date;
  name?: string | null;
}): DoneMoment {
  const recent = readRecent();
  const used: string[] = [];
  const choose = (pool: string[]) => {
    const line = pick(pool, recent.concat(used));
    used.push(line);
    return line;
  };

  const total = dayTasks.length;
  const done = dayTasks.filter((t) => t.completed).length;
  const left = total - done;

  const repeating = task.type === 'weekly';
  const streak = repeating ? Math.max(0, task.streak ?? 0) : 0;
  const history = task.completedDates ?? [];
  const timesDone = repeating
    ? history.indexOf(todayKey) === -1
      ? history.length + 1
      : history.length
    : 0;
  const unit = streakUnit(task.repeatMode);
  const tag = clearedTag(task, dayTasks, tags);
  const session = task.frogodoroSession;
  const focusMinutes =
    session && session.date === todayKey ? Math.round(session.focusTime / 60) : 0;
  const steps = task.checklist ?? [];
  const hour = now.getHours();

  const generalTitle = () => {
    if (Math.random() < COMPLIMENT_CHANCE) {
      return name
        ? fill(choose(NAMED_COMPLIMENT_TITLES.concat(COMPLIMENT_TITLES)), { name })
        : choose(COMPLIMENT_TITLES);
    }
    return choose(GENERAL_TITLES);
  };

  let moment: Omit<DoneMoment, 'id'>;

  if (total > 0 && left === 0) {
    moment = {
      kind: 'day_cleared',
      title: choose(DAY_CLEARED_TITLES),
      detail: fill(choose(total > 1 ? DAY_CLEARED_DETAILS_MANY : DAY_CLEARED_DETAILS_ONE), { n: total }),
      badge: 'party',
      confetti: 'shower',
    };
  } else if (streak >= 3 && isStreakMilestone(streak)) {
    moment = {
      kind: 'streak_milestone',
      title: choose(STREAK_TITLES),
      detail: fill(choose(STREAK_DETAILS[unit]), { n: streak }),
      badge: 'flame',
      confetti: 'burst',
    };
  } else if (COUNT_MILESTONES.indexOf(timesDone) !== -1) {
    moment = {
      kind: 'count_milestone',
      title: choose(COUNT_MILESTONE_TITLES),
      detail: fill(choose(COUNT_DETAILS), { n: timesDone, nth: ordinal(timesDone) }),
      badge: 'star',
      confetti: 'burst',
    };
  } else if (tag) {
    moment = {
      kind: 'tag_cleared',
      title: choose(TAG_CLEARED_TITLES),
      detail: choose(TAG_DETAILS),
      tag: { name: tag.name, color: tag.color },
      badge: 'tag',
      confetti: 'burst',
    };
  } else if (repeating && timesDone === 1 && streak <= 1) {
    moment = {
      kind: 'first_ever',
      title: choose(FIRST_EVER_TITLES),
      detail: choose(FIRST_EVER_DETAILS),
      badge: 'sparkle',
      confetti: 'burst',
    };
  } else if (repeating && timesDone >= 2 && streak === 1) {
    moment = {
      kind: 'comeback',
      title: choose(COMEBACK_TITLES),
      detail: choose(COMEBACK_DETAILS),
      badge: 'heart',
    };
  } else if (streak >= 2) {
    moment = {
      kind: 'streak',
      title: choose(STREAK_TITLES),
      detail: fill(choose(STREAK_DETAILS[unit]), { n: streak }),
      badge: 'flame',
    };
  } else if (total >= 2 && left === 1) {
    moment = { kind: 'one_left', title: generalTitle(), detail: choose(ONE_LEFT_DETAILS) };
  } else if (focusMinutes >= MIN_FOCUS_MINUTES) {
    moment = {
      kind: 'focus',
      title: generalTitle(),
      detail: fill(choose(FOCUS_DETAILS), { m: focusMinutes }),
    };
  } else if (steps.length >= MIN_STEPS && steps.every((step) => step.done)) {
    moment = {
      kind: 'steps',
      title: generalTitle(),
      detail: fill(choose(STEPS_DETAILS), { n: steps.length }),
    };
  } else if (hour < 8 && done <= 2) {
    moment = { kind: 'early', title: choose(EARLY_TITLES), detail: choose(EARLY_DETAILS) };
  } else if (hour >= 22) {
    moment = { kind: 'late', title: choose(LATE_TITLES), detail: choose(LATE_DETAILS) };
  } else if (done === 1) {
    moment = {
      kind: 'first_of_day',
      title: choose(FIRST_OF_DAY_TITLES),
      detail: choose(FIRST_OF_DAY_DETAILS),
    };
  } else {
    moment = {
      kind: 'progress',
      title: generalTitle(),
      detail: fill(choose(PROGRESS_DETAILS), { n: done }),
    };
  }

  writeRecent(recent.concat(used));
  return { ...moment, id: `${task.id}:${now.getTime()}` };
}
