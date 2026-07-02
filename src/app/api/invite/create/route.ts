import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import ReferralModel from '@/lib/models/Referral';
import InviteConfigModel from '@/lib/models/InviteConfig';
import { ensureInviteConfig } from '@/lib/inviteConfig/defaults';
import type { BuddyCreateParams } from '@/lib/models/TaskBond';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isRepeating(params: BuddyCreateParams): boolean {
  if (params.repeatRule) return true;
  if (params.repeat === 'monthly') return true;
  if (params.repeat === 'weekly' && (params.days?.length ?? 0) > 0) return true;
  return false;
}

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
  return isRepeating(params) ? params : null;
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

    let body: { giftOptionId?: string; buddyTask?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const giftOptionId = body.giftOptionId;
    if (!giftOptionId) {
      return NextResponse.json({ error: 'Missing giftOptionId' }, { status: 400 });
    }

    const buddyTask = parseBuddyTask(body.buddyTask);
    if (body.buddyTask && !buddyTask) {
      return NextResponse.json(
        { error: 'Buddy tasks must repeat — pick a repeat option' },
        { status: 400 },
      );
    }

    await connectMongo();
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
    });

    return NextResponse.json({ ok: true, code, referral });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create invite' },
      { status: 500 },
    );
  }
}
