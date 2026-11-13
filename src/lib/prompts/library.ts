import QuestPromptModel, { type QuestPromptDoc } from '@/lib/models/QuestPrompt';
import PromptAnswerModel from '@/lib/models/PromptAnswer';
import PromptExposureModel from '@/lib/models/PromptExposure';
import type { QuestPromptKind } from '@/lib/quests/types';
import { createSeededRandom } from '@/lib/quests/random';
import {
  PROMPT_DEFAULT_COOLDOWN_DAYS,
  SEED_LIBRARY_VERSION,
  SEED_PROMPTS,
  type PromptSeed,
} from './seeds';

export { CHECKIN_OPTIONS, SEED_PROMPTS } from './seeds';

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

export const PROMPT_RECENT_WINDOW_DAYS = 150;
export const PROMPT_PERSONAL_BOOST = 4;
export const PROMPT_NEW_PLAYER_PERSONAL_BOOST = 8;
export const PROMPT_NEW_PLAYER_DAYS = 7;

const PROMPT_WEEKDAY_BOOST = 6;
const KIND_SHARE: Record<QuestPromptKind, number> = {
  journal: 0.65,
  checkin: 0.35,
  poll: 0.5,
  this_or_that: 0.5,
};

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
  | 'audience'
  | 'weekdays'
>;

export type RecentPromptAnswer = {
  promptId: string;
  dayKey: string;
  category: string;
  kind?: QuestPromptKind;
  answered?: boolean;
  personal?: boolean;
};

export function isPersonalPrompt(prompt: Pick<PromptLibraryEntry, 'audience'>) {
  return (prompt.audience?.length ?? 0) > 0;
}

export function promptPersonalBoost(createdAt?: Date | string | null, now = Date.now()) {
  const created = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(created)) return PROMPT_PERSONAL_BOOST;
  return now - created < PROMPT_NEW_PLAYER_DAYS * 86_400_000
    ? PROMPT_NEW_PLAYER_PERSONAL_BOOST
    : PROMPT_PERSONAL_BOOST;
}

function seedContent(seed: PromptSeed) {
  return {
    kind: seed.kind,
    question: seed.question,
    options: seed.options ?? [],
    category: seed.category,
    audience: seed.audience ?? [],
    weekdays: seed.weekdays ?? [],
    cooldownDays: seed.cooldownDays ?? PROMPT_DEFAULT_COOLDOWN_DAYS[seed.kind],
    seedVersion: SEED_LIBRARY_VERSION,
    ...(seed.placeholder ? { placeholder: seed.placeholder } : {}),
    ...(seed.weight ? { weight: seed.weight } : {}),
  };
}

async function syncSeedPrompts(): Promise<void> {
  const newest = await QuestPromptModel.findOne({}, { seedVersion: 1 })
    .sort({ seedVersion: -1 })
    .lean<{ seedVersion?: number } | null>();
  if ((newest?.seedVersion ?? 0) >= SEED_LIBRARY_VERSION) return;
  await QuestPromptModel.bulkWrite(
    SEED_PROMPTS.map((seed) => ({
      updateOne: {
        filter: { promptId: seed.promptId },
        update: {
          $set: seedContent(seed),
          $setOnInsert: {
            dateKey: null,
            isActive: true,
            ...(seed.weight ? {} : { weight: 1 }),
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

let seedSync: Promise<void> | null = null;

export function ensureSeedPrompts(): Promise<void> {
  seedSync ??= syncSeedPrompts().catch(() => {
    seedSync = null;
  });
  return seedSync;
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
      audience: 1,
      weekdays: 1,
    },
  ).lean<PromptLibraryEntry[]>();
}

export async function loadRecentPromptAnswers(
  userId: string,
  sinceDayKey: string,
): Promise<RecentPromptAnswer[]> {
  const [answers, shown] = await Promise.all([
    PromptAnswerModel.find(
      { userId, dayKey: { $gte: sinceDayKey } },
      { promptId: 1, dayKey: 1, category: 1, kind: 1 },
    ).lean<RecentPromptAnswer[]>(),
    PromptExposureModel.find(
      { userId, dayKey: { $gte: sinceDayKey } },
      { promptId: 1, dayKey: 1, category: 1, kind: 1, personal: 1 },
    ).lean<RecentPromptAnswer[]>(),
  ]);
  const merged = new Map<string, RecentPromptAnswer>();
  for (const entry of shown) {
    merged.set(`${entry.dayKey}:${entry.promptId}`, {
      promptId: entry.promptId,
      dayKey: entry.dayKey,
      category: entry.category,
      kind: entry.kind,
      personal: !!entry.personal,
      answered: false,
    });
  }
  for (const entry of answers) {
    const key = `${entry.dayKey}:${entry.promptId}`;
    merged.set(key, {
      promptId: entry.promptId,
      dayKey: entry.dayKey,
      category: entry.category,
      kind: entry.kind,
      personal: merged.get(key)?.personal,
      answered: true,
    });
  }
  return Array.from(merged.values()).sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}

export async function recordPromptExposures(
  userId: string,
  dayKey: string,
  prompts: Array<Pick<PromptLibraryEntry, 'promptId' | 'kind' | 'category' | 'audience'>>,
): Promise<void> {
  if (prompts.length === 0) return;
  await PromptExposureModel.bulkWrite(
    prompts.map((prompt) => ({
      updateOne: {
        filter: { userId, promptId: prompt.promptId, dayKey },
        update: {
          $setOnInsert: {
            kind: prompt.kind,
            category: prompt.category,
            personal: isPersonalPrompt(prompt),
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  ).catch(() => {});
}

function daysBetween(fromKey: string, toKey: string) {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Infinity;
  return Math.round((to - from) / 86_400_000);
}

function weekdayOf(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.getUTCDay() : -1;
}

export function pickPrompt(args: {
  prompts: PromptLibraryEntry[];
  categories?: string[];
  kinds?: QuestPromptKind[];
  recent: RecentPromptAnswer[];
  audience?: string[];
  personalBoost?: number;
  todayKey: string;
  seed: string;
  excludeIds?: string[];
}): PromptLibraryEntry | null {
  const exclude = new Set(args.excludeIds ?? []);
  const categories = args.categories?.length ? new Set(args.categories) : null;
  const kinds = args.kinds?.length ? new Set(args.kinds) : null;
  const tags = new Set(args.audience ?? []);
  const weekday = weekdayOf(args.todayKey);
  const matching = args.prompts.filter(
    (prompt) =>
      !exclude.has(prompt.promptId) &&
      (!categories || categories.has(prompt.category)) &&
      (!kinds || kinds.has(prompt.kind)) &&
      (prompt.kind === 'journal' || (prompt.options?.length ?? 0) >= 2) &&
      (!isPersonalPrompt(prompt) || prompt.audience!.some((tag) => tags.has(tag))) &&
      ((prompt.weekdays?.length ?? 0) === 0 || prompt.weekdays!.includes(weekday)),
  );
  if (matching.length === 0) return null;

  const pinned = matching.filter((prompt) => prompt.dateKey === args.todayKey);
  if (pinned.length > 0) {
    return pinned[Math.floor(createSeededRandom(`${args.seed}:pinned`)() * pinned.length)];
  }

  const lastSeen = new Map<string, RecentPromptAnswer>();
  for (const entry of args.recent) {
    const known = lastSeen.get(entry.promptId);
    if (!known || entry.dayKey > known.dayKey) lastSeen.set(entry.promptId, entry);
  }

  const undated = matching.filter((prompt) => !prompt.dateKey);
  let fresh = undated.filter((prompt) => {
    const seen = lastSeen.get(prompt.promptId);
    return (
      !seen || daysBetween(seen.dayKey, args.todayKey) >= Math.max(0, prompt.cooldownDays ?? 30)
    );
  });
  if (fresh.length === 0) {
    const stalest = [...undated].sort((a, b) =>
      (lastSeen.get(a.promptId)?.dayKey ?? '').localeCompare(lastSeen.get(b.promptId)?.dayKey ?? ''),
    );
    fresh = stalest.slice(0, Math.max(1, Math.ceil(stalest.length / 4)));
  }

  const groupKinds = new Set(matching.map((prompt) => prompt.kind));
  const trail = args.recent
    .filter((entry) => !entry.kind || groupKinds.has(entry.kind))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  const avoidCount = new Set(fresh.map((prompt) => prompt.category)).size >= 5 ? 2 : 1;
  const avoid = new Set(trail.slice(0, avoidCount).map((entry) => entry.category));
  const varied = fresh.filter((prompt) => !avoid.has(prompt.category));

  const pool = varied.length > 0 ? varied : fresh;
  if (pool.length === 0) return null;

  const personalBoost = trail[0]?.personal ? 1 : Math.max(1, args.personalBoost ?? PROMPT_PERSONAL_BOOST);
  const baseWeight = (prompt: PromptLibraryEntry) =>
    Math.max(1, prompt.weight ?? 1) *
    (isPersonalPrompt(prompt) ? personalBoost : 1) *
    ((prompt.weekdays?.length ?? 0) > 0 ? PROMPT_WEEKDAY_BOOST : 1);

  const kindTotals = new Map<QuestPromptKind, number>();
  for (const prompt of pool) {
    kindTotals.set(prompt.kind, (kindTotals.get(prompt.kind) ?? 0) + baseWeight(prompt));
  }
  const lastKinds = trail.slice(0, 2).map((entry) => entry.kind);
  const kindShare = (kind: QuestPromptKind) => {
    if (kind === 'checkin' && lastKinds[0] === 'checkin') return KIND_SHARE[kind] * 0.25;
    if (lastKinds.length === 2 && lastKinds.every((last) => last === kind)) {
      return KIND_SHARE[kind] * 0.5;
    }
    return KIND_SHARE[kind];
  };
  const weightOf = (prompt: PromptLibraryEntry) =>
    kindTotals.size > 1
      ? (baseWeight(prompt) * kindShare(prompt.kind)) / (kindTotals.get(prompt.kind) ?? 1)
      : baseWeight(prompt);

  const total = pool.reduce((sum, prompt) => sum + weightOf(prompt), 0);
  let roll = createSeededRandom(args.seed)() * total;
  for (const prompt of pool) {
    roll -= weightOf(prompt);
    if (roll <= 0) return prompt;
  }
  return pool[pool.length - 1];
}
