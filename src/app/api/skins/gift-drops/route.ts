import { NextRequest, NextResponse } from 'next/server';
import { getGiftConfig } from '@/lib/skins/gifts';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

export async function GET(req: NextRequest) {
  const giftId = new URL(req.url).searchParams.get('giftId');
  if (!giftId) return json({ error: 'Missing giftId' }, 400);

  const config = await getGiftConfig(giftId);
  if (!config) return json({ error: 'Gift not found' }, 404);

  return json({ gift: config.gift, drops: config.drops });
}
