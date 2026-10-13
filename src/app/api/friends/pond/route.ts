import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import FriendshipModel from '@/lib/models/Friendship';
import TaskBondModel from '@/lib/models/TaskBond';
import TaskModel from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import PondKeepsakeModel from '@/lib/models/PondKeepsake';
import { loadKeepsakes, loadPondRooms } from '@/lib/friends/pondServer';
import { sharedOccurrences, keepsakeEmoji, type PondData, type PondHabit, type KeepsakeId } from '@/lib/friends/social';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices } from '@/lib/friends/indices';
import { getZonedToday } from '@/lib/utils';
import { occursOnDate } from '@/lib/taskOccurrence';
import { isOneTimeParams, ONE_TIME_OCCURRENCE, buddyScheduleSummary } from '@/lib/buddy/bond';
import { resolveEconomyTimezone, economyWeekKey } from '@/lib/economy/guards';
import { loadFlyEconomyConfig } from '@/lib/economy/config';
import { shiftYMD } from '@/lib/weekStart';
import { countPaidOccurrencesInRange } from '@/lib/economy/ledger';
import { notifyFriendsChanged } from '@/lib/taskSync';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  try {
    await connectMongo();
    const tz = await resolveEconomyTimezone(userId, req.nextUrl.searchParams.get('tz'));
    const today = getZonedToday(tz);
    const [edges, bonds, me, catalog, config] = await Promise.all([
      FriendshipModel.find({ $or: [{ userA: userId }, { userB: userId }] }).lean(),
      TaskBondModel.find({ $or: [{ fromUserId: userId }, { toUserId: userId }], status: { $in: ['active', 'severed'] } }).lean(),
      UserModel.findById(userId).select('social duoWeekGift').lean(), getCachedCatalog(), loadFlyEconomyConfig(),
    ]);
    const friendIds = edges.map((edge) => edge.userA === userId ? edge.userB : edge.userA);
    const activeBonds = bonds.filter((bond) => bond.status === 'active' && friendIds.includes(bond.fromUserId === userId ? bond.toUserId : bond.fromUserId));
    const weekStart = economyWeekKey(today);
    const [tasks, partners, keepsakes, rooms, weekCounts] = await Promise.all([
      TaskModel.find({ userId, bondId: { $in: activeBonds.map((bond) => bond.bondId) }, deletedAt: { $exists: false } }).lean(),
      UserModel.find({ _id: { $in: friendIds } }).select('name frogName wardrobe.equipped').lean(),
      loadKeepsakes(userId, today, bonds), loadPondRooms(userId, friendIds),
      Promise.all(activeBonds.map((bond) => countPaidOccurrencesInRange(userId, weekStart, shiftYMD(weekStart, 6), 'buddy', { bondId: bond.bondId }))),
    ]);
    const byId = buildById(catalog);
    const people = new Map(partners.map((partner) => [partner._id, partner]));
    const habits: PondHabit[] = activeBonds.map((bond, index) => {
      const from = bond.fromUserId === userId;
      const partnerId = from ? bond.toUserId : bond.fromUserId;
      const person = people.get(partnerId);
      const task = tasks.find((row) => row.bondId === bond.bondId && occursOnDate(row, today, tz));
      const occurrence = isOneTimeParams(bond.createParams) ? ONE_TIME_OCCURRENCE : today;
      return {
        bondId: bond.bondId, taskId: task?.id ?? null, text: task?.text || bond.initialText,
        partnerId, partnerName: person?.name || person?.frogName || 'Friend', partnerIndices: equippedToIndices(person?.wardrobe?.equipped, byId),
        schedule: buddyScheduleSummary(bond.createParams), dueToday: !!task,
        mineDone: (from ? bond.completedFrom : bond.completedTo).includes(occurrence), partnerDone: (from ? bond.completedTo : bond.completedFrom).includes(occurrence),
        togetherCount: sharedOccurrences(bond.completedFrom, bond.completedTo).length, streak: bond.streak?.count ?? 0, weekProgress: weekCounts[index],
      };
    }).sort((a, b) => Number(b.dueToday && !b.mineDone) - Number(a.dueToday && !a.mineDone) || Number(b.dueToday) - Number(a.dueToday) || a.text.localeCompare(b.text));
    const duo = me?.duoWeekGift;
    const data: PondData = { today, serverNow: Date.now(), habits, rooms, keepsakes, pinnedKeepsakeId: (me?.social?.pinnedKeepsakeId as KeepsakeId) ?? null,
      weekReward: { required: config.buddy.duoWeekTasks, giftName: byId[config.buddy.duoWeekGiftItemId]?.name ?? 'a gift', enabled: config.buddy.duoWeekTasks > 0 && !!config.buddy.duoWeekGiftItemId && config.buddy.duoWeekPerWeek > 0, earned: duo?.weekKey === weekStart && (duo.count ?? 0) > 0 },
    };
    return NextResponse.json(data);
  } catch (error) { console.error('Pond could not load:', error); return NextResponse.json({ error: 'Your pond could not load. Try again.' }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  let body: { keepsakeId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Choose a keepsake from your collection.' }, { status: 400 });
  const id = body.keepsakeId;
  if (id !== null && (typeof id !== 'string' || !keepsakeEmoji(id))) return NextResponse.json({ error: 'Choose a keepsake from your collection.' }, { status: 400 });
  try {
    await connectMongo();
    if (id && !(await PondKeepsakeModel.exists({ userId, keepsakeId: id }))) return NextResponse.json({ error: 'Earn this keepsake first.' }, { status: 403 });
    await UserModel.updateOne({ _id: userId }, { $set: { 'social.pinnedKeepsakeId': id } });
    void notifyFriendsChanged(userId);
    return NextResponse.json({ ok: true, pinnedKeepsakeId: id });
  } catch { return NextResponse.json({ error: 'Could not wear this keepsake. Try again.' }, { status: 500 }); }
}
