import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import { loadSeasonTemplate, saveSeasonTemplate } from '@/lib/quests/seasons';
import { applyTemplateToUpcomingSeasons } from '@/lib/quests/seasonProvision';
import {
  normalizeSeasonPassConfig,
  normalizeSeasonSkinPool,
  normalizeSeasonSlotRarities,
} from '@/lib/quests/seasonLadder';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    return json({ template: await loadSeasonTemplate() });
  } catch (error) {
    console.error('Failed to load season template:', error);
    return json({ error: 'Failed to load season template' }, 400);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    await connectMongo();
    const template = await saveSeasonTemplate({
      config: normalizeSeasonPassConfig(body),
      slotRarities: normalizeSeasonSlotRarities(body?.slotRarities),
      skinPool: normalizeSeasonSkinPool(body?.skinPool),
    });
    await applyTemplateToUpcomingSeasons(template);
    return json({ template });
  } catch (error) {
    console.error('Failed to save season template:', error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save season template',
      },
      400,
    );
  }
}
