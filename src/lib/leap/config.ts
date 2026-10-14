import connectMongo from '@/lib/mongoose';
import LeapConfigModel, {
  LEAP_CONFIG_ID,
  LEAP_CONFIG_VERSION,
  LEAP_DEFAULTS,
  LEAP_NUMBER_LIMITS,
  LEGACY_LEAP_MARK_FLIES,
  LEGACY_WEEK_GIFTS,
  RETIRED_LEAGUE_LABELS,
  type LeapConfigDoc,
} from '@/lib/models/LeapConfig';
import {
  LEAP_MARK_IDS,
  type BonusReward,
  type BonusRewards,
  type LeapConfigView,
  type LeapLeague,
  type LeapLuckyDrop,
  type LeapMarkConfig,
  type LeapMarkId,
} from './types';

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const RETIRED_FIELDS = [
  'leapGiftTiers',
  'streakRungs',
  'multiplierCap',
  'leapBackEnabled',
  'lilies',
  'postSetEveryLeaps',
  'postSetRewards',
  'postSetPlusRewards',
] as const;

const clampNumber = (
  value: unknown,
  fallback: number,
  bounds?: { min: number; max: number },
) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (!bounds) return n;
  return Math.min(bounds.max, Math.max(bounds.min, n));
};

const whole = (value: unknown, fallback: number, min = 0, max = 100000) =>
  Math.round(clampNumber(value, fallback, { min, max }));

export function sanitizeBonusRewards(value: unknown): BonusRewards {
  if (!Array.isArray(value)) return [];
  const out: BonusRewards = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const amount =
      entry.amount === undefined ? undefined : whole(entry.amount, 1, 0);
    switch (entry.type) {
      case 'FLIES':
        out.push({ type: 'FLIES', amount: amount ?? 0 });
        break;
      case 'SHIELD':
        out.push({ type: 'SHIELD', amount: Math.max(1, amount ?? 1) });
        break;
      case 'RARITY_ITEM':
        if (typeof entry.rarity === 'string' && RARITIES.includes(entry.rarity)) {
          out.push({
            type: 'RARITY_ITEM',
            rarity: entry.rarity as 'epic',
            amount: Math.max(1, amount ?? 1),
          });
        }
        break;
      case 'BACKGROUND':
        if (typeof entry.backgroundId === 'string' && entry.backgroundId) {
          out.push({ type: 'BACKGROUND', backgroundId: entry.backgroundId });
        }
        break;
      case 'BOX':
      case 'ITEM':
        if (typeof entry.itemId === 'string' && entry.itemId) {
          out.push({
            type: entry.type,
            itemId: entry.itemId,
            amount: Math.max(1, amount ?? 1),
          } as BonusReward);
        }
        break;
      default:
        break;
    }
  }
  return out;
}

function sanitizeMarks(value: unknown): Record<LeapMarkId, LeapMarkConfig> {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    Partial<LeapMarkConfig> | undefined
  >;
  const out = {} as Record<LeapMarkId, LeapMarkConfig>;
  for (const id of LEAP_MARK_IDS) {
    const fallback = LEAP_DEFAULTS.marks[id];
    const entry = raw[id] ?? {};
    out[id] = {
      percent: whole(entry.percent, fallback.percent, 1, 100),
      minDays: whole(entry.minDays, fallback.minDays, 1, 7),
      minScheduled: whole(entry.minScheduled, fallback.minScheduled, 1, 100),
      flies: whole(entry.flies, fallback.flies, 0, 10000),
    };
  }
  return out;
}

function sanitizeList<T>(
  value: unknown,
  fallback: T[],
  map: (entry: Record<string, unknown>, index: number) => T | null,
): T[] {
  if (!Array.isArray(value)) return fallback;
  const out: T[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const mapped = map(raw as Record<string, unknown>, index);
    if (mapped) out.push(mapped);
  });
  return out;
}

export function normalizeLeapConfig(
  doc: Partial<LeapConfigDoc> | null | undefined,
): LeapConfigView {
  const source = (doc ?? {}) as Record<string, unknown>;
  const num = (key: keyof LeapConfigView) =>
    clampNumber(
      source[key],
      LEAP_DEFAULTS[key] as number,
      LEAP_NUMBER_LIMITS[key],
    );
  const marks = sanitizeMarks(source.marks);
  const leagues = sanitizeList<LeapLeague>(
    source.leagues,
    LEAP_DEFAULTS.leagues,
    (entry, index) => ({
      label:
        typeof entry.label === 'string' && entry.label.trim()
          ? entry.label.trim().slice(0, 40)
          : 'Lily',
      multiplier: clampNumber(entry.multiplier, 1, { min: 1, max: 5 }),
      leapPercent: whole(
        entry.leapPercent,
        LEAP_DEFAULTS.leagues[index]?.leapPercent ?? marks.leap.percent,
        1,
        100,
      ),
      weekRewards: sanitizeBonusRewards(entry.weekRewards),
      reachRewards: sanitizeBonusRewards(entry.reachRewards),
      plusReachRewards: sanitizeBonusRewards(entry.plusReachRewards),
      plusWeekRewards:
        entry.plusWeekRewards === undefined
          ? LEAP_DEFAULTS.leagues[index]?.plusWeekRewards ?? []
          : sanitizeBonusRewards(entry.plusWeekRewards),
    }),
  );
  return {
    isActive:
      typeof source.isActive === 'boolean'
        ? source.isActive
        : LEAP_DEFAULTS.isActive,
    hopFlies: Math.round(num('hopFlies')),
    hopsPaidPerDay: Math.round(num('hopsPaidPerDay')),
    comebackFlies: Math.round(num('comebackFlies')),
    comebackLookbackDays: Math.round(num('comebackLookbackDays')),
    comebacksPerDay: Math.round(num('comebacksPerDay')),
    luckyChancePercent: num('luckyChancePercent'),
    luckyPityHops: Math.round(num('luckyPityHops')),
    luckyDropsPerDay: Math.round(num('luckyDropsPerDay')),
    firstHopRewards:
      source.firstHopRewards === undefined
        ? LEAP_DEFAULTS.firstHopRewards
        : sanitizeBonusRewards(source.firstHopRewards),
    luckyDrops: sanitizeList<LeapLuckyDrop>(
      source.luckyDrops,
      LEAP_DEFAULTS.luckyDrops,
      (entry) => {
        const weight = clampNumber(entry.weight, 0, { min: 0, max: 100000 });
        const rewards = sanitizeBonusRewards(entry.rewards);
        return weight > 0 && rewards.length ? { weight, rewards } : null;
      },
    ),
    marks,
    leagues: leagues.length ? leagues : LEAP_DEFAULTS.leagues,
  };
}

const LEGACY_LEAP_HELP_TEXTS = [
  'Pick this week’s area on the Quests page and commit to one thing in it.',
  'Tick off a task that repeats. Every one is a hop toward your Leap.',
];
const LEAP_HELP_TEXT =
  'Tick off a task that repeats. Every one counts toward your weekly league.';

async function refreshLeapOnboardingCopy() {
  const { default: QuestTemplateModel } = await import('@/lib/models/QuestTemplate');
  const { default: QuestModel } = await import('@/lib/models/Quest');
  const filter = {
    'logic.metricKey': 'focus_tag_linked',
    'logic.helpText': { $in: LEGACY_LEAP_HELP_TEXTS },
  };
  const update = { $set: { 'logic.$[block].helpText': LEAP_HELP_TEXT } };
  const options = {
    arrayFilters: [
      {
        'block.metricKey': 'focus_tag_linked',
        'block.helpText': { $in: LEGACY_LEAP_HELP_TEXTS },
      },
    ],
  };
  await QuestTemplateModel.updateMany(filter, update, options);
  await QuestModel.updateMany(filter, update, options);
}

async function upgradeLeapConfig(doc: LeapConfigDoc) {
  const unset: Record<string, ''> = {};
  for (const field of RETIRED_FIELDS) {
    if ((doc as unknown as Record<string, unknown>)[field] !== undefined) {
      unset[field] = '';
    }
  }
  const set: Record<string, unknown> = { configVersion: LEAP_CONFIG_VERSION };
  const leagues = (doc as unknown as { leagues?: unknown }).leagues;
  if (!Array.isArray(leagues)) {
    set.leagues = LEAP_DEFAULTS.leagues;
  } else {
    set.leagues = leagues.map((entry, index) => {
      if (!entry || typeof entry !== 'object') return entry;
      const fallback = LEAP_DEFAULTS.leagues[index];
      if (!fallback) return entry;
      const next = { ...(entry as Record<string, unknown>) };
      if (next.label === RETIRED_LEAGUE_LABELS[index]) next.label = fallback.label;
      if ((doc.configVersion ?? 0) < 4) {
        const week = next.weekRewards as Array<{ type?: string; itemId?: string }> | undefined;
        const untouched =
          Array.isArray(week) &&
          week.length === 1 &&
          week[0]?.type === 'BOX' &&
          week[0]?.itemId === LEGACY_WEEK_GIFTS[index];
        if (untouched) next.weekRewards = fallback.weekRewards;
        if (next.plusWeekRewards === undefined) next.plusWeekRewards = fallback.plusWeekRewards;
      }
      return next;
    });
  }
  const marks = sanitizeMarks(doc.marks);
  if ((doc.configVersion ?? 0) < 4 && marks.leap.flies === LEGACY_LEAP_MARK_FLIES) {
    marks.leap = { ...marks.leap, flies: LEAP_DEFAULTS.marks.leap.flies };
  }
  set.marks = marks;
  await LeapConfigModel.updateOne(
    { configId: LEAP_CONFIG_ID },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  );
  await refreshLeapOnboardingCopy().catch(() => {});
}

let cached: { at: number; value: LeapConfigView } | null = null;
const CACHE_MS = 30_000;

export function clearLeapConfigCache() {
  cached = null;
}

export async function loadLeapConfig(): Promise<LeapConfigView> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  await connectMongo();
  let doc = await LeapConfigModel.findOne({ configId: LEAP_CONFIG_ID })
    .lean<LeapConfigDoc>()
    .exec();
  if (!doc) {
    try {
      const created = await LeapConfigModel.create({
        configId: LEAP_CONFIG_ID,
        configVersion: LEAP_CONFIG_VERSION,
        ...LEAP_DEFAULTS,
      });
      doc = created.toObject() as LeapConfigDoc;
      await refreshLeapOnboardingCopy().catch(() => {});
    } catch {
      doc = await LeapConfigModel.findOne({ configId: LEAP_CONFIG_ID })
        .lean<LeapConfigDoc>()
        .exec();
    }
  } else if ((doc.configVersion ?? 0) < LEAP_CONFIG_VERSION) {
    await upgradeLeapConfig(doc).catch(() => {});
    doc = await LeapConfigModel.findOne({ configId: LEAP_CONFIG_ID })
      .lean<LeapConfigDoc>()
      .exec();
  }
  const value = normalizeLeapConfig(doc);
  cached = { at: Date.now(), value };
  return value;
}

export async function saveLeapConfig(input: unknown): Promise<LeapConfigView> {
  const next = normalizeLeapConfig(input as Partial<LeapConfigDoc>);
  await connectMongo();
  await LeapConfigModel.updateOne(
    { configId: LEAP_CONFIG_ID },
    { $set: { ...next, configVersion: LEAP_CONFIG_VERSION } },
    { upsert: true },
  );
  clearLeapConfigCache();
  return next;
}
