export const pad = (n: number) => String(n).padStart(2, '0');

export const nowHm = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ymdLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseYmdLocal(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatTimeDisplay(t: string) {
  if (!t) return '--:--';
  const [hh, mm] = t.split(':').map(Number);
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${pad(mm)} ${suffix}`;
}

export const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Friendly label for a repeat end date, e.g. "Jun 11, 2026". */
export function formatEndDateLabel(value: string) {
  return parseYmdLocal(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

import { apiDayFromDisplay, type ApiDay, type DisplayDay } from '@/components/board/helpers';

export type RepeatMode =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekend'
  | 'weekly'
  | 'monthly'
  | 'custom';

export type RepeatFreq = 'daily' | 'weekly' | 'monthly';

/** A custom recurrence rule (interval-based, RRULE-like). */
export type RepeatRule = {
  freq: RepeatFreq;
  /** Repeat every N days/weeks/months. */
  interval: number;
  /** Weekly: weekdays (0=Sun..6=Sat) the task lands on. */
  byWeekday?: number[];
  /** Monthly: days-of-month (1..31) the task lands on. */
  byMonthday?: number[];
};

const ALL_DISPLAY_DAYS: DisplayDay[] = [0, 1, 2, 3, 4, 5, 6];

export function allDisplayDays(): DisplayDay[] {
  return [...ALL_DISPLAY_DAYS];
}

export function weekdayDisplayDays(
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>,
): DisplayDay[] {
  return ALL_DISPLAY_DAYS.filter((d) => {
    const api = apiDayFromDisplay(d, daysOrder);
    return api >= 1 && api <= 5;
  });
}

export function weekendDisplayDays(
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>,
): DisplayDay[] {
  return ALL_DISPLAY_DAYS.filter((d) => {
    const api = apiDayFromDisplay(d, daysOrder);
    return api === 0 || api === 6;
  });
}

export function repeatModeFor(
  pickedDays: ReadonlyArray<DisplayDay>,
  repeat: 'this-week' | 'weekly',
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>,
): RepeatMode {
  if (repeat !== 'weekly') return 'none';
  const real = pickedDays.filter((d) => d !== 7);
  if (real.length >= 7) return 'daily';
  const apiDays = real.map((d) => apiDayFromDisplay(d, daysOrder));
  const set = new Set(apiDays);
  const isWeekdays =
    apiDays.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d as ApiDay));
  if (isWeekdays) return 'weekdays';
  const isWeekend =
    apiDays.length === 2 && set.has(0 as ApiDay) && set.has(6 as ApiDay);
  if (isWeekend) return 'weekend';
  return 'weekly';
}

/** Ordinal suffix, e.g. 1 -> "1st", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Day-of-month (1..31) from a YYYY-MM-DD string. */
export function dayOfMonthFromYmd(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

/** "Every month on the 11th" label anchored to a YYYY-MM-DD date. */
export function monthlyRepeatLabel(ymd: string): string {
  return `Every month on the ${ordinal(dayOfMonthFromYmd(ymd))}`;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Short human summary of a custom recurrence rule, e.g. "Every 2 weeks on Mon, Thu". */
export function customRepeatLabel(rule: RepeatRule): string {
  const n = rule.interval;
  if (rule.freq === 'daily') {
    return n === 1 ? 'Every day' : `Every ${n} days`;
  }
  if (rule.freq === 'weekly') {
    const base = n === 1 ? 'Every week' : `Every ${n} weeks`;
    const days = (rule.byWeekday ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => SHORT_DAYS[d])
      .join(', ');
    return days ? `${base} on ${days}` : base;
  }
  const base = n === 1 ? 'Every month' : `Every ${n} months`;
  const dom = (rule.byMonthday ?? [])
    .slice()
    .sort((a, b) => a - b)
    .map((d) => ordinal(d))
    .join(', ');
  return dom ? `${base} on the ${dom}` : base;
}

const NL_DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export interface ParsedNaturalInput {
  dateKey?: string;
  startTime?: string;
  cleaned: string;
}

/** Detect a date/time phrase in free text, e.g. "call mom tomorrow at 3pm". */
export function parseNaturalInput(text: string): ParsedNaturalInput | null {
  let working = text;
  let dateKey: string | undefined;
  let startTime: string | undefined;

  const cut = (index: number, length: number) => {
    working = working.slice(0, index) + working.slice(index + length);
  };

  const dateMatch = working.match(
    /(?:^|\s)(today|tonight|tomorrow|tmrw|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?=\s|$)/i,
  );
  if (dateMatch && dateMatch.index !== undefined) {
    const word = dateMatch[1].toLowerCase();
    const d = new Date();
    if (word === 'tomorrow' || word === 'tmrw') {
      d.setDate(d.getDate() + 1);
    } else if (word !== 'today' && word !== 'tonight') {
      const idx = NL_DAY_NAMES.indexOf(word);
      const delta = (idx - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
    }
    dateKey = ymdLocal(d);
    cut(dateMatch.index, dateMatch[0].length);
  }

  const ampm = working.match(
    /(?:^|\s)(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=\s|$)/i,
  );
  const colon24 = working.match(
    /(?:^|\s)(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/,
  );
  const namedTime = working.match(/(?:^|\s)(noon|midday|midnight)(?=\s|$)/i);
  const bareAt = working.match(/(?:^|\s)at\s+(\d{1,2})(?=\s|$)/);

  if (ampm && ampm.index !== undefined) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === 'pm') h += 12;
    if (h < 24) {
      startTime = `${pad(h)}:${ampm[2] ?? '00'}`;
      cut(ampm.index, ampm[0].length);
    }
  } else if (colon24 && colon24.index !== undefined) {
    startTime = `${pad(Number(colon24[1]))}:${colon24[2]}`;
    cut(colon24.index, colon24[0].length);
  } else if (namedTime && namedTime.index !== undefined) {
    startTime = namedTime[1].toLowerCase() === 'midnight' ? '00:00' : '12:00';
    cut(namedTime.index, namedTime[0].length);
  } else if (bareAt && bareAt.index !== undefined) {
    const raw = Number(bareAt[1]);
    if (raw >= 1 && raw <= 23) {
      const h = raw <= 7 ? raw + 12 : raw;
      startTime = `${pad(h)}:00`;
      cut(bareAt.index, bareAt[0].length);
    }
  }

  if (!dateKey && !startTime) return null;

  const cleaned = working
    .replace(/\s+(at|on|by)\s*$/i, '')
    .replace(/^\s*(at|on|by)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned) return null;

  return { dateKey, startTime, cleaned };
}

const hasToken = (haystack: string, needle: string) =>
  new RegExp(
    `(?:^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z])`,
  ).test(haystack);

const SUGGEST_BUCKETS: {
  id: string;
  nameAliases: string[];
  textKeywords: string[];
}[] = [
  {
    id: 'fitness',
    nameAliases: [
      'fitness',
      'sport',
      'sports',
      'workout',
      'workouts',
      'gym',
      'exercise',
      'training',
      'health',
      'active',
      'run',
      'running',
      'move',
    ],
    textKeywords: [
      'gym',
      'workout',
      'work out',
      'run',
      'running',
      'jog',
      'jogging',
      'sprint',
      'walk',
      'walking',
      'steps',
      'swim',
      'swimming',
      'yoga',
      'pilates',
      'stretch',
      'stretching',
      'train',
      'training',
      'exercise',
      'lift',
      'lifting',
      'weights',
      'deadlift',
      'squat',
      'squats',
      'push-ups',
      'pushups',
      'pull-ups',
      'pullups',
      'abs',
      'cardio',
      'crossfit',
      'hiit',
      'bike',
      'cycling',
      'spin class',
      'treadmill',
      'football',
      'soccer',
      'basketball',
      'tennis',
      'padel',
      'climb',
      'climbing',
      'bouldering',
      'hike',
      'hiking',
      'marathon',
      '5k',
      '10k',
      'protein',
    ],
  },
  {
    id: 'mindfulness',
    nameAliases: [
      'mindfulness',
      'mindful',
      'self care',
      'self-care',
      'selfcare',
      'meditation',
      'wellness',
      'journal',
      'calm',
      'reset',
      'zen',
      'mental health',
      'sleep',
      'rest',
      'recharge',
    ],
    textKeywords: [
      'meditate',
      'meditation',
      'journal',
      'journaling',
      'breathe',
      'breathing',
      'breathwork',
      'gratitude',
      'reflect',
      'reflection',
      'mindful',
      'mindfulness',
      'self-care',
      'self care',
      'pray',
      'prayer',
      'therapy',
      'therapist',
      'digital detox',
      'no phone',
      'no screens',
      'unwind',
      'wind down',
      'wind-down',
      'relax',
      'bed early',
      'bedtime',
      'sleep early',
      'night routine',
      'skincare',
      'affirmations',
    ],
  },
  {
    id: 'relationships',
    nameAliases: [
      'relationships',
      'relationship',
      'family',
      'friends',
      'social',
      'love',
      'connect',
      'people',
      'kids',
    ],
    textKeywords: [
      'mom',
      'dad',
      'mother',
      'father',
      'grandma',
      'grandpa',
      'grandmother',
      'grandfather',
      'sister',
      'brother',
      'aunt',
      'uncle',
      'cousin',
      'in-laws',
      'family',
      'friend',
      'friends',
      'kids',
      'son',
      'daughter',
      'wife',
      'husband',
      'partner',
      'girlfriend',
      'boyfriend',
      'date night',
      'anniversary',
      'birthday',
      'playdate',
      'wedding',
      'catch up',
      'hang out',
      'text back',
      'reply to',
    ],
  },
  {
    id: 'cooking',
    nameAliases: [
      'cooking',
      'cook',
      'kitchen',
      'food',
      'meals',
      'meal prep',
      'baking',
      'nutrition',
      'eat',
      'eating',
      'chef',
    ],
    textKeywords: [
      'cook',
      'cooking',
      'bake',
      'baking',
      'recipe',
      'recipes',
      'meal prep',
      'meal-prep',
      'marinate',
      'dough',
      'sourdough',
      'smoothie',
      'simmer',
      'roast',
      'grill',
      'air fryer',
      'oven',
      'pasta',
      'soup',
      'salad',
      'make dinner',
      'make lunch',
      'make breakfast',
      'prep dinner',
      'prep lunch',
    ],
  },
  {
    id: 'home',
    nameAliases: [
      'home',
      'house',
      'chores',
      'cleaning',
      'household',
      'tidy',
      'apartment',
      'organizing',
    ],
    textKeywords: [
      'clean',
      'cleaning',
      'laundry',
      'dishes',
      'dishwasher',
      'vacuum',
      'hoover',
      'tidy',
      'tidying',
      'organize',
      'declutter',
      'trash',
      'garbage',
      'recycling',
      'groceries',
      'grocery',
      'mop',
      'sweep',
      'iron',
      'ironing',
      'fold clothes',
      'fold laundry',
      'sheets',
      'bed sheets',
      'water plants',
      'plants',
      'garden',
      'gardening',
      'mow',
      'lawn',
      'fix',
      'repair',
      'diy',
      'ikea',
      'furniture',
      'kitchen',
      'bathroom',
      'closet',
    ],
  },
  {
    id: 'learning',
    nameAliases: [
      'learning',
      'learn',
      'study',
      'school',
      'education',
      'reading',
      'books',
      'courses',
      'language',
      'uni',
      'college',
      'curious',
    ],
    textKeywords: [
      'study',
      'studying',
      'learn',
      'learning',
      'read',
      'reading',
      'book',
      'chapter',
      'course',
      'class',
      'lecture',
      'homework',
      'essay',
      'exam',
      'quiz',
      'revise',
      'revision',
      'flashcards',
      'anki',
      'duolingo',
      'vocabulary',
      'tutorial',
      'research',
      'thesis',
      'documentary',
      'podcast',
    ],
  },
  {
    id: 'creativity',
    nameAliases: [
      'creativity',
      'creative',
      'art',
      'arts',
      'drawing',
      'design',
      'craft',
      'crafts',
      'writing',
      'maker',
      'make',
    ],
    textKeywords: [
      'draw',
      'drawing',
      'paint',
      'painting',
      'sketch',
      'sketching',
      'doodle',
      'illustrate',
      'illustration',
      'design',
      'craft',
      'crafts',
      'crochet',
      'knit',
      'knitting',
      'sew',
      'sewing',
      'embroider',
      'pottery',
      'ceramics',
      'sculpt',
      'collage',
      'scrapbook',
      'animate',
      'animation',
      'compose',
      'songwriting',
      'write story',
      'write poem',
      'novel',
      'poem',
      'blog',
      'edit video',
      'video edit',
      'photoshop',
      'procreate',
    ],
  },
  {
    id: 'hobbies',
    nameAliases: [
      'hobbies',
      'hobby',
      'fun',
      'play',
      'games',
      'gaming',
      'music',
      'guitar',
      'photography',
      'leisure',
    ],
    textKeywords: [
      'guitar',
      'piano',
      'ukulele',
      'violin',
      'drums',
      'instrument',
      'chess',
      'puzzle',
      'lego',
      'gaming',
      'video game',
      'video games',
      'board game',
      'board games',
      'dnd',
      'fishing',
      'camping',
      'photography',
      'photo walk',
      'birdwatching',
      'skateboard',
      'surf',
      'surfing',
      'ski',
      'skiing',
      'model kit',
      'drone',
      'collection',
    ],
  },
  {
    id: 'productivity',
    nameAliases: [
      'productivity',
      'productivite',
      'productive',
      'work',
      'job',
      'office',
      'career',
      'business',
      'focus',
      'finance',
      'finances',
      'money',
      'budget',
      'bills',
      'admin',
      'get things done',
      'gtd',
    ],
    textKeywords: [
      'work',
      'wfh',
      'email',
      'emails',
      'inbox',
      'meeting',
      'meetings',
      'deadline',
      'report',
      'presentation',
      'slides',
      'project',
      'client',
      'standup',
      'interview',
      'resume',
      'cv',
      'deploy',
      'invoice',
      'invoices',
      'budget',
      'taxes',
      'tax',
      'bill',
      'bills',
      'pay rent',
      'bank',
      'insurance',
      'errand',
      'errands',
      'appointment',
      'paperwork',
      'print',
      'scan',
      'submit',
      'apply',
      'application',
      'follow up',
      'followup',
      'timesheet',
      'expense',
      'expenses',
      'todo list',
      'plan week',
      'plan the week',
    ],
  },
];

/** Semantic buckets the task text matches, e.g. "go for a run" → ['sport']. */
export function matchSuggestionBuckets(text: string): string[] {
  const lower = text.toLowerCase();
  return SUGGEST_BUCKETS.filter((b) =>
    b.textKeywords.some((kw) => hasToken(lower, kw)),
  ).map((b) => b.id);
}

/** Does a tag or focus-area NAME read like it belongs to this bucket? */
export function nameMatchesBucket(bucketId: string, name: string): boolean {
  const bucket = SUGGEST_BUCKETS.find((b) => b.id === bucketId);
  if (!bucket) return false;
  const lower = name.toLowerCase();
  return bucket.nameAliases.some((alias) => hasToken(lower, alias));
}
