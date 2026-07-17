import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import { requireUserId } from '@/lib/auth';
import UserModel from '@/lib/models/User';
import FlyGameRunModel from '@/lib/models/FlyGameRun';
import {
  FLY_GAME_DURATION_MS,
  calculateFlyGameScore,
  flyGameReward,
  sanitizeFlyGameName,
  seededFlyGameRandom,
  selectFlyGameKind,
  type FlyGameEvent,
  type FlyGameStats,
} from '@/lib/flyGame';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

function safeTokenMatch(token: unknown, storedHash: string) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 160) return false;
  const candidate = Buffer.from(tokenHash(token));
  const stored = Buffer.from(storedHash);
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

async function optionalUserId() {
  try {
    return await requireUserId();
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  await connectMongo();
  const limit = Math.min(25, Math.max(5, Number(req.nextUrl.searchParams.get('limit')) || 10));
  const [leaders, totalRuns] = await Promise.all([
    FlyGameRunModel.find({ verified: true })
      .sort({ score: -1, maxCombo: -1, submittedAt: 1 })
      .limit(limit)
      .select('playerName score catches maxCombo submittedAt')
      .lean(),
    FlyGameRunModel.countDocuments({ verified: true }),
  ]);

  const userId = await optionalUserId();
  let claimed = false;
  let playerName = '';
  let bestScore = 0;
  if (userId) {
    const [user, bestRun] = await Promise.all([
      UserModel.findById(userId).select('name flyGameReward').lean() as Promise<
        { name?: string; flyGameReward?: { claimedAt?: Date } } | null
      >,
      FlyGameRunModel.findOne({ verified: true, ownerUserId: userId })
        .sort({ score: -1 })
        .select('score')
        .lean(),
    ]);
    claimed = !!user?.flyGameReward?.claimedAt;
    playerName = user?.name ?? '';
    bestScore = bestRun?.score ?? 0;
  }

  return json({
    leaders: leaders.map((entry, index) => ({
      rank: index + 1,
      name: entry.playerName,
      score: entry.score ?? 0,
      catches: entry.catches ?? 0,
      maxCombo: entry.maxCombo ?? 0,
    })),
    totalRuns,
    rewardClaimed: claimed,
    playerName,
    bestScore,
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  await connectMongo();
  const action = body.action;

  if (action === 'start') {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const seed = randomBytes(4).readUInt32BE(0);
    const userId = await optionalUserId();
    await FlyGameRunModel.create({
      _id: id,
      tokenHash: tokenHash(token),
      seed,
      ownerUserId: userId,
      playerName: sanitizeFlyGameName(body.playerName),
      verified: false,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return json({ runId: id, token, seed, durationMs: FLY_GAME_DURATION_MS });
  }

  if (action === 'submit') {
    const runId = typeof body.runId === 'string' ? body.runId : '';
    const run = await FlyGameRunModel.findById(runId).select('+tokenHash +seed');
    if (!run || !safeTokenMatch(body.token, run.tokenHash) || run.submittedAt) {
      return json({ error: 'This run is no longer valid' }, 409);
    }

    const raw = body.stats as Partial<FlyGameStats> | undefined;
    const stats: FlyGameStats = {
      score: Number(raw?.score),
      catches: Number(raw?.catches),
      misses: Number(raw?.misses),
      goldHits: Number(raw?.goldHits),
      timeHits: Number(raw?.timeHits),
      trapHits: Number(raw?.trapHits),
      maxCombo: Number(raw?.maxCombo),
      durationMs: Number(raw?.durationMs),
    };
    const values = Object.values(stats);
    const expectedScore = calculateFlyGameScore(stats);
    const elapsed = Date.now() - run.createdAt.getTime();
    const rawEvents = Array.isArray(body.events) ? body.events : [];
    const events: FlyGameEvent[] = rawEvents.map((event) => ({
      t: Number(event?.t),
      action: event?.action,
      slot: event?.slot === undefined ? undefined : Number(event.slot),
      kind: event?.kind,
    }));
    const random = seededFlyGameRandom(run.seed);
    const slotKinds = Array.from({ length: 8 }, () => selectFlyGameKind(random(), 0));
    let eventCatches = 0;
    let eventMisses = 0;
    let eventGold = 0;
    let eventTime = 0;
    let eventTraps = 0;
    let eventCombo = 0;
    let eventMaxCombo = 0;
    let previousAt = -100;
    const lastSlotAt = Array.from({ length: 8 }, () => -1_000);
    const recentActions: number[] = [];
    let eventsValid = events.length === stats.catches + stats.trapHits + stats.misses;
    for (const event of events) {
      const eventValid =
        Number.isInteger(event.t) &&
        event.t >= 0 &&
        event.t <= stats.durationMs + 100 &&
        event.t >= previousAt + 24 &&
        (event.action === 'hit' || event.action === 'miss');
      if (!eventValid) {
        eventsValid = false;
        break;
      }
      previousAt = event.t;
      recentActions.push(event.t);
      while (recentActions.length && recentActions[0] < event.t - 1_000) recentActions.shift();
      if (recentActions.length > 14) eventsValid = false;
      if (event.action === 'miss') {
        eventMisses += 1;
        eventCombo = 0;
        continue;
      }
      const slot = event.slot ?? -1;
      if (
        !Number.isInteger(slot) ||
        slot < 0 ||
        slot >= slotKinds.length ||
        event.t - lastSlotAt[slot] < 90 ||
        event.kind !== slotKinds[slot]
      ) {
        eventsValid = false;
        break;
      }
      lastSlotAt[slot] = event.t;
      if (event.kind === 'trap') {
        eventTraps += 1;
        eventCombo = 0;
      } else {
        eventCatches += 1;
        eventCombo += 1;
        eventMaxCombo = Math.max(eventMaxCombo, eventCombo);
        if (event.kind === 'gold') eventGold += 1;
        if (event.kind === 'time') eventTime += 1;
      }
      slotKinds[slot] = selectFlyGameKind(random(), event.t);
    }
    eventsValid =
      eventsValid &&
      eventCatches === stats.catches &&
      eventMisses === stats.misses &&
      eventGold === stats.goldHits &&
      eventTime === stats.timeHits &&
      eventTraps === stats.trapHits &&
      eventMaxCombo === stats.maxCombo;
    const valid =
      values.every(Number.isFinite) &&
      values.every((value) => value >= 0 && Number.isInteger(value)) &&
      stats.catches >= stats.goldHits + stats.timeHits &&
      stats.catches <= 90 &&
      stats.misses <= 180 &&
      stats.trapHits <= 30 &&
      stats.maxCombo <= stats.catches &&
      stats.durationMs >= FLY_GAME_DURATION_MS - 1_500 &&
      stats.durationMs <= FLY_GAME_DURATION_MS + stats.timeHits * 2_000 + 3_000 &&
      elapsed >= FLY_GAME_DURATION_MS - 2_000 &&
      elapsed <= 5 * 60_000 &&
      stats.score === expectedScore &&
      eventsValid;

    if (!valid) return json({ error: 'Run verification failed' }, 422);

    run.playerName = sanitizeFlyGameName(body.playerName ?? run.playerName);
    run.score = stats.score;
    run.catches = stats.catches;
    run.misses = stats.misses;
    run.goldHits = stats.goldHits;
    run.timeHits = stats.timeHits;
    run.trapHits = stats.trapHits;
    run.maxCombo = stats.maxCombo;
    run.durationMs = stats.durationMs;
    const previousBest = run.ownerUserId
      ? await FlyGameRunModel.findOne({
          verified: true,
          ownerUserId: run.ownerUserId,
          _id: { $ne: run._id },
        }).sort({ score: -1 }).select('score').lean()
      : null;
    run.personalBest = stats.score > (previousBest?.score ?? 0);
    run.verified = true;
    run.submittedAt = new Date();
    run.expiresAt = undefined;
    await run.save();

    const rank = await FlyGameRunModel.countDocuments({
      verified: true,
      $or: [
        { score: { $gt: stats.score } },
        { score: stats.score, maxCombo: { $gt: stats.maxCombo } },
      ],
    }) + 1;

    return json({
      verified: true,
      rank,
      reward: flyGameReward(stats.score),
      personalBest: run.personalBest,
    });
  }

  /* Gift rewards are intentionally disabled in Fly Catch.
  if (action === 'claim-run-gifts') {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return json({ error: 'Sign in to claim gifts caught during the run' }, 401);
    }
    const runId = typeof body.runId === 'string' ? body.runId : '';
    if (typeof body.token !== 'string' || body.token.length < 32 || body.token.length > 160) {
      return json({ error: 'Reward link is invalid' }, 409);
    }
    const validRun = await FlyGameRunModel.findOne({
      _id: runId,
      verified: true,
      tokenHash: tokenHash(body.token),
    }).select('+tokenHash giftHits runGiftsClaimedAt').lean();
    if (!validRun) return json({ error: 'Reward link is invalid' }, 409);
    if (validRun.runGiftsClaimedAt) return json({ error: 'Run gifts already claimed' }, 409);
    const count = await grantRunGifts(runId, userId);
    if (!count) return json({ error: 'No gifts were caught in this run' }, 409);
    return json({ claimed: true, giftBoxId: 'gift_box_1', count });
  }

  if (action === 'claim-best-gift') {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return json({ error: 'Sign in to claim your high-score gift' }, 401);
    }

    const runId = typeof body.runId === 'string' ? body.runId : '';
    if (typeof body.token !== 'string' || body.token.length < 32 || body.token.length > 160) {
      return json({ error: 'Reward link is invalid' }, 409);
    }
    const run = await FlyGameRunModel.findOneAndUpdate(
      {
        _id: runId,
        verified: true,
        personalBest: true,
        tokenHash: tokenHash(body.token),
        bestGiftClaimedAt: { $exists: false },
        $or: [
          { ownerUserId: userId },
          { ownerUserId: { $exists: false } },
          { ownerUserId: null },
        ],
      },
      {
        $set: {
          ownerUserId: userId,
          bestGiftClaimedBy: userId,
          bestGiftClaimedAt: new Date(),
        },
      },
      { new: true, select: '+tokenHash' },
    );
    if (!run) return json({ error: 'Gift already claimed or score is not a new best' }, 409);

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $inc: { 'wardrobe.inventory.gift_box_1': 1 },
        $addToSet: { 'wardrobe.unseenItems': 'gift_box_1' },
      },
      { new: true },
    );
    if (!user) {
      await FlyGameRunModel.updateOne(
        { _id: runId, bestGiftClaimedBy: userId },
        { $unset: { bestGiftClaimedBy: 1, bestGiftClaimedAt: 1 } },
      );
      return json({ error: 'Could not add the gift to your inventory' }, 404);
    }
    await recordAnalyticsEvent({
      userId,
      name: 'fly_game_high_score_gift',
      properties: { score: run.score ?? 0, gift_box_id: 'gift_box_1' },
    });
    return json({ claimed: true, giftBoxId: 'gift_box_1' });
  }

  */

  if (action === 'claim') {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return json({ error: 'Sign in to bank your flies' }, 401);
    }

    const runId = typeof body.runId === 'string' ? body.runId : '';
    if (typeof body.token !== 'string' || body.token.length < 32 || body.token.length > 160) {
      return json({ error: 'Reward link is invalid' }, 409);
    }
    const run = await FlyGameRunModel.findOneAndUpdate(
      {
        _id: runId,
        verified: true,
        tokenHash: tokenHash(body.token),
        claimedBy: { $exists: false },
      },
      { $set: { claimedBy: userId, claimedAt: new Date() } },
      { new: true, select: '+tokenHash' },
    );
    if (!run) {
      return json({ error: 'Reward link is invalid or already claimed' }, 409);
    }

    const amount = flyGameReward(run.score ?? 0);
    const user = await UserModel.findOneAndUpdate(
      { _id: userId, 'flyGameReward.claimedAt': { $exists: false } },
      {
        $inc: { 'wardrobe.flies': amount },
        $set: {
          flyGameReward: { runId, score: run.score ?? 0, amount, claimedAt: new Date() },
        },
      },
      { new: true },
    );
    if (!user) {
      await FlyGameRunModel.updateOne(
        { _id: runId, claimedBy: userId },
        { $unset: { claimedBy: 1, claimedAt: 1 } },
      );
      return json({ error: 'Your fly-game starter reward was already claimed' }, 409);
    }

    run.rewardAmount = amount;
    run.ownerUserId = userId;
    await run.save();
    await recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: { source: 'fly_game', fly_amount: amount },
    });
    return json({ claimed: true, amount, balance: user.wardrobe?.flies ?? amount });
  }

  return json({ error: 'Unknown action' }, 400);
}
