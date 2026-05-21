import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import ReferralModel from '@/lib/models/Referral';
import InviteConfigModel from '@/lib/models/InviteConfig';
import { ensureInviteConfig } from '@/lib/inviteConfig/defaults';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

    let body: { giftOptionId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const giftOptionId = body.giftOptionId;
    if (!giftOptionId) {
      return NextResponse.json({ error: 'Missing giftOptionId' }, { status: 400 });
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
    });

    return NextResponse.json({ ok: true, code, referral });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create invite' },
      { status: 500 },
    );
  }
}
