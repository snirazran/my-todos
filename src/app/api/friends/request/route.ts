export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import FriendRequestModel, { type FriendRequestSource } from '@/lib/models/FriendRequest';
import { normalizeFriendCode, areFriends, createFriendship } from '@/lib/friends/code';
import { notifyFriendUpdate, notifyFriendsChanged } from '@/lib/taskSync';
import { sendBuddyPush, buddyDisplayName } from '@/lib/buddy/push';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

async function resolveTarget(body: {
  code?: string;
  toUserId?: string;
}): Promise<string | null> {
  if (body.toUserId) {
    const exists = await UserModel.exists({ _id: body.toUserId });
    return exists ? body.toUserId : null;
  }
  const code = normalizeFriendCode(body.code || '');
  if (!code) return null;
  const target = await UserModel.findOne({ friendCode: code }).select('_id').lean();
  return target?._id ?? null;
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { code?: string; toUserId?: string; source?: FriendRequestSource };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    await connectMongo();

    const targetId = await resolveTarget(body);
    if (!targetId) {
      return NextResponse.json({ error: 'No frog found with that code' }, { status: 404 });
    }
    if (targetId === userId) {
      return NextResponse.json({ error: "You can't add yourself" }, { status: 400 });
    }

    if (await areFriends(userId, targetId)) {
      return NextResponse.json({ ok: true, alreadyFriends: true });
    }

    // If the target already sent ME a pending request, accept it instead of
    // creating a competing one.
    const incoming = await FriendRequestModel.findOne({
      fromUserId: targetId,
      toUserId: userId,
      status: 'pending',
    });
    if (incoming) {
      incoming.status = 'accepted';
      incoming.respondedAt = new Date();
      await incoming.save();
      await createFriendship(userId, targetId, 'code');
      await recordAnalyticsEvent({
        userId,
        name: 'friend_request_accepted',
        properties: {
          request_source: incoming.source,
          auto_accepted: true,
          response_hours: Math.max(0, (Date.now() - new Date(incoming.createdAt).getTime()) / 3_600_000),
        },
      });
      void notifyFriendsChanged(userId);
      void buddyDisplayName(userId).then((name) =>
        sendBuddyPush(targetId, {
          title: `${name} accepted your request`,
          body: "You're friends now. Their daily wins earn you flies.",
          path: '/friends',
          type: 'friend_accepted',
        }),
      );
      return NextResponse.json({ ok: true, autoAccepted: true });
    }

    const source: FriendRequestSource = body.source ?? 'code';
    const result = await FriendRequestModel.updateOne(
      { fromUserId: userId, toUserId: targetId, status: 'pending' },
      { $setOnInsert: { fromUserId: userId, toUserId: targetId, status: 'pending', source, createdAt: new Date() } },
      { upsert: true },
    );

    // Push the incoming request to the recipient instantly (no refresh needed).
    if (result.upsertedCount > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'friend_request_sent',
        properties: { request_source: source },
      });
      void notifyFriendUpdate(targetId);
      void buddyDisplayName(userId).then((name) =>
        sendBuddyPush(targetId, {
          title: `${name} wants to be friends`,
          body: "Accept and you'll earn flies from each other's wins.",
          path: '/friends',
          type: 'friend_request',
        }),
      );
    }

    return NextResponse.json({ ok: true, pending: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send request' },
      { status: 500 },
    );
  }
}

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const requests = await FriendRequestModel.find({
      toUserId: userId,
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .lean();

    const senderIds = requests.map((r) => r.fromUserId);
    const senders = await UserModel.find({ _id: { $in: senderIds } })
      .select('name frogName')
      .lean();
    const senderById = new Map(senders.map((s) => [s._id, s]));

    const incoming = requests.map((r) => ({
      id: r._id,
      fromUserId: r.fromUserId,
      name: senderById.get(r.fromUserId)?.name ?? '',
      frogName: senderById.get(r.fromUserId)?.frogName ?? 'Frog',
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ incoming });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load requests' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { requestId?: string; action?: 'accept' | 'decline' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { requestId, action } = body;
  if (!requestId || (action !== 'accept' && action !== 'decline')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    await connectMongo();
    const request = await FriendRequestModel.findById(requestId);
    if (!request || request.toUserId !== userId) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (request.status !== 'pending') {
      return NextResponse.json({ ok: true, alreadyResolved: true });
    }

    request.status = action === 'accept' ? 'accepted' : 'declined';
    request.respondedAt = new Date();
    await request.save();

    await recordAnalyticsEvent({
      userId,
      name: action === 'accept' ? 'friend_request_accepted' : 'friend_request_declined',
      properties: {
        request_source: request.source,
        auto_accepted: false,
        response_hours: Math.max(0, (Date.now() - new Date(request.createdAt).getTime()) / 3_600_000),
      },
    });

    if (action === 'accept') {
      await createFriendship(request.fromUserId, request.toUserId, 'code');
      void notifyFriendUpdate(request.fromUserId);
      void buddyDisplayName(userId).then((name) =>
        sendBuddyPush(request.fromUserId, {
          title: `${name} accepted your request`,
          body: "You're friends now. Their daily wins earn you flies.",
          path: '/friends',
          type: 'friend_accepted',
        }),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to respond' },
      { status: 500 },
    );
  }
}
