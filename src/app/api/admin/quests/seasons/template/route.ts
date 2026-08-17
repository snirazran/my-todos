import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import {
  generateQuestSeason,
  loadSeasonTemplate,
  saveSeasonTemplate,
  seasonToAdminView,
} from '@/lib/quests/seasons';
import {
  normalizeSeasonPassConfig,
  normalizeSeasonSkinIds,
} from '@/lib/quests/seasonLadder';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });

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

/** Saves the defaults the generator starts from. */
export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    await connectMongo();
    const template = await saveSeasonTemplate({
      config: normalizeSeasonPassConfig(body),
      skinIds: normalizeSeasonSkinIds(body?.skinIds),
    });
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

/** Generates a real season from the template on the admin's own dates. */
export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const startsAt = new Date(body?.startsAt);
    const endsAt = new Date(body?.endsAt);
    if (!name) return json({ error: 'Season name is required' }, 400);
    if (!Number.isFinite(startsAt.getTime())) {
      return json({ error: 'Start date is required' }, 400);
    }
    if (!Number.isFinite(endsAt.getTime())) {
      return json({ error: 'End date is required' }, 400);
    }
    if (endsAt <= startsAt) {
      return json({ error: 'End date must be after start date' }, 400);
    }

    await connectMongo();
    const season = await generateQuestSeason({
      name,
      startsAt,
      endsAt,
      isActive: body?.isActive === true,
      overrides: normalizeSeasonPassConfig({
        ...(await loadSeasonTemplate()),
        ...body,
      }),
      skinIds: body?.skinIds ? normalizeSeasonSkinIds(body.skinIds) : undefined,
    });

    return json({ ok: true, season: seasonToAdminView(season) });
  } catch (error) {
    console.error('Failed to generate season:', error);
    return json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to generate season',
      },
      400,
    );
  }
}
