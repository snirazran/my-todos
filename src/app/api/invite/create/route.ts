import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import ReferralModel from '@/lib/models/Referral';
import InviteConfigModel from '@/lib/models/InviteConfig';
import { ensureInviteConfig } from '@/lib/inviteConfig/defaults';
import type { BuddyCreateParams } from '@/lib/models/TaskBond';
import TaskModel from '@/lib/models/Task';
import {
  paramsFromTask,
  isShareableParams,
  type ExistingBuddyTask,
} from '@/lib/buddy/bond';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function parseBuddyTask(raw: any): BuddyCreateParams | null {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text ?? '').trim();
  if (!text) return null;
  const params: BuddyCreateParams = {
    text,
    repeat: raw.repeat,
    days: Array.isArray(raw.days) ? raw.days.map(Number) : undefined,
    dates: Array.isArray(raw.dates) ? raw.dates.map(String) : undefined,
    repeatRule: raw.repeatRule,
    repeatEndDate: raw.repeatEndDate,
  };
  return isShareableParams(params) ? params : null;
}

function generateCode(length = 8) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: {
      giftOptionId?: string;
      buddyTask?: unknown;
      sectionId?: string;
      buddyTaskFromId?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const giftOptionId = body.giftOptionId;
    if (!giftOptionId) {
      return NextResponse.json({ error: 'Missing giftOptionId' }, { status: 400 });
    }

    let buddyTask = parseBuddyTask(body.buddyTask);
    if (body.buddyTask && !buddyTask) {
      return NextResponse.json(
        { error: 'Pick when you will both do it' },
        { status: 400 },
      );
    }

    await connectMongo();

    const fromTaskId = String(body.buddyTaskFromId || '').trim();
    let buddyTaskFromId: string | null = null;
    if (fromTaskId) {
      const task = await TaskModel.findOne({ userId, id: fromTaskId })
        .lean<ExistingBuddyTask | null>();
      if (!task)
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      if (task.bondId)
        return NextResponse.json(
          { error: 'This task is already shared' },
          { status: 409 },
        );

      const siblings = task.repeatGroupId
        ? await TaskModel.find({ userId, repeatGroupId: task.repeatGroupId })
            .lean<ExistingBuddyTask[]>()
        : [task];
      const derived = paramsFromTask(task, siblings);
      if (!isShareableParams(derived))
        return NextResponse.json(
          { error: 'Give this task a day first, then share it' },
          { status: 400 },
        );
      buddyTask = derived;
      buddyTaskFromId = task.repeatGroupId ?? task.id;
    }
    await ensureInviteConfig();
    const config = await InviteConfigModel.findOne({ key: 'singleton' }).lean();
    const option = config?.giftOptions.find((g) => g.id === giftOptionId);
    if (!option) {
      return NextResponse.json({ error: 'Unknown gift option' }, { status: 400 });
    }

    // Try a handful of times to avoid collisions
    let code = generateCode();
    for (let i = 0; i < 6; i++) {
      const existing = await ReferralModel.findOne({ code }).lean();
      if (!existing) break;
      code = generateCode();
    }

    const referral = await ReferralModel.create({
      code,
      inviterId: userId,
      giftItemId: option.itemId,
      giftOptionId: option.id,
      buddyTask,
      buddyTaskSectionId:
        buddyTask && typeof body.sectionId === 'string' && body.sectionId
          ? body.sectionId
          : null,
      buddyTaskFromId,
    });
    await recordAnalyticsEvent({
      userId,
      name: 'referral_invite_created',
      properties: {
        gift_option: option.id,
        has_buddy_task: !!buddyTask,
        share_surface: buddyTask ? 'buddy_invite' : 'invite_rewards',
      },
    });

    return NextResponse.json({ ok: true, code, referral });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create invite' },
      { status: 500 },
    );
  }
}
