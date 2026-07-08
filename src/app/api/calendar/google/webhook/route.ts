export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel from '@/lib/models/CalendarConnection';
import { hmacVerify } from '@/lib/calendar/crypto';

export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id');
  const channelToken = req.headers.get('x-goog-channel-token');
  const resourceState = req.headers.get('x-goog-resource-state');

  if (!channelId || !channelToken || resourceState === 'sync') {
    return new NextResponse(null, { status: 200 });
  }

  try {
    await connectMongo();
    const conn = await CalendarConnectionModel.findOne(
      { channelId },
      { _id: 1, channelToken: 1 },
    ).lean<{ _id: unknown; channelToken?: string }>();

    if (
      conn &&
      conn.channelToken === channelToken &&
      hmacVerify(String(conn._id), channelToken)
    ) {
      await CalendarConnectionModel.updateOne(
        { channelId },
        { $set: { syncRequestedAt: new Date() } },
      );
    }
  } catch (err) {
    console.error('calendar webhook error:', (err as Error)?.message);
  }

  return new NextResponse(null, { status: 200 });
}
