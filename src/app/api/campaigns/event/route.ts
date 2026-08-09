import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const EVENTS = ['impression', 'click', 'dismiss', 'convert'] as const;
type CampaignEvent = (typeof EVENTS)[number];

const ANALYTICS_NAME = {
  impression: 'campaign_shown',
  click: 'campaign_clicked',
  dismiss: 'campaign_dismissed',
  convert: 'campaign_converted',
} as const;

export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as {
      campaignId?: string;
      event?: CampaignEvent;
      elementId?: string;
    };
    const campaignId = body.campaignId?.trim();
    const event = body.event;
    if (!campaignId || !event || !EVENTS.includes(event)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    const now = new Date();
    const inc: Record<string, number> = {};
    const set: Record<string, unknown> = {};
    if (event === 'impression') {
      inc.impressions = 1;
      set.lastShownAt = now;
    }
    if (event === 'click') {
      inc.clicks = 1;
      // Which button on the artwork was pressed, so a canvas popup can be read
      // element by element instead of as one undifferentiated click.
      const elementId = body.elementId?.trim().slice(0, 40);
      if (elementId && /^[\w-]+$/.test(elementId)) {
        inc[`elementClicks.${elementId}`] = 1;
      }
    }
    if (event === 'dismiss') inc.dismissals = 1;
    if (event === 'convert') {
      set.converted = true;
      set.convertedAt = now;
    }

    await connectMongo();
    await CampaignUserStateModel.updateOne(
      { userId: decoded.uid, campaignId },
      {
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
        ...(Object.keys(set).length ? { $set: set } : {}),
        $setOnInsert: { userId: decoded.uid, campaignId },
      },
      { upsert: true },
    );

    void recordAnalyticsEvent({
      name: ANALYTICS_NAME[event],
      userId: decoded.uid,
      properties: { campaignId, elementId: body.elementId ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
