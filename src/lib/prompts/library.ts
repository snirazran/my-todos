import QuestPromptModel, { type QuestPromptDoc } from '@/lib/models/QuestPrompt';
import PromptAnswerModel from '@/lib/models/PromptAnswer';
import type { QuestPromptKind, QuestPromptOption } from '@/lib/quests/types';
import { createSeededRandom } from '@/lib/quests/random';

export const PROMPT_CATEGORIES = [
  { id: 'gratitude', label: 'Gratitude' },
  { id: 'joy', label: 'Joy' },
  { id: 'growth', label: 'Growth' },
  { id: 'reflection', label: 'Reflection' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'fun', label: 'Just for fun' },
  { id: 'planning', label: 'Planning' },
] as const;

export const PROMPT_KINDS: { id: QuestPromptKind; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'poll', label: 'Poll' },
  { id: 'this_or_that', label: 'This or that' },
  { id: 'checkin', label: 'Check-in' },
];

export const CHECKIN_OPTIONS: QuestPromptOption[] = [
  { id: '1', emoji: '😣', label: 'Rough' },
  { id: '2', emoji: '😕', label: 'Meh' },
  { id: '3', emoji: '😐', label: 'Okay' },
  { id: '4', emoji: '🙂', label: 'Good' },
  { id: '5', emoji: '😄', label: 'Great' },
];

export const PROMPT_RECENT_WINDOW_DAYS = 60;

export type PromptLibraryEntry = Pick<
  QuestPromptDoc,
  | 'promptId'
  | 'kind'
  | 'question'
  | 'placeholder'
  | 'options'
  | 'category'
  | 'weight'
  | 'cooldownDays'
  | 'dateKey'
>;

export type RecentPromptAnswer = {
  promptId: string;
  dayKey: string;
  category: string;
};

const opt = (id: string, emoji: string, label: string): QuestPromptOption => ({
  id,
  emoji,
  label,
});

type Seed = Omit<PromptLibraryEntry, 'weight' | 'cooldownDays' | 'dateKey' | 'options'> & {
  options?: QuestPromptOption[];
};

const journal = (id: string, category: string, question: string, placeholder?: string): Seed => ({
  promptId: `seed-${id}`,
  kind: 'journal',
  category,
  question,
  placeholder,
});

const poll = (id: string, category: string, question: string, options: QuestPromptOption[]): Seed => ({
  promptId: `seed-${id}`,
  kind: options.length === 2 ? 'this_or_that' : 'poll',
  category,
  question,
  options,
});

const checkin = (id: string, question: string): Seed => ({
  promptId: `seed-${id}`,
  kind: 'checkin',
  category: 'wellbeing',
  question,
  options: CHECKIN_OPTIONS,
});

export const SEED_PROMPTS: Seed[] = [
  journal('grateful-today', 'gratitude', 'What are you grateful for today?', 'Something big or tiny…'),
  journal('grateful-person', 'gratitude', 'Who made your life a little easier lately?', 'A friend, a stranger, anyone…'),
  journal('grateful-small', 'gratitude', 'What small thing went right today?'),
  journal('grateful-place', 'gratitude', 'What place makes you feel at home?'),
  journal('grateful-body', 'gratitude', 'What is something your body did for you today?'),
  journal('grateful-thing', 'gratitude', 'What do you own that makes every day a bit better?'),
  journal('joy-smile', 'joy', 'What made you smile today?'),
  journal('joy-laugh', 'joy', 'When did you last laugh really hard?'),
  journal('joy-forward', 'joy', 'What are you looking forward to this week?'),
  journal('joy-comfort', 'joy', 'What is your favorite way to slow down?'),
  journal('joy-song', 'joy', 'What song has been stuck in your head lately?'),
  journal('joy-treat', 'joy', 'How could you treat yourself this week?'),
  journal('growth-overcome', 'growth', 'What did you overcome lately?'),
  journal('growth-proud', 'growth', 'What are you proud of this week?'),
  journal('growth-learned', 'growth', 'What is something new you learned recently?'),
  journal('growth-brave', 'growth', 'When were you braver than you expected?'),
  journal('growth-better', 'growth', 'What is one thing you do better than a year ago?'),
  journal('growth-kind', 'growth', 'What kind thing did you do for someone?'),
  journal('reflect-word', 'reflection', 'What word sums up your day?'),
  journal('reflect-advice', 'reflection', 'What advice would you give yourself from last month?'),
  journal('reflect-energy', 'reflection', 'What gave you energy today, and what drained it?'),
  journal('reflect-change', 'reflection', 'What is one thing you would like to do differently tomorrow?'),
  journal('reflect-letgo', 'reflection', 'What is something you are ready to let go of?'),
  journal('reflect-today', 'reflection', 'Describe today in one sentence.'),
  journal('well-rest', 'wellbeing', 'What helps you rest when your mind is busy?'),
  journal('well-need', 'wellbeing', 'What do you need more of right now?'),
  journal('well-calm', 'wellbeing', 'Where do you feel most calm?'),
  journal('plan-one', 'planning', 'What is the one thing that would make tomorrow a good day?'),
  journal('plan-avoid', 'planning', 'What task have you been putting off, and what is the first tiny step?'),
  journal('plan-week', 'planning', 'What would make this week feel like a win?'),
  poll('poll-breakfast', 'fun', 'What is the best breakfast?', [
    opt('a', '🥞', 'Pancakes'),
    opt('b', '🥣', 'Cereal'),
    opt('c', '🍳', 'Eggs'),
    opt('d', '☕', 'Just coffee'),
  ]),
  poll('poll-season', 'fun', 'Which season is the best?', [
    opt('a', '🌸', 'Spring'),
    opt('b', '☀️', 'Summer'),
    opt('c', '🍂', 'Autumn'),
    opt('d', '❄️', 'Winter'),
  ]),
  poll('poll-focus-time', 'planning', 'When do you get the most done?', [
    opt('a', '🌅', 'Early morning'),
    opt('b', '🌞', 'Midday'),
    opt('c', '🌇', 'Evening'),
    opt('d', '🌙', 'Late night'),
  ]),
  poll('poll-recharge', 'wellbeing', 'How do you recharge best?', [
    opt('a', '😴', 'A nap'),
    opt('b', '🚶', 'A walk'),
    opt('c', '📺', 'A show'),
    opt('d', '👯', 'Friends'),
  ]),
  poll('poll-pet', 'fun', 'Which pet would you pick?', [
    opt('a', '🐶', 'Dog'),
    opt('b', '🐱', 'Cat'),
    opt('c', '🐸', 'Frog, obviously'),
    opt('d', '🐠', 'Fish'),
  ]),
  poll('poll-snack', 'fun', 'Pick a study snack', [
    opt('a', '🍿', 'Popcorn'),
    opt('b', '🍫', 'Chocolate'),
    opt('c', '🍎', 'Fruit'),
    opt('d', '🥨', 'Pretzels'),
  ]),
  poll('poll-music', 'fun', 'What do you listen to while you work?', [
    opt('a', '🎧', 'Music'),
    opt('b', '🎙️', 'Podcasts'),
    opt('c', '🌧️', 'Rain sounds'),
    opt('d', '🤫', 'Silence'),
  ]),
  poll('poll-list', 'planning', 'How do you pick your next task?', [
    opt('a', '🐸', 'Hardest first'),
    opt('b', '🍰', 'Easiest first'),
    opt('c', '⏰', 'Whatever is due'),
    opt('d', '🎲', 'Vibes'),
  ]),
  poll('poll-superpower', 'fun', 'Pick a superpower', [
    opt('a', '⏸️', 'Pause time'),
    opt('b', '🕊️', 'Fly'),
    opt('c', '🧠', 'Read minds'),
    opt('d', '🌀', 'Teleport'),
  ]),
  poll('poll-weekend', 'fun', 'Your ideal weekend?', [
    opt('a', '🛋️', 'Cozy at home'),
    opt('b', '🏞️', 'Outdoors'),
    opt('c', '🎉', 'Out with friends'),
    opt('d', '✈️', 'A trip'),
  ]),
  poll('poll-stress', 'wellbeing', 'What helps most when you are stressed?', [
    opt('a', '📝', 'Writing a list'),
    opt('b', '🫁', 'Deep breaths'),
    opt('c', '🗣️', 'Talking it out'),
    opt('d', '🏃', 'Moving'),
  ]),
  poll('poll-reward', 'planning', 'Best reward after a long task?', [
    opt('a', '🍦', 'A treat'),
    opt('b', '🎮', 'A game'),
    opt('c', '🛁', 'A long bath'),
    opt('d', '😴', 'A nap'),
  ]),
  poll('tot-tea', 'fun', 'Coffee or tea?', [opt('a', '☕', 'Coffee'), opt('b', '🍵', 'Tea')]),
  poll('tot-beach', 'fun', 'Beach or mountains?', [opt('a', '🏖️', 'Beach'), opt('b', '⛰️', 'Mountains')]),
  poll('tot-morning', 'fun', 'Early bird or night owl?', [opt('a', '🐦', 'Early bird'), opt('b', '🦉', 'Night owl')]),
  poll('tot-list', 'planning', 'Paper list or app list?', [opt('a', '📒', 'Paper'), opt('b', '📱', 'App')]),
  poll('tot-sweet', 'fun', 'Sweet or salty?', [opt('a', '🍬', 'Sweet'), opt('b', '🥨', 'Salty')]),
  poll('tot-books', 'fun', 'Books or movies?', [opt('a', '📚', 'Books'), opt('b', '🎬', 'Movies')]),
  poll('tot-rain', 'fun', 'Sunny day or rainy day?', [opt('a', '☀️', 'Sunny'), opt('b', '🌧️', 'Rainy')]),
  poll('tot-plan', 'planning', 'Plan everything or go with the flow?', [opt('a', '🗓️', 'Plan it'), opt('b', '🌊', 'Go with it')]),
  poll('tot-frog', 'fun', 'Lily pad nap or pond swim?', [opt('a', '🪷', 'Lily pad nap'), opt('b', '💦', 'Pond swim')]),
  poll('tot-cats', 'fun', 'Cats or dogs?', [opt('a', '🐱', 'Cats'), opt('b', '🐶', 'Dogs')]),
  checkin('checkin-mood', 'How are you feeling today?'),
  checkin('checkin-energy', 'How is your energy right now?'),
  checkin('checkin-sleep', 'How well did you sleep?'),
  checkin('checkin-stress', 'How calm do you feel today?'),
  checkin('checkin-focus', 'How focused have you felt today?'),
  checkin('checkin-week', 'How is your week going so far?'),
  checkin('checkin-social', 'How connected do you feel to people today?'),
];

export async function ensureSeedPrompts(): Promise<void> {
  const existing = await QuestPromptModel.estimatedDocumentCount();
  if (existing > 0) return;
  await QuestPromptModel.insertMany(
    SEED_PROMPTS.map((seed) => ({
      ...seed,
      options: seed.options ?? [],
      weight: 1,
      cooldownDays: 30,
      dateKey: null,
      isActive: true,
    })),
    { ordered: false },
  ).catch(() => {});
}

export async function loadPromptLibrary(): Promise<PromptLibraryEntry[]> {
  await ensureSeedPrompts();
  return QuestPromptModel.find(
    { isActive: true },
    {
      promptId: 1,
      kind: 1,
      question: 1,
      placeholder: 1,
      options: 1,
      category: 1,
      weight: 1,
      cooldownDays: 1,
      dateKey: 1,
    },
  ).lean<PromptLibraryEntry[]>();
}

export async function loadRecentPromptAnswers(
  userId: string,
  sinceDayKey: string,
): Promise<RecentPromptAnswer[]> {
  return PromptAnswerModel.find(
    { userId, dayKey: { $gte: sinceDayKey } },
    { promptId: 1, dayKey: 1, category: 1 },
  )
    .sort({ dayKey: -1 })
    .lean<RecentPromptAnswer[]>();
}

function daysBetween(fromKey: string, toKey: string) {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Infinity;
  return Math.round((to - from) / 86_400_000);
}

export function pickPrompt(args: {
  prompts: PromptLibraryEntry[];
  categories?: string[];
  kinds?: QuestPromptKind[];
  recent: RecentPromptAnswer[];
  todayKey: string;
  seed: string;
  excludeIds?: string[];
}): PromptLibraryEntry | null {
  const exclude = new Set(args.excludeIds ?? []);
  const categories = args.categories?.length ? new Set(args.categories) : null;
  const kinds = args.kinds?.length ? new Set(args.kinds) : null;
  const matching = args.prompts.filter(
    (prompt) =>
      !exclude.has(prompt.promptId) &&
      (!categories || categories.has(prompt.category)) &&
      (!kinds || kinds.has(prompt.kind)) &&
      (prompt.kind === 'journal' || (prompt.options?.length ?? 0) >= 2),
  );
  if (matching.length === 0) return null;

  const pinned = matching.filter((prompt) => prompt.dateKey === args.todayKey);
  if (pinned.length > 0) {
    return pinned[Math.floor(createSeededRandom(`${args.seed}:pinned`)() * pinned.length)];
  }

  const lastAnswered = new Map<string, string>();
  for (const answer of args.recent) {
    if (!lastAnswered.has(answer.promptId)) lastAnswered.set(answer.promptId, answer.dayKey);
  }
  const undated = matching.filter((prompt) => !prompt.dateKey);
  const fresh = undated.filter((prompt) => {
    const last = lastAnswered.get(prompt.promptId);
    if (!last) return true;
    return daysBetween(last, args.todayKey) >= Math.max(0, prompt.cooldownDays ?? 30);
  });
  const lastCategory = args.recent[0]?.category;
  const varied = fresh.filter((prompt) => prompt.category !== lastCategory);
  const pool = varied.length > 0 ? varied : fresh.length > 0 ? fresh : undated;
  if (pool.length === 0) return null;

  const total = pool.reduce((sum, prompt) => sum + Math.max(1, prompt.weight ?? 1), 0);
  let roll = createSeededRandom(args.seed)() * total;
  for (const prompt of pool) {
    roll -= Math.max(1, prompt.weight ?? 1);
    if (roll <= 0) return prompt;
  }
  return pool[pool.length - 1];
}
