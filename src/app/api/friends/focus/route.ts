import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import PondFocusRoomModel from '@/lib/models/PondFocusRoom';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import { areFriends } from '@/lib/friends/code';
import { ROOM_CAPACITY, ROOM_DURATIONS } from '@/lib/friends/social';
import { OPEN_FOCUS_ID, OPEN_FOCUS_LABEL } from '@/lib/focusSubject';
import { publishTimerEvent } from '@/lib/frogodoroEvents';
import { scheduleFrogodoroTimerProcessing } from '@/lib/frogodoroDelayedTimer';
import { fanOutTimerState } from '@/lib/frogodoroSync';
import { closeFocusSession } from '@/lib/frogodoroSessions';
import { notifyFriendsChanged } from '@/lib/taskSync';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  let body: { action?: unknown; roomId?: unknown; duration?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.action !== 'string' || !['create', 'join', 'leave'].includes(body.action)) return NextResponse.json({ error: 'Choose a room action.' }, { status: 400 });
  const roomId = typeof body.roomId === 'string' ? body.roomId : '';
  if (body.action !== 'create' && !roomId) return NextResponse.json({ error: 'Choose a focus room.' }, { status: 400 });
  const duration = body.duration ?? 25;
  if (body.action === 'create' && !ROOM_DURATIONS.some((value) => value === duration)) return NextResponse.json({ error: 'Choose 15, 25, or 45 minutes.' }, { status: 400 });

  let reservedSessionId: string | null = null;
  let reservedRoomId: string | null = null;
  try {
    await connectMongo();
    const now = new Date();
    const room = body.action === 'create' ? null : await PondFocusRoomModel.findOne({ id: roomId }).lean();
    if (body.action !== 'create' && !room) return NextResponse.json({ error: 'This room is no longer available.' }, { status: 404 });
    if (body.action === 'leave') {
      if (!room?.members.some((member) => member.userId === userId)) return NextResponse.json({ error: 'You are not in this room.' }, { status: 403 });
      await PondFocusRoomModel.updateOne({ id: roomId, members: { $elemMatch: { userId, leftAt: null } } }, { $set: { 'members.$.leftAt': now } });
      await UserModel.updateOne({ _id: userId, 'social.focusRoomId': roomId }, { $set: { 'social.focusRoomId': null, 'social.focusRoomEndsAt': null } });
      const latest = await PondFocusRoomModel.findOne({ id: roomId }).lean();
      if (latest && latest.members.every((member) => !!member.leftAt)) await PondFocusRoomModel.updateOne({ id: roomId }, { $min: { endsAt: now } });
      void notifyFriendsChanged(userId);
      return NextResponse.json({ ok: true });
    }
    if (room) {
      if (room.hostId !== userId && !(await areFriends(userId, room.hostId))) return NextResponse.json({ error: 'Only friends of the host can join.' }, { status: 403 });
      if (room.endsAt.getTime() - now.getTime() < 60_000 || room.members.every((member) => !!member.leftAt)) return NextResponse.json({ error: 'This room has finished. Start a fresh one together.' }, { status: 409 });
      const membership = room.members.find((member) => member.userId === userId);
      if (membership && !membership.leftAt) {
        const me = await UserModel.findById(userId).select('activeFrogodoroTimer frogodoroSeq').lean();
        return NextResponse.json({ ok: true, roomId, timer: me?.activeFrogodoroTimer ?? null, seq: me?.frogodoroSeq ?? 0, serverNow: Date.now() });
      }
      if (membership?.leftAt) return NextResponse.json({ error: 'You left this sitting. Join a new room after your timer finishes.' }, { status: 409 });
      if (room.members.filter((member) => !member.leftAt).length >= ROOM_CAPACITY) return NextResponse.json({ error: 'This room is full. Start another room with your friends.' }, { status: 409 });
    } else if (!(await FriendshipModel.exists({ $or: [{ userA: userId }, { userB: userId }] }))) {
      return NextResponse.json({ error: 'Invite a friend to your pond first.' }, { status: 400 });
    }
    const id = room?.id ?? randomUUID();
    const endsAt = room?.endsAt ?? new Date(now.getTime() + Number(duration) * 60_000);
    const remaining = Math.max(60, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
    const sessionId = randomUUID();
    const timer: ActiveFrogodoroTimer = {
      taskId: OPEN_FOCUS_ID, subjectKind: 'open', subjectLabel: 'Focus together', sessionId,
      phase: 'focus', status: 'running', timeLeft: remaining, endsAt: endsAt.toISOString(),
      settings: { focusDuration: remaining / 60, breakDuration: 5, autoStartBreaks: false, timerSound: 'dreamscape' },
      sessionStats: { focusTime: 0, breakTime: 0 }, updatedAt: now.toISOString(), finished: false, savedElapsed: 0,
    };
    // Reserve membership and the personal timer in one conditional write.
    // Joining cannot replace a running/paused session, even on another device.
    const previous = await UserModel.findOneAndUpdate({ _id: userId, $and: [
      { $or: [{ activeFrogodoroTimer: null }, { 'activeFrogodoroTimer.finished': true }] },
      { $or: [{ 'social.focusRoomId': null }, { 'social.focusRoomEndsAt': { $lte: now } }] },
    ] }, { $set: { activeFrogodoroTimer: timer, 'social.focusRoomId': id, 'social.focusRoomEndsAt': endsAt }, $inc: { frogodoroSeq: 1 } }).lean();
    if (!previous) return NextResponse.json({ error: 'Finish your current timer or leave your other room first.', code: 'timer_busy' }, { status: 409 });
    reservedSessionId = sessionId;
    reservedRoomId = id;
    try {
      await TaskModel.updateOne({ userId, id: OPEN_FOCUS_ID }, { $set: { type: 'focus-area', text: OPEN_FOCUS_LABEL }, $unset: { deletedAt: 1 }, $setOnInsert: { userId, id: OPEN_FOCUS_ID, order: 0, completed: false, tags: [] } }, { upsert: true });
      const member = { userId, sessionId, joinedAt: now, leftAt: null };
      if (!room) await PondFocusRoomModel.create({ id, hostId: userId, duration: Number(duration), startedAt: now, endsAt, members: [member] });
      else {
        const joined = await PondFocusRoomModel.updateOne({ id, endsAt: { $gt: new Date(Date.now() + 60_000) }, members: { $elemMatch: { leftAt: null } }, 'members.userId': { $ne: userId }, $expr: { $lt: [{ $size: { $filter: { input: '$members', as: 'member', cond: { $eq: ['$$member.leftAt', null] } } } }, ROOM_CAPACITY] } }, { $push: { members: member } });
        if (!joined.modifiedCount) throw new Error('The room filled up or finished. Try another room.');
      }
    } catch (error) {
      await UserModel.updateOne({ _id: userId, 'activeFrogodoroTimer.sessionId': sessionId }, { $set: { activeFrogodoroTimer: previous.activeFrogodoroTimer ?? null, 'social.focusRoomId': previous.social?.focusRoomId ?? null, 'social.focusRoomEndsAt': previous.social?.focusRoomEndsAt ?? null } });
      reservedSessionId = null;
      console.error('Pond room reservation failed:', error);
      return NextResponse.json({ error: 'This room is no longer available. Try another room.' }, { status: 409 });
    }
    reservedSessionId = null;
    if (previous.activeFrogodoroTimer?.sessionId) await closeFocusSession(userId, previous.activeFrogodoroTimer.sessionId);
    const seq = (previous.frogodoroSeq ?? 0) + 1;
    publishTimerEvent(userId, timer, seq);
    scheduleFrogodoroTimerProcessing({ userId, endsAt: timer.endsAt! });
    void fanOutTimerState(userId, timer, previous.liveActivity, previous.liveActivityStartToken, previous.liveActivityStartClockSkewMs, previous.notificationPrefs).catch((error) => console.error('Pond timer fan-out failed:', error));
    void notifyFriendsChanged(userId);
    void recordAnalyticsEvent({ userId, name: 'timer_started', properties: { source: 'friends_room', duration_minutes: remaining / 60, room_action: body.action } }).catch(() => {});
    return NextResponse.json({ ok: true, roomId: id, timer, seq, serverNow: Date.now() });
  } catch (error) {
    if (reservedSessionId) await UserModel.updateOne({ _id: userId, 'activeFrogodoroTimer.sessionId': reservedSessionId }, { $set: { activeFrogodoroTimer: null, 'social.focusRoomId': null, 'social.focusRoomEndsAt': null } }).catch(() => {});
    if (reservedRoomId) await PondFocusRoomModel.updateOne({ id: reservedRoomId, 'members.userId': userId }, { $set: { 'members.$.leftAt': new Date() } }).catch(() => {});
    console.error('Pond room failed:', error);
    return NextResponse.json({ error: 'Could not open the room. Try again.' }, { status: 500 });
  }
}
