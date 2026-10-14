import mongoose from 'mongoose';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { shiftYMD } from '@/lib/weekStart';
import type { LeapConfigView, LeapJoin, LeapWeekResult } from './types';

export type LeapState = {
  v: 2;
  league: number;
  bestLeague: number;
  plusPaidThrough: number;
  landed: number;
  settledThrough: string;
  startedWeek: string;
  coveredWeek: string;
  luck: { sinceDrop: number; firstDone: boolean };
  forgoneFlies: number;
  hopsTotal: number;
  pendingResult: LeapWeekResult | null;
  pendingJoin: LeapJoin | null;
};

const n = (value: unknown, min = 0) =>
  Math.max(min, Math.floor(Number(value) || 0));
const s = (value: unknown) => (typeof value === 'string' ? value : '');

function readJoin(raw: unknown): LeapJoin | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as { weekKey?: unknown; giftIds?: unknown };
  return {
    weekKey: s(entry.weekKey),
    giftIds: Array.isArray(entry.giftIds)
      ? entry.giftIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

export function readLeapState(user: any): LeapState | null {
  const raw = user?.quests?.leap;
  if (!raw || typeof raw !== 'object' || raw.v !== 2) return null;
  return {
    v: 2,
    league: n(raw.league),
    bestLeague: n(raw.bestLeague),
    plusPaidThrough: n(raw.plusPaidThrough),
    landed: n(raw.landed),
    settledThrough: s(raw.settledThrough),
    startedWeek: s(raw.startedWeek),
    coveredWeek: s(raw.coveredWeek),
    luck: {
      sinceDrop: n(raw.luck?.sinceDrop),
      firstDone: !!raw.luck?.firstDone,
    },
    forgoneFlies: n(raw.forgoneFlies),
    hopsTotal: n(raw.hopsTotal),
    pendingResult:
      raw.pendingResult && typeof raw.pendingResult === 'object'
        ? (raw.pendingResult as LeapWeekResult)
        : null,
    pendingJoin: readJoin(raw.pendingJoin),
  };
}

async function continueLegacyLeapTasks(userId: string, currentWeek: string) {
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    const pacts = await db
      .collection('pacts')
      .find(
        { userId, weekKey: { $gte: currentWeek } },
        { projection: { taskIds: 1, weekKey: 1 } },
      )
      .toArray();
    for (const pact of pacts) {
      const taskIds = Array.isArray(pact.taskIds) ? pact.taskIds : [];
      if (!taskIds.length || typeof pact.weekKey !== 'string') continue;
      await db.collection('tasks').updateMany(
        {
          userId,
          id: { $in: taskIds },
          type: 'weekly',
          repeatEndDate: shiftYMD(pact.weekKey, 6),
        },
        { $unset: { repeatEndDate: '' } },
      );
    }
  } catch {
    return;
  }
}

export async function ensureLeapState(args: {
  userId: string;
  user: any;
  currentWeek: string;
  config: LeapConfigView;
}): Promise<LeapState> {
  const existing = readLeapState(args.user);
  if (existing) return existing;

  await connectMongo();
  const draft = args.user?.quests?.leap;
  const legacy = args.user?.quests?.pactStreak ?? {};
  const top = Math.max(0, args.config.leagues.length - 1);
  const twoWeeksAgo = shiftYMD(args.currentWeek, -14);
  const legacyWeeks = n(legacy.weeks);
  const lastKept = s(legacy.lastKeptWeek);
  const alive = legacyWeeks > 0 && !!lastKept && lastKept >= twoWeeksAgo;
  const league = alive ? Math.min(top, 2, legacyWeeks) : 0;
  const fromDraft = draft && typeof draft === 'object' && draft.v === 1;

  const state: LeapState = {
    v: 2,
    league,
    bestLeague: league,
    plusPaidThrough: league,
    landed: fromDraft ? n(draft.landed) : 0,
    settledThrough:
      (fromDraft && s(draft.settledThrough)) || shiftYMD(args.currentWeek, -7),
    startedWeek: (fromDraft && s(draft.startedWeek)) || args.currentWeek,
    coveredWeek: '',
    luck: {
      sinceDrop: fromDraft ? n(draft.luck?.sinceDrop) : 0,
      firstDone: fromDraft ? !!draft.luck?.firstDone : false,
    },
    forgoneFlies: fromDraft ? n(draft.forgoneFlies) : n(legacy.forgoneFlies),
    hopsTotal: fromDraft ? n(draft.hopsTotal) : 0,
    pendingResult: null,
    pendingJoin: null,
  };

  const res = await UserModel.updateOne(
    { _id: args.userId, 'quests.leap.v': { $ne: 2 } },
    { $set: { 'quests.leap': state } },
  );
  if (res.modifiedCount === 0) {
    const fresh = await UserModel.findById(args.userId).select('quests').lean();
    return readLeapState(fresh) ?? state;
  }
  if (!fromDraft && legacy && typeof legacy === 'object' && Object.keys(legacy).length) {
    await continueLegacyLeapTasks(args.userId, args.currentWeek);
  }
  return state;
}

export function leagueMultiplier(config: LeapConfigView, league: number) {
  const entry = config.leagues[Math.min(Math.max(0, league), config.leagues.length - 1)];
  return Math.max(1, entry?.multiplier ?? 1);
}

export function clampLeague(config: LeapConfigView, league: number) {
  return Math.min(Math.max(0, league), Math.max(0, config.leagues.length - 1));
}
