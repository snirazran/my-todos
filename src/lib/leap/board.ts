import connectMongo from '@/lib/mongoose';
import LeapWeekModel from '@/lib/models/LeapWeek';
import UserModel from '@/lib/models/User';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices, type FrogIndices } from '@/lib/friends/indices';
import { sanitizeFlyGameName } from '@/lib/flyGame';

export const LEAP_BOARD_TOP = 10;
export const LEAP_BOARD_COUNT_FROM = 100;
const CACHE_MS = 60_000;

export type LeapBoardEntry = {
  rank: number;
  frogName: string;
  indices: FrogIndices;
  hops: number;
  isMe: boolean;
};

export type LeapBoardView = {
  weekKey: string;
  league: number;
  total: number | null;
  myRank: number;
  myHops: number;
  top: LeapBoardEntry[];
  faces: FrogIndices[];
};

type CachedBoard = {
  at: number;
  total: number;
  top: Array<{ userId: string; hops: number }>;
  people: Map<string, { frogName: string; indices: FrogIndices }>;
};

const cache = new Map<string, CachedBoard>();

async function loadBoard(weekKey: string, league: number): Promise<CachedBoard> {
  const key = `${weekKey}:${league}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;

  const match = { weekKey, league, 'hopKeys.0': { $exists: true } };
  const [total, top] = await Promise.all([
    LeapWeekModel.countDocuments(match),
    LeapWeekModel.aggregate<{ userId: string; hops: number }>([
      { $match: match },
      { $project: { _id: 0, userId: 1, hops: { $size: '$hopKeys' }, updatedAt: 1 } },
      { $sort: { hops: -1, updatedAt: 1 } },
      { $limit: LEAP_BOARD_TOP },
    ]),
  ]);

  const users = top.length
    ? await UserModel.find(
        { _id: { $in: top.map((row) => row.userId) } },
        { frogName: 1, 'wardrobe.equipped': 1 },
      ).lean<Array<{ _id: unknown; frogName?: string; wardrobe?: { equipped?: Record<string, string | null> } }>>()
    : [];
  const byId = buildById(await getCachedCatalog());
  const people = new Map<string, { frogName: string; indices: FrogIndices }>();
  users.forEach((user) => {
    people.set(String(user._id), {
      frogName: sanitizeFlyGameName(user.frogName ?? 'Frog'),
      indices: equippedToIndices(user.wardrobe?.equipped, byId),
    });
  });

  const board: CachedBoard = { at: Date.now(), total, top, people };
  cache.set(key, board);
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return board;
}

export async function getLeapBoard(userId: string): Promise<LeapBoardView | null> {
  await connectMongo();
  const mine = await LeapWeekModel.findOne({ userId })
    .sort({ weekKey: -1 })
    .select({ weekKey: 1, league: 1, hopKeys: 1 })
    .lean<{ weekKey: string; league?: number; hopKeys?: string[] }>();
  if (!mine) return null;
  const league = Math.max(0, Math.floor(Number(mine.league) || 0));
  const myHops = mine.hopKeys?.length ?? 0;
  const board = await loadBoard(mine.weekKey, league);

  const ahead =
    myHops > 0
      ? await LeapWeekModel.countDocuments({
          weekKey: mine.weekKey,
          league,
          [`hopKeys.${myHops}`]: { $exists: true },
        })
      : board.total;
  const total = Math.max(board.total, myHops > 0 ? ahead + 1 : board.total);
  const myRank = ahead + 1;

  const top = board.top.map((row, index) => {
    const person = board.people.get(row.userId);
    return {
      rank: index + 1,
      frogName: person?.frogName ?? 'Frog',
      indices: person?.indices ?? { skin: 0, hat: 0, body: 0, hand_item: 0 },
      hops: row.hops,
      isMe: row.userId === userId,
    };
  });

  return {
    weekKey: mine.weekKey,
    league,
    total: total >= LEAP_BOARD_COUNT_FROM ? total : null,
    myRank,
    myHops,
    top,
    faces: top.filter((entry) => !entry.isMe).slice(0, 3).map((entry) => entry.indices),
  };
}
