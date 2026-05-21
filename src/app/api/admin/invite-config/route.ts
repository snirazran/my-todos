import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import InviteConfigModel from '@/lib/models/InviteConfig';
import { ensureInviteConfig } from '@/lib/inviteConfig/defaults';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import type { QuestReward, QuestRewardType } from '@/lib/quests/types';

const json = (body: unknown, init = 200) => NextResponse.json(body, { status: init });

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const config = await ensureInviteConfig();
    const catalog = await getFullCatalog();
    return json({ config, catalog });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const update: Record<string, unknown> = {};
    if (typeof body.headline === 'string') update.headline = body.headline;
    if (typeof body.subheading === 'string') update.subheading = body.subheading;
    if (typeof body.shareTitle === 'string') update.shareTitle = body.shareTitle;
    if (typeof body.shareMessage === 'string') update.shareMessage = body.shareMessage;
    if (Array.isArray(body.rewards)) {
      update.rewards = body.rewards.map((r: any, idx: number) => ({
        tier: Number.isFinite(r.tier) ? r.tier : idx + 1,
        label: String(r.label ?? `${ordinal(idx + 1)} friend`),
        description: typeof r.description === 'string' ? r.description : '',
        itemId: r.itemId ? String(r.itemId) : null,
        flies: typeof r.flies === 'number' && r.flies >= 0 ? r.flies : 0,
        imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : '',
        rewards: sanitizeRewards(r.rewards),
      }));
    }
    if (Array.isArray(body.giftOptions)) {
      update.giftOptions = body.giftOptions
        .filter((g: any) => g && typeof g.itemId === 'string' && g.itemId.length > 0)
        .map((g: any, idx: number) => ({
          id: typeof g.id === 'string' && g.id ? g.id : `gift_${idx}_${Date.now()}`,
          name: typeof g.name === 'string' ? g.name : '',
          itemId: String(g.itemId),
          imageUrl: typeof g.imageUrl === 'string' ? g.imageUrl : '',
        }));
    }
    update.updatedAt = new Date();

    await ensureInviteConfig();
    const result = await InviteConfigModel.findOneAndUpdate(
      { key: 'singleton' },
      { $set: update },
      { new: true, upsert: true },
    );

    return json({ ok: true, config: result });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

const VALID_REWARD_TYPES = new Set<QuestRewardType>(['FLIES', 'ITEM', 'BOX']);

function sanitizeRewards(input: unknown): QuestReward[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw): QuestReward | null => {
      if (!raw || typeof raw !== 'object') return null;
      const record = raw as Record<string, unknown>;
      if (!VALID_REWARD_TYPES.has(record.type as QuestRewardType)) return null;
      const type = record.type as QuestRewardType;
      const reward: QuestReward = { type };

      if (type === 'FLIES') {
        reward.amountMode = record.amountMode === 'random' ? 'random' : 'fixed';
        if (reward.amountMode === 'random') {
          reward.minAmount = Math.max(1, Number(record.minAmount) || 1);
          reward.maxAmount = Math.max(reward.minAmount, Number(record.maxAmount) || reward.minAmount);
        } else {
          reward.amount = Math.max(1, Number(record.amount) || 1);
        }
      } else {
        if (typeof record.itemId !== 'string' || !record.itemId) return null;
        reward.itemId = record.itemId;
        if (type === 'BOX') {
          reward.amountMode = 'fixed';
          reward.amount = Math.max(1, Number(record.amount) || 1);
        }
      }

      return reward;
    })
    .filter((reward): reward is QuestReward => !!reward);
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
