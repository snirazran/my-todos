import type { mongo } from 'mongoose';

type Db = mongo.Db;
type Document = mongo.Document;
type Filter<T> = mongo.Filter<T>;

export const ECONOMY_SCALE_VERSION = 2;
export const ECONOMY_SCALE_STATE_ID = 'economy-scale';
export const ECONOMY_SCALE_STATE_COLLECTION = 'economyScaleState';
export const ECONOMY_SCALE_DIVISOR = 10;

type Reward = Record<string, unknown>;

export type RescaleLeagueRewards = {
  weekRewards: Reward[];
  plusWeekRewards: Reward[];
};

export type RescaleTargets = {
  itemPrices: Record<string, number>;
  backgroundPrices: Record<string, number>;
  flyEconomy: Record<string, Record<string, unknown>>;
  leap: {
    leagues: RescaleLeagueRewards[];
  };
  sweep: {
    cleanSweepFlies: number;
    standardRoll: unknown[];
    goldenRoll: unknown[];
    megaRewards: unknown[];
  };
  loginGoalTiers: Array<{ days: number; rewards: Reward[] }>;
  dailySlotFlies: number[];
  categorySlotFlies: number[];
};

export type RescaleStepReport = {
  step: string;
  matched: number;
  changed: number;
  skipped?: boolean;
  samples?: unknown[];
};

export type RescaleReport = {
  dryRun: boolean;
  alreadyDone: boolean;
  startedAt: string | null;
  completedAt: string | null;
  steps: RescaleStepReport[];
};

type StateDoc = {
  configId: string;
  version: number;
  startedAt: Date;
  completedAt?: Date | null;
  steps?: Record<string, Date>;
  before?: Record<string, unknown>;
};

const TAG = 'economyScale';

export const scaleBalance = (amount: number) =>
  Math.ceil(Math.max(0, amount) / ECONOMY_SCALE_DIVISOR);

export const scaleReward = (amount: number) =>
  amount <= 0 ? 0 : Math.max(1, Math.round(amount / ECONOMY_SCALE_DIVISOR));

export const scaleCounter = (amount: number) =>
  Math.max(0, Math.round(amount / ECONOMY_SCALE_DIVISOR));

export const scaleSmallReward = (amount: number) =>
  amount <= 0 ? 0 : amount <= 8 ? Math.ceil(amount / 2) : Math.max(4, scaleReward(amount));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function scaleFlyRewardsDeep<T>(
  node: T,
  scale: (amount: number) => number,
): { value: T; changed: number } {
  let changed = 0;
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (!isPlainObject(input)) return input;
    const out: Record<string, unknown> = {};
    Object.keys(input).forEach((key) => {
      out[key] = walk(input[key]);
    });
    if (out.type === 'FLIES') {
      (['amount', 'minAmount', 'maxAmount'] as const).forEach((key) => {
        const current = out[key];
        if (typeof current !== 'number' || !isFinite(current)) return;
        const next = scale(current);
        if (next !== current) {
          out[key] = next;
          changed += 1;
        }
      });
    }
    return out;
  };
  return { value: walk(node) as T, changed };
}

function withFlies(rewards: unknown, amount: number): unknown {
  if (!Array.isArray(rewards)) return rewards;
  return rewards.map((reward) => {
    if (!isPlainObject(reward) || reward.type !== 'FLIES') return reward;
    const next: Record<string, unknown> = { ...reward, amount };
    if (typeof reward.minAmount === 'number') next.minAmount = amount;
    if (typeof reward.maxAmount === 'number') next.maxAmount = amount;
    return next;
  });
}

function slotsWithFlies(slots: unknown, flies: number[]): unknown {
  if (!Array.isArray(slots) || flies.length === 0) return slots;
  return slots.map((slot, index) => {
    if (!isPlainObject(slot)) return slot;
    const amount = flies[Math.min(index, flies.length - 1)];
    return { ...slot, rewards: withFlies(slot.rewards, amount) };
  });
}

const untagged = (extra: Filter<Document> = {}): Filter<Document> => ({
  ...extra,
  [TAG]: { $ne: ECONOMY_SCALE_VERSION },
});

export async function runEconomyRescale(
  db: Db,
  targets: RescaleTargets,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<RescaleReport> {
  const dryRun = !!options.dryRun;
  const now = options.now ?? new Date();
  const stateCol = db.collection(ECONOMY_SCALE_STATE_COLLECTION);
  const steps: RescaleStepReport[] = [];
  const readState = async () =>
    (await stateCol.findOne({ configId: ECONOMY_SCALE_STATE_ID })) as StateDoc | null;

  let state = await readState();
  if (state && state.version >= ECONOMY_SCALE_VERSION && state.completedAt) {
    return {
      dryRun,
      alreadyDone: true,
      startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : null,
      completedAt: new Date(state.completedAt).toISOString(),
      steps,
    };
  }
  if (!state && !dryRun) {
    await stateCol.createIndex({ configId: 1 }, { unique: true });
    try {
      await stateCol.insertOne({
        configId: ECONOMY_SCALE_STATE_ID,
        version: ECONOMY_SCALE_VERSION,
        startedAt: now,
        completedAt: null,
        steps: {},
        before: {},
      });
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
    state = await readState();
  }
  const startedAt = state?.startedAt ? new Date(state.startedAt) : now;
  const done = state?.steps ?? {};

  const runStep = async (
    name: string,
    work: () => Promise<Omit<RescaleStepReport, 'step'>>,
  ) => {
    if (!dryRun && done[name]) {
      steps.push({ step: name, matched: 0, changed: 0, skipped: true });
      return;
    }
    const result = await work();
    steps.push({ step: name, ...result });
    if (!dryRun) {
      await stateCol.updateOne(
        { configId: ECONOMY_SCALE_STATE_ID },
        { $set: { [`steps.${name}`]: new Date() } },
      );
    }
  };

  const remember = async (key: string, value: unknown) => {
    if (dryRun) return;
    await stateCol.updateOne(
      { configId: ECONOMY_SCALE_STATE_ID, [`before.${key}`]: { $exists: false } },
      { $set: { [`before.${key}`]: value } },
    );
  };

  const rewriteDocs = async (
    collection: string,
    filter: Filter<Document>,
    fields: string[],
    scale: (amount: number, doc: Document) => number,
    projection?: Document,
  ) => {
    const col = db.collection(collection);
    const docs = await col
      .find(untagged(filter), projection ? { projection } : undefined)
      .toArray();
    let changed = 0;
    const samples: unknown[] = [];
    const ops: Array<{
      updateOne: { filter: Filter<Document>; update: Document };
    }> = [];
    docs.forEach((doc) => {
      const set: Document = { [TAG]: ECONOMY_SCALE_VERSION };
      let docChanged = 0;
      fields.forEach((field) => {
        if (doc[field] === undefined || doc[field] === null) return;
        const result = scaleFlyRewardsDeep(doc[field], (amount) => scale(amount, doc));
        if (result.changed > 0) {
          set[field] = result.value;
          docChanged += result.changed;
        }
      });
      if (docChanged > 0) {
        changed += 1;
        if (samples.length < 2) samples.push({ id: String(doc._id), values: docChanged });
      }
      ops.push({ updateOne: { filter: untagged({ _id: doc._id }), update: { $set: set } } });
    });
    if (!dryRun) {
      for (let i = 0; i < ops.length; i += 500) {
        await col.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      }
    }
    return { matched: docs.length, changed, samples };
  };

  await runStep('flyEconomy', async () => {
    const col = db.collection('flyEconomyConfigs');
    const doc = await col.findOne({ configId: 'fly-economy' });
    if (!doc) return { matched: 0, changed: 0 };
    await remember('flyEconomy', doc.settings ?? null);
    const set: Document = {};
    Object.keys(targets.flyEconomy).forEach((group) => {
      Object.keys(targets.flyEconomy[group]).forEach((key) => {
        set[`settings.${group}.${key}`] = targets.flyEconomy[group][key];
      });
    });
    if (!dryRun) await col.updateOne({ _id: doc._id }, { $set: set });
    return { matched: 1, changed: 1, samples: [Object.keys(set).length + ' fields'] };
  });

  await runStep('leap', async () => {
    const col = db.collection('leapConfigs');
    const doc = await col.findOne({ configId: 'leap' });
    if (!doc) return { matched: 0, changed: 0 };
    await remember('leap', { leagues: doc.leagues });
    const set: Document = {};
    if (Array.isArray(doc.leagues)) {
      set.leagues = doc.leagues.map((league: unknown, index: number) => {
        const target = targets.leap.leagues[index];
        if (!isPlainObject(league) || !target) return league;
        return { ...league, ...target };
      });
    }
    if (!dryRun) await col.updateOne({ _id: doc._id }, { $set: set });
    return { matched: 1, changed: 1 };
  });

  await runStep('sweep', async () => {
    const col = db.collection('questStreakConfigs');
    const doc = await col.findOne({ configId: 'daily-streak' });
    if (!doc) return { matched: 0, changed: 0 };
    await remember('sweep', {
      cleanSweepFlies: doc.cleanSweepFlies,
      standardRoll: doc.standardRoll,
      goldenRoll: doc.goldenRoll,
      megaRewards: doc.megaRewards,
    });
    if (!dryRun) await col.updateOne({ _id: doc._id }, { $set: targets.sweep });
    return { matched: 1, changed: 1 };
  });

  await runStep('loginStreak', async () => {
    const col = db.collection('loginStreakConfigs');
    const doc = await col.findOne({ configId: 'login-streak' });
    if (!doc) return { matched: 0, changed: 0 };
    await remember('loginStreak', { goalTiers: doc.goalTiers });
    if (!dryRun) {
      await col.updateOne({ _id: doc._id }, { $set: { goalTiers: targets.loginGoalTiers } });
    }
    return { matched: 1, changed: 1 };
  });

  await runStep('recipes', async () => {
    const col = db.collection('quest_recipes');
    const docs = await col.find({}).toArray();
    await remember(
      'recipes',
      docs.map((doc) => ({ recipeId: doc.recipeId, slots: doc.slots })),
    );
    let changed = 0;
    for (const doc of docs) {
      const flies = doc.placement === 'daily' ? targets.dailySlotFlies : targets.categorySlotFlies;
      const slots = slotsWithFlies(doc.slots, flies);
      if (JSON.stringify(slots) === JSON.stringify(doc.slots)) continue;
      changed += 1;
      if (!dryRun) await col.updateOne({ _id: doc._id }, { $set: { slots } });
    }
    return { matched: docs.length, changed };
  });

  await runStep('prices', async () => {
    const items = db.collection('catalogItems');
    const backgrounds = db.collection('backgrounds');
    const before = await Promise.all([
      items.find({}).project({ id: 1, priceFlies: 1 }).toArray(),
      backgrounds.find({}).project({ id: 1, priceFlies: 1 }).toArray(),
    ]);
    await remember('itemPrices', before[0].map((row) => ({ id: row.id, priceFlies: row.priceFlies })));
    await remember(
      'backgroundPrices',
      before[1].map((row) => ({ id: row.id, priceFlies: row.priceFlies })),
    );
    let matched = 0;
    let changed = 0;
    for (const rarity of Object.keys(targets.itemPrices)) {
      const filter = { rarity, slot: { $ne: 'container' }, priceFlies: { $gt: 0 } };
      const price = targets.itemPrices[rarity];
      matched += await items.countDocuments(filter);
      changed += await items.countDocuments({ ...filter, priceFlies: { $gt: 0, $ne: price } });
      if (!dryRun) await items.updateMany(filter, { $set: { priceFlies: price } });
    }
    for (const rarity of Object.keys(targets.backgroundPrices)) {
      const filter = { rarity, priceFlies: { $gt: 0 } };
      const price = targets.backgroundPrices[rarity];
      matched += await backgrounds.countDocuments(filter);
      changed += await backgrounds.countDocuments({ ...filter, priceFlies: { $gt: 0, $ne: price } });
      if (!dryRun) await backgrounds.updateMany(filter, { $set: { priceFlies: price } });
    }
    const containers = untagged({ slot: 'container', priceFlies: { $gt: 0 } });
    const containerCount = await items.countDocuments(containers);
    matched += containerCount;
    changed += containerCount;
    if (!dryRun) {
      await items.updateMany(containers, [
        {
          $set: {
            priceFlies: { $ceil: { $divide: ['$priceFlies', ECONOMY_SCALE_DIVISOR] } },
            [TAG]: ECONOMY_SCALE_VERSION,
          },
        },
      ]);
    }
    return { matched, changed };
  });

  await runStep('shield', async () => {
    const col = db.collection('shieldConfigs');
    const filter = untagged({ configId: 'shields' });
    const matched = await col.countDocuments(filter);
    if (!dryRun && matched > 0) {
      const scaled = (field: string) => ({
        $cond: [
          { $gt: [`$${field}`, 0] },
          { $ceil: { $divide: [`$${field}`, ECONOMY_SCALE_DIVISOR] } },
          `$${field}`,
        ],
      });
      await col.updateMany(filter, [
        {
          $set: {
            priceFlies: scaled('priceFlies'),
            twoPackPriceFlies: scaled('twoPackPriceFlies'),
            rescuePriceFlies: scaled('rescuePriceFlies'),
            [TAG]: ECONOMY_SCALE_VERSION,
          },
        },
      ]);
    }
    return { matched, changed: matched };
  });

  await runStep('milestones', () =>
    rewriteDocs('milestoneConfigs', {}, ['tracks'], scaleReward),
  );

  await runStep('invites', () => rewriteDocs('inviteConfig', {}, ['rewards'], scaleReward));

  await runStep('questTemplates', () =>
    rewriteDocs(
      'quest_templates',
      {},
      ['logic', 'rewards', 'bonusRewards'],
      (amount, doc) => (doc.placement === 'category' ? scaleSmallReward(amount) : scaleReward(amount)),
      { placement: 1, logic: 1, rewards: 1, bonusRewards: 1 },
    ),
  );

  await runStep('seasons', () =>
    rewriteDocs('quest_seasons', {}, ['tierRewards'], scaleReward, { tierRewards: 1 }),
  );

  await runStep('quests', () =>
    rewriteDocs(
      'quests',
      { createdAt: { $lt: startedAt } },
      ['logic', 'rewards', 'bonusRewards'],
      (amount, doc) => (doc.placement === 'category' ? scaleSmallReward(amount) : scaleReward(amount)),
      { placement: 1, logic: 1, rewards: 1, bonusRewards: 1 },
    ),
  );

  await runStep('snapshots', async () => {
    const col = db.collection('economyUpdateSnapshots');
    const filter = { undoneAt: null };
    const matched = await col.countDocuments(filter);
    if (!dryRun && matched > 0) {
      await col.updateMany(filter, {
        $set: { undoneAt: new Date(), supersededBy: ECONOMY_SCALE_STATE_ID },
      });
    }
    return { matched, changed: matched };
  });

  await runStep('ledger', async () => {
    const col = db.collection('flyLedger');
    const filter = untagged({
      createdAt: { $lt: startedAt },
      amount: { $ne: 0 },
    });
    const matched = await col.countDocuments(filter);
    if (!dryRun && matched > 0) {
      await col.updateMany(filter, [
        {
          $set: {
            amountBeforeRescale: '$amount',
            amount: {
              $cond: [
                { $gte: ['$amount', 0] },
                { $ceil: { $divide: ['$amount', ECONOMY_SCALE_DIVISOR] } },
                { $floor: { $divide: ['$amount', ECONOMY_SCALE_DIVISOR] } },
              ],
            },
            [TAG]: ECONOMY_SCALE_VERSION,
          },
        },
      ]);
    }
    return { matched, changed: matched };
  });

  await runStep('leapWeeks', async () => {
    const col = db.collection('leapWeeks');
    const filter = untagged({
      settledAt: null,
      createdAt: { $lt: startedAt },
      fliesGranted: { $gt: 0 },
    });
    const matched = await col.countDocuments(filter);
    if (!dryRun && matched > 0) {
      await col.updateMany(filter, [
        {
          $set: {
            fliesGranted: { $round: [{ $divide: ['$fliesGranted', ECONOMY_SCALE_DIVISOR] }, 0] },
            [TAG]: ECONOMY_SCALE_VERSION,
          },
        },
      ]);
    }
    return { matched, changed: matched };
  });

  await runStep('userExtras', async () => {
    const col = db.collection('users');
    const docs = await col
      .find(
        untagged({
          createdAt: { $lt: startedAt },
          $or: [
            { 'wardrobe.stolenFlies': { $gt: 0 } },
            { 'wardrobe.flyDaily.earned': { $gt: 0 } },
            { 'adDoubleClaim.fliesGranted': { $gt: 0 } },
            { 'quests.leap.forgoneFlies': { $gt: 0 } },
            { 'quests.leap.pendingResult.fliesGranted': { $gt: 0 } },
            { 'quests.pactStreak.forgoneFlies': { $gt: 0 } },
            { 'plusEarned.flies': { $gt: 0 } },
          ],
        }),
        {
          projection: {
            'wardrobe.stolenFlies': 1,
            'wardrobe.flyDaily.earned': 1,
            'adDoubleClaim.fliesGranted': 1,
            'quests.leap.forgoneFlies': 1,
            'quests.leap.pendingResult.fliesGranted': 1,
            'quests.pactStreak.forgoneFlies': 1,
            'plusEarned.flies': 1,
          },
        },
      )
      .toArray();
    const positive = (value: unknown): value is number => typeof value === 'number' && value > 0;
    const ops = docs.map((doc) => {
      const set: Document = { [TAG]: ECONOMY_SCALE_VERSION };
      const stolen = doc.wardrobe?.stolenFlies;
      if (positive(stolen)) set['wardrobe.stolenFlies'] = scaleBalance(stolen);
      const earnedToday = doc.wardrobe?.flyDaily?.earned;
      if (positive(earnedToday)) set['wardrobe.flyDaily.earned'] = scaleBalance(earnedToday);
      const double = doc.adDoubleClaim?.fliesGranted;
      if (positive(double)) set['adDoubleClaim.fliesGranted'] = scaleBalance(double);
      const forgone = doc.quests?.leap?.forgoneFlies;
      if (positive(forgone)) set['quests.leap.forgoneFlies'] = scaleCounter(forgone);
      const pending = doc.quests?.leap?.pendingResult?.fliesGranted;
      if (positive(pending)) set['quests.leap.pendingResult.fliesGranted'] = scaleCounter(pending);
      const pact = doc.quests?.pactStreak?.forgoneFlies;
      if (positive(pact)) set['quests.pactStreak.forgoneFlies'] = scaleCounter(pact);
      const plus = doc.plusEarned?.flies;
      if (positive(plus)) set['plusEarned.flies'] = scaleCounter(plus);
      return { updateOne: { filter: untagged({ _id: doc._id }), update: { $set: set } } };
    });
    if (!dryRun) {
      for (let i = 0; i < ops.length; i += 500) {
        await col.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      }
    }
    return { matched: docs.length, changed: docs.length };
  });

  await runStep('balances', async () => {
    const col = db.collection('users');
    const filter: Filter<Document> = {
      'wardrobe.flies': { $type: 'number' },
      'wardrobe.fliesScale': { $ne: ECONOMY_SCALE_VERSION },
      createdAt: { $lt: startedAt },
    };
    const matched = await col.countDocuments(filter);
    const [totals] = await col
      .aggregate<{ before: number; after: number; holders: number }>([
        { $match: filter },
        {
          $group: {
            _id: null,
            before: { $sum: { $max: [0, '$wardrobe.flies'] } },
            after: {
              $sum: { $ceil: { $divide: [{ $max: [0, '$wardrobe.flies'] }, ECONOMY_SCALE_DIVISOR] } },
            },
            holders: { $sum: { $cond: [{ $gt: ['$wardrobe.flies', 0] }, 1, 0] } },
          },
        },
      ])
      .toArray();
    if (!dryRun && matched > 0) {
      await col.updateMany(filter, [
        {
          $set: {
            'wardrobe.fliesBeforeRescale': '$wardrobe.flies',
            'wardrobe.flies': {
              $ceil: { $divide: [{ $max: [0, '$wardrobe.flies'] }, ECONOMY_SCALE_DIVISOR] },
            },
            'wardrobe.fliesScale': ECONOMY_SCALE_VERSION,
            'seenIntros.fliesRescale': {
              $cond: [{ $gt: ['$wardrobe.flies', 0] }, false, '$$REMOVE'],
            },
          },
        },
      ]);
    }
    return { matched, changed: totals?.holders ?? 0, samples: totals ? [totals] : [] };
  });

  let completedAt: Date | null = null;
  if (!dryRun) {
    completedAt = new Date();
    await stateCol.updateOne(
      { configId: ECONOMY_SCALE_STATE_ID },
      { $set: { completedAt, version: ECONOMY_SCALE_VERSION } },
    );
  }

  return {
    dryRun,
    alreadyDone: false,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
    steps,
  };
}
