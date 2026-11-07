import connectMongo from '@/lib/mongoose';
import MilestoneConfigModel, {
  MILESTONE_CONFIG_ID,
} from '@/lib/models/MilestoneConfig';
import TaskModel from '@/lib/models/Task';
import FocusSessionModel from '@/lib/models/FocusSession';
import QuestCounterModel from '@/lib/models/QuestCounter';
import UserModel from '@/lib/models/User';
import { getCachedCatalog } from '@/lib/skins/getCatalog';
import {
  grantShields,
  loadShieldConfig,
  readShieldState,
  setShieldStateOn,
} from '@/lib/shields/engine';
import type { QuestReward, QuestRewards } from './types';
import {
  DEFAULT_MILESTONE_CONFIG,
  MILESTONE_LIMITS,
  buildMilestoneRow,
  isMilestoneMetric,
  milestoneStepAt,
  reachedMilestoneSteps,
  sortMilestoneRows,
  type MilestoneBoardView,
  type MilestoneConfig,
  type MilestoneMetric,
  type MilestoneStep,
  type MilestoneTrack,
} from './milestones';

const TRACK_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const CONFIG_CACHE_MS = 30_000;

let configCache: { at: number; config: MilestoneConfig } | null = null;

function sanitizeReward(input: any): QuestReward | null {
  if (!input || typeof input !== 'object') return null;
  if (input.type === 'FLIES') {
    const amount = Math.floor(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { type: 'FLIES', amountMode: 'fixed', amount: Math.min(amount, 10_000) };
  }
  if (input.type === 'SHIELD') {
    const amount = Math.floor(Number(input.amount) || 1);
    return { type: 'SHIELD', amount: Math.min(Math.max(1, amount), 3) };
  }
  if (input.type === 'BACKGROUND') {
    const id = typeof input.backgroundId === 'string' ? input.backgroundId.trim() : '';
    return id ? { type: 'BACKGROUND', backgroundId: id } : null;
  }
  if (input.type === 'ITEM' || input.type === 'BOX') {
    const id = typeof input.itemId === 'string' ? input.itemId.trim() : '';
    if (!id) return null;
    return input.type === 'BOX'
      ? { type: 'BOX', itemId: id, amount: Math.min(Math.max(1, Math.floor(Number(input.amount) || 1)), 10) }
      : { type: 'ITEM', itemId: id };
  }
  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function sanitizeMilestoneConfig(input: any): MilestoneConfig {
  const rawTracks: any[] = Array.isArray(input?.tracks) ? input.tracks : [];
  const seen = new Set<string>();
  const tracks: MilestoneTrack[] = [];
  for (const raw of rawTracks.slice(0, MILESTONE_LIMITS.maxTracks)) {
    if (!raw || !isMilestoneMetric(raw.metric)) continue;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
    let id = typeof raw.id === 'string' && TRACK_ID_PATTERN.test(raw.id) ? raw.id : slugify(name || raw.metric);
    if (!id) continue;
    let suffix = 2;
    const base = id;
    while (seen.has(id)) id = `${base.slice(0, 36)}-${suffix++}`;
    seen.add(id);

    const steps: MilestoneStep[] = [];
    let lastTarget = 0;
    const rawSteps: any[] = Array.isArray(raw.steps) ? raw.steps : [];
    for (const step of rawSteps.slice(0, MILESTONE_LIMITS.maxSteps)) {
      const target = Math.min(MILESTONE_LIMITS.maxTarget, Math.floor(Number(step?.target)));
      if (!Number.isFinite(target) || target <= lastTarget) continue;
      const rewards = (Array.isArray(step?.rewards) ? step.rewards : [])
        .map(sanitizeReward)
        .filter(Boolean)
        .slice(0, MILESTONE_LIMITS.maxRewardsPerStep) as QuestRewards;
      steps.push({ target, rewards });
      lastTarget = target;
    }
    if (steps.length === 0) continue;

    const repeatEvery = Math.floor(Number(raw.repeatEvery) || 0);
    tracks.push({
      id,
      name: name || 'Milestone',
      emoji: typeof raw.emoji === 'string' && raw.emoji.trim() ? Array.from(raw.emoji.trim()).slice(0, 4).join('') : '🏆',
      metric: raw.metric,
      steps,
      repeatEvery: Math.min(MILESTONE_LIMITS.maxTarget, Math.max(0, repeatEvery)),
      isActive: raw.isActive !== false,
    });
  }
  return { isActive: input?.isActive !== false, tracks };
}

export async function loadMilestoneConfig(): Promise<MilestoneConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_CACHE_MS) {
    return configCache.config;
  }
  await connectMongo();
  const doc = await MilestoneConfigModel.findOne({ configId: MILESTONE_CONFIG_ID }).lean();
  const config = doc
    ? sanitizeMilestoneConfig({ isActive: doc.isActive, tracks: doc.tracks })
    : DEFAULT_MILESTONE_CONFIG;
  configCache = { at: Date.now(), config };
  return config;
}

export async function saveMilestoneConfig(input: any): Promise<MilestoneConfig> {
  await connectMongo();
  const config = sanitizeMilestoneConfig(input);
  await MilestoneConfigModel.updateOne(
    { configId: MILESTONE_CONFIG_ID },
    { $set: { isActive: config.isActive, tracks: config.tracks } },
    { upsert: true },
  );
  configCache = { at: Date.now(), config };
  return config;
}

export function readMilestoneClaims(user: any): Record<string, number> {
  const raw = user?.milestones;
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [trackId, entry] of Object.entries(raw)) {
    const claimed = Math.floor(Number((entry as any)?.claimed) || 0);
    if (claimed > 0) out[trackId] = claimed;
  }
  return out;
}

async function tasksFinished(userId: string) {
  const rows = await TaskModel.aggregate<{ total: number }>([
    { $match: { userId, isTutorial: { $ne: true } } },
    { $group: { _id: null, total: { $sum: { $size: { $ifNull: ['$completedDates', []] } } } } },
  ]);
  return Math.max(0, rows[0]?.total ?? 0);
}

async function focusMinutes(userId: string) {
  const rows = await FocusSessionModel.aggregate<{ total: number }>([
    { $match: { userId } },
    { $group: { _id: null, total: { $sum: '$focusSeconds' } } },
  ]);
  return Math.floor(Math.max(0, rows[0]?.total ?? 0) / 60);
}

async function sumCounterAllTime(userId: string, metric: string) {
  const rows = await QuestCounterModel.aggregate<{ total: number }>([
    { $match: { userId, metric } },
    { $group: { _id: null, total: { $sum: '$count' } } },
  ]);
  return Math.max(0, rows[0]?.total ?? 0);
}

async function outfitsOwned(user: any) {
  const catalog = await getCachedCatalog();
  const slotById = new Map(catalog.map((item) => [item.id, item.slot]));
  const inventory = user?.wardrobe?.inventory ?? {};
  let outfits = 0;
  for (const [id, count] of Object.entries(inventory)) {
    if ((Number(count) || 0) <= 0) continue;
    const slot = slotById.get(id);
    if (slot && slot !== 'container') outfits += 1;
  }
  return outfits;
}

export async function computeMilestoneValues(
  user: any,
  metrics: Set<MilestoneMetric>,
  timezone: string,
): Promise<Partial<Record<MilestoneMetric, number>>> {
  const userId = String(user._id);
  const values: Partial<Record<MilestoneMetric, number>> = {};
  const jobs: Promise<void>[] = [];
  const needs = (...keys: MilestoneMetric[]) => keys.some((key) => metrics.has(key));

  if (needs('tasks_done')) {
    jobs.push(tasksFinished(userId).then((n) => void (values.tasks_done = n)));
  }
  if (needs('outfits_owned')) {
    jobs.push(outfitsOwned(user).then((n) => void (values.outfits_owned = n)));
  }
  if (needs('focus_minutes')) {
    jobs.push(focusMinutes(userId).then((n) => void (values.focus_minutes = n)));
  }
  if (needs('trades_made')) {
    jobs.push(
      sumCounterAllTime(userId, 'trade_completed').then((n) => void (values.trades_made = n)),
    );
  }

  await Promise.all(jobs);
  return values;
}

function activeTracks(config: MilestoneConfig) {
  return config.isActive ? config.tracks.filter((track) => track.isActive) : [];
}

export async function buildMilestoneBoard(
  user: any,
  timezone: string,
): Promise<MilestoneBoardView> {
  const config = await loadMilestoneConfig();
  const tracks = activeTracks(config);
  if (tracks.length === 0) return { rows: [], claimableCount: 0 };
  const values = await computeMilestoneValues(
    user,
    new Set(tracks.map((track) => track.metric)),
    timezone,
  );
  const claims = readMilestoneClaims(user);
  const rows = sortMilestoneRows(
    tracks.map((track) =>
      buildMilestoneRow(track, values[track.metric] ?? 0, claims[track.id] ?? 0),
    ),
  );
  return {
    rows,
    claimableCount: rows.filter((row) => row.claimable).length,
  };
}

export type MilestoneClaimSummary = {
  fliesGranted: number;
  flyBalanceBefore: number;
  flyBalanceAfter: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  shieldsGranted: number;
};

export async function claimMilestoneStep(args: {
  userId: string;
  trackId: string;
  timezone: string;
}) {
  const { userId, trackId, timezone } = args;
  if (!TRACK_ID_PATTERN.test(trackId)) throw new Error('Unknown milestone');
  await connectMongo();
  const [config, user] = await Promise.all([
    loadMilestoneConfig(),
    UserModel.findById(userId),
  ]);
  if (!user) throw new Error('User not found');
  const track = activeTracks(config).find((entry) => entry.id === trackId);
  if (!track) throw new Error('This milestone is not running right now');

  const claimed = readMilestoneClaims(user)[trackId] ?? 0;
  if (!milestoneStepAt(track, claimed)) throw new Error('This milestone is already complete');
  const values = await computeMilestoneValues(user, new Set([track.metric]), timezone);
  const value = values[track.metric] ?? 0;
  const reached = reachedMilestoneSteps(track, value, claimed);
  if (reached.length === 0) throw new Error('Not reached yet');
  const step = reached[reached.length - 1];
  const nextClaimed = claimed + reached.length;

  const path = `milestones.${trackId}.claimed`;
  const lock = await UserModel.updateOne(
    { _id: userId, [path]: claimed > 0 ? claimed : { $in: [null, 0] } },
    { $set: { [path]: nextClaimed, [`milestones.${trackId}.at`]: new Date() } },
  );
  if (lock.modifiedCount === 0) throw new Error('Already claimed');

  const isPremium = new Date(user.premiumUntil ?? 0).getTime() > Date.now();
  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  const wardrobe = user.wardrobe as any;
  wardrobe.inventory = wardrobe.inventory ?? {};
  wardrobe.unseenItems = wardrobe.unseenItems ?? [];
  wardrobe.flies = wardrobe.flies ?? 0;
  wardrobe.backgrounds = wardrobe.backgrounds ?? { equipped: null, inventory: {} };
  wardrobe.backgrounds.inventory = wardrobe.backgrounds.inventory ?? {};

  const summary: MilestoneClaimSummary = {
    fliesGranted: 0,
    flyBalanceBefore: wardrobe.flies,
    flyBalanceAfter: wardrobe.flies,
    grantedItemIds: [],
    grantedBackgroundIds: [],
    shieldsGranted: 0,
  };
  let shieldsRequested = 0;
  for (const reward of reached.flatMap((entry) => entry.rewards)) {
    if (reward.type === 'FLIES') {
      const amount = Math.max(0, Math.floor(reward.amount ?? 0));
      wardrobe.flies += amount;
      summary.fliesGranted += amount;
    } else if (reward.type === 'SHIELD') {
      shieldsRequested += Math.max(1, Math.floor(reward.amount ?? 1));
    } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
      const inv = wardrobe.backgrounds.inventory;
      inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
      summary.grantedBackgroundIds.push(reward.backgroundId);
    } else if (reward.itemId) {
      const copies = reward.type === 'BOX' ? Math.max(1, reward.amount ?? 1) : 1;
      for (let i = 0; i < copies; i += 1) {
        wardrobe.inventory[reward.itemId] = (wardrobe.inventory[reward.itemId] ?? 0) + 1;
        wardrobe.unseenItems.push(reward.itemId);
        summary.grantedItemIds.push(reward.itemId);
      }
    }
  }
  summary.flyBalanceAfter = wardrobe.flies;

  if (shieldsRequested > 0) {
    const shieldConfig = await loadShieldConfig();
    const before = readShieldState(user);
    const next = grantShields(before, shieldConfig, isPremium, shieldsRequested);
    summary.shieldsGranted = Math.max(0, next.count - before.count);
    setShieldStateOn(user, next);
  }

  const milestones = { ...((user as any).milestones ?? {}) };
  milestones[trackId] = { ...(milestones[trackId] ?? {}), claimed: nextClaimed, at: new Date() };
  (user as any).milestones = milestones;
  user.markModified('milestones');
  user.markModified('wardrobe');
  await user.save();

  const nextRow = buildMilestoneRow(track, value, nextClaimed);
  return {
    summary,
    track,
    step,
    level: nextClaimed,
    levelsClaimed: reached.length,
    value,
    nextRow,
    isPremium,
  };
}
