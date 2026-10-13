import type { TaskBondDoc } from '@/lib/models/TaskBond';
import PondFocusRoomModel from '@/lib/models/PondFocusRoom';
import PondKeepsakeModel from '@/lib/models/PondKeepsake';
import FocusSessionModel from '@/lib/models/FocusSession';
import UserModel from '@/lib/models/User';
import { equippedToIndices } from './indices';
import { buildById, getCachedCatalog } from '@/lib/skins/getCatalog';
import { KEEPSAKES, partyKeepsake, sharedOccurrences, sharedFocusOverlapSeconds, SHARED_FOCUS_MIN_SECONDS, type Keepsake, type KeepsakeId, type PondRoom } from './social';

export async function awardBuddyKeepsakes(bond: Pick<TaskBondDoc, 'fromUserId' | 'toUserId' | 'completedFrom' | 'completedTo'>) {
  const count = sharedOccurrences(bond.completedFrom, bond.completedTo).length;
  const unlocked = KEEPSAKES.filter((item) => item.kind === 'habits' && count >= item.required);
  if (!unlocked.length) return;
  await PondKeepsakeModel.bulkWrite([bond.fromUserId, bond.toUserId].flatMap((userId) =>
    unlocked.map((item) => ({ updateOne: {
      filter: { userId, keepsakeId: item.id },
      update: { $setOnInsert: { userId, keepsakeId: item.id, earnedAt: new Date(), partnerId: userId === bond.fromUserId ? bond.toUserId : bond.fromUserId } },
      upsert: true,
    } }))),
  );
}

export async function loadKeepsakes(userId: string, today: string, bonds: TaskBondDoc[]): Promise<Keepsake[]> {
  const best = bonds.map((bond) => ({ bond, days: sharedOccurrences(bond.completedFrom, bond.completedTo) })).sort((a, b) => b.days.length - a.days.length)[0];
  const month = today.slice(0, 7);
  const monthlyDays = new Set(bonds.flatMap((bond) => sharedOccurrences(bond.completedFrom, bond.completedTo)).filter((day) => day.startsWith(`${month}-`)));
  const party = partyKeepsake(month);
  const candidates: Array<{ id: string; partnerId?: string }> = KEEPSAKES.filter((item) => item.kind === 'habits' && (best?.days.length ?? 0) >= item.required)
    .map((item) => ({ id: item.id, partnerId: best?.bond.fromUserId === userId ? best.bond.toUserId : best?.bond.fromUserId }));
  if (monthlyDays.size >= party.required) candidates.push({ id: party.id });
  // Membership alone cannot earn a focus keepsake: both timer logs must have
  // banked real focus time and their attendance must overlap by five minutes.
  const rooms = await PondFocusRoomModel.find({ 'members.userId': userId, endsAt: { $lte: new Date() }, 'members.1': { $exists: true } }).sort({ endsAt: -1 }).limit(50).lean();
  if (rooms.length) {
    const sessionIds = rooms.flatMap((room) => room.members.map((member) => member.sessionId));
    const sessions = await FocusSessionModel.find({ id: { $in: sessionIds }, focusSeconds: { $gte: SHARED_FOCUS_MIN_SECONDS } }).select('userId id').lean();
    const focused = new Set(sessions.map((session) => `${session.userId}:${session.id}`));
    for (const room of rooms) {
      const mine = room.members.find((member) => member.userId === userId);
      if (!mine || !focused.has(`${userId}:${mine.sessionId}`)) continue;
      const other = room.members.find((member) => member.userId !== userId && focused.has(`${member.userId}:${member.sessionId}`) && sharedFocusOverlapSeconds(mine, member, room.endsAt) >= SHARED_FOCUS_MIN_SECONDS);
      if (other) { candidates.push({ id: 'quiet-company', partnerId: other.userId }); break; }
    }
  }
  if (candidates.length) await PondKeepsakeModel.bulkWrite(candidates.map((item) => ({ updateOne: {
    filter: { userId, keepsakeId: item.id },
    update: { $setOnInsert: { userId, keepsakeId: item.id, earnedAt: new Date(), partnerId: item.partnerId } }, upsert: true,
  } })));
  const earned = await PondKeepsakeModel.find({ userId }).sort({ earnedAt: -1 }).lean();
  const partners = await UserModel.find({ _id: { $in: earned.map((item) => item.partnerId).filter((id): id is string => !!id) } }).select('name frogName').lean();
  const names = new Map(partners.map((partner) => [partner._id, partner.name || partner.frogName || 'Friend']));
  const definitions: Array<Omit<Keepsake, 'earnedAt'>> = [
    ...KEEPSAKES.map((item) => ({ ...item, progress: item.kind === 'habits' ? Math.min(item.required, best?.days.length ?? 0) : 0 })),
    { ...party, progress: Math.min(party.required, monthlyDays.size) },
    ...earned.filter((item) => item.keepsakeId.startsWith('pond-party-') && item.keepsakeId !== party.id).map((item) => partyKeepsake(item.keepsakeId.slice(11))),
  ];
  return definitions.map((item) => {
    const award = earned.find((row) => row.keepsakeId === item.id);
    return { ...item, id: item.id as KeepsakeId, earnedAt: award?.earnedAt.toISOString() ?? null, progress: award ? item.required : item.progress, partnerName: award?.partnerId ? names.get(award.partnerId) : undefined };
  });
}

export async function loadPondRooms(userId: string, friendIds: string[]): Promise<PondRoom[]> {
  const rooms = await PondFocusRoomModel.find({ endsAt: { $gt: new Date() }, $or: [{ hostId: { $in: [userId, ...friendIds] } }, { 'members.userId': userId }], members: { $elemMatch: { leftAt: null } } }).sort({ startedAt: -1 }).limit(20).lean();
  if (!rooms.length) return [];
  const memberIds = Array.from(new Set(rooms.flatMap((room) => [room.hostId, ...room.members.map((member) => member.userId)])));
  const [users, catalog] = await Promise.all([UserModel.find({ _id: { $in: memberIds } }).select('name frogName wardrobe.equipped activeFrogodoroTimer').lean(), getCachedCatalog()]);
  const byId = buildById(catalog);
  const people = new Map(users.map((person) => [person._id, person]));
  return rooms.map((room) => ({
    id: room.id, hostId: room.hostId, hostName: people.get(room.hostId)?.name || people.get(room.hostId)?.frogName || 'Friend', duration: room.duration,
    endsAt: room.endsAt.toISOString(), joined: room.members.some((member) => member.userId === userId && !member.leftAt),
    members: room.members.filter((member) => !member.leftAt).map((member) => {
      const person = people.get(member.userId);
      const timer = person?.activeFrogodoroTimer;
      return { userId: member.userId, name: person?.name || person?.frogName || 'Friend', indices: equippedToIndices(person?.wardrobe?.equipped, byId), focusing: timer?.sessionId === member.sessionId && timer.status === 'running' && timer.phase === 'focus' && !!timer.endsAt && Date.parse(timer.endsAt) > Date.now(), isYou: member.userId === userId };
    }),
  }));
}
