import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestSeasonModel from '@/lib/models/QuestSeason';
import { loadSeasonTemplate, seasonToAdminView } from '@/lib/quests/seasons';
import {
  ensureSeasonCalendar,
  ensureSeasonForMonth,
  pickSeasonSkins,
  restampUpcomingSeason,
} from '@/lib/quests/seasonProvision';
import {
  normalizeSeasonSkinIds,
  SEASON_SKIN_SLOTS,
  type SeasonSkinSlot,
} from '@/lib/quests/seasonLadder';
import {
  isSeasonMonthKey,
  SEASON_PLAN_AHEAD_MONTHS,
  seasonMonthKey,
  shiftSeasonMonth,
} from '@/lib/quests/seasonCalendar';
import { getCachedCatalog } from '@/lib/skins/getCatalog';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

const SLOT_KEYS = new Set<string>(SEASON_SKIN_SLOTS.map((slot) => slot.key));

async function calendarPayload() {
  const [seasons, template] = await Promise.all([
    QuestSeasonModel.find({}).sort({ startsAt: -1 }).lean(),
    loadSeasonTemplate(),
  ]);
  return {
    seasons: seasons.map(seasonToAdminView),
    template,
    now: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    await requireUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
  try {
    await connectMongo();
    await ensureSeasonCalendar();
    return json(await calendarPayload());
  } catch (error) {
    console.error('Failed to load seasons:', error);
    return json({ error: 'Failed to load seasons' }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
  try {
    const body = await req.json();
    const action = String(body?.action ?? '');
    await connectMongo();

    if (action === 'plan') {
      const monthKey = body?.monthKey;
      const thisMonth = seasonMonthKey(new Date());
      const limit = shiftSeasonMonth(thisMonth, SEASON_PLAN_AHEAD_MONTHS);
      if (!isSeasonMonthKey(monthKey) || monthKey < thisMonth || monthKey > limit) {
        return json({ error: 'Pick a month within the planning window' }, 400);
      }
      const season = await ensureSeasonForMonth(monthKey);
      if (!season) {
        return json({ error: 'A hand-dated season already covers that month' }, 409);
      }
      return json(await calendarPayload());
    }

    const seasonId = typeof body?.id === 'string' ? body.id.trim() : '';
    const season = seasonId ? await QuestSeasonModel.findOne({ seasonId }) : null;
    if (!season) return json({ error: 'Season not found' }, 404);

    if (action === 'rename') {
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : '';
      if (!name) return json({ error: 'Season name is required' }, 400);
      season.set({ name });
      await season.save();
      return json(await calendarPayload());
    }

    if (action === 'reroll') {
      if (!season.monthKey) {
        return json({ error: 'Only monthly seasons roll their skins' }, 400);
      }
      const slot = body?.slot;
      if (slot !== undefined && !SLOT_KEYS.has(slot)) {
        return json({ error: 'Unknown skin rung' }, 400);
      }
      const skinIds = await pickSeasonSkins({
        monthKey: season.monthKey,
        template: await loadSeasonTemplate(),
        keep: normalizeSeasonSkinIds(season.skinIds),
        slots: slot ? [slot as SeasonSkinSlot] : undefined,
        excludeSeasonId: season.seasonId,
      });
      await restampUpcomingSeason(season.seasonId, { skinIds });
      return json(await calendarPayload());
    }

    if (action === 'setSkin') {
      const slot = body?.slot;
      const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
      if (!SLOT_KEYS.has(slot)) return json({ error: 'Unknown skin rung' }, 400);
      const template = await loadSeasonTemplate();
      const item = (await getCachedCatalog()).find((entry) => entry.id === itemId);
      if (!item) return json({ error: 'That item is not in the catalog' }, 400);
      if (item.rarity !== template.slotRarities[slot as SeasonSkinSlot]) {
        return json({ error: 'That rung only takes the rarity set in the pass rules' }, 400);
      }
      const skinIds = {
        ...normalizeSeasonSkinIds(season.skinIds),
        [slot]: itemId,
      };
      await restampUpcomingSeason(season.seasonId, { skinIds });
      return json(await calendarPayload());
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Season update failed' },
      400,
    );
  }
}
