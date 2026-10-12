import { v4 as uuid } from 'uuid';
import QuestSeasonModel, { type QuestSeasonDoc } from '@/lib/models/QuestSeason';
import { getCachedCatalog } from '@/lib/skins/getCatalog';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import { isAvailableAt } from '@/lib/skins/availability';
import {
  buildSeasonPassLadder,
  normalizeSeasonPassConfig,
  normalizeSeasonSkinIds,
  SEASON_SKIN_SLOTS,
  type SeasonSkinIds,
  type SeasonSkinSlot,
} from '@/lib/quests/seasonLadder';
import {
  defaultSeasonName,
  seasonMonthKey,
  seasonMonthWindow,
  shiftSeasonMonth,
} from '@/lib/quests/seasonCalendar';
import {
  loadSeasonTemplate,
  type SeasonTemplateView,
} from '@/lib/quests/seasons';

const REPEAT_LOOKBACK_MONTHS = 6;
const FINALE_SLOTS: WardrobeSlot[] = ['skin', 'body'];

function randomOf<T>(list: T[]): T | undefined {
  return list[Math.floor(Math.random() * list.length)];
}

function seasonItemIds(season: Pick<QuestSeasonDoc, 'tierRewards' | 'skinIds'>) {
  const ids = new Set<string>(Object.values(normalizeSeasonSkinIds(season.skinIds)));
  for (const entry of season.tierRewards ?? []) {
    for (const reward of [...(entry.freeRewards ?? []), ...(entry.premiumRewards ?? [])]) {
      if (reward.type === 'ITEM' && reward.itemId) ids.add(reward.itemId);
    }
  }
  return ids;
}

async function recentSeasonItemIds(monthKey: string, excludeSeasonId?: string) {
  const { startsAt } = seasonMonthWindow(
    shiftSeasonMonth(monthKey, -REPEAT_LOOKBACK_MONTHS),
  );
  const { endsAt } = seasonMonthWindow(
    shiftSeasonMonth(monthKey, REPEAT_LOOKBACK_MONTHS),
  );
  const seasons = await QuestSeasonModel.find(
    {
      ...(excludeSeasonId ? { seasonId: { $ne: excludeSeasonId } } : {}),
      endsAt: { $gt: startsAt },
      startsAt: { $lt: endsAt },
    },
    { tierRewards: 1, skinIds: 1 },
  ).lean<QuestSeasonDoc[]>();
  const ids = new Set<string>();
  for (const season of seasons) {
    seasonItemIds(season).forEach((id) => ids.add(id));
  }
  return ids;
}

function isEligible(item: ItemDef, template: SeasonTemplateView, monthKey: string) {
  return (
    template.skinPool.includes(item.slot) &&
    isAvailableAt(item, seasonMonthWindow(monthKey).startsAt)
  );
}

export async function pickSeasonSkins(args: {
  monthKey: string;
  template: SeasonTemplateView;
  keep?: SeasonSkinIds;
  slots?: SeasonSkinSlot[];
  excludeSeasonId?: string;
}): Promise<SeasonSkinIds> {
  const catalog = (await getCachedCatalog()).filter((item) =>
    isEligible(item, args.template, args.monthKey),
  );
  const recent = await recentSeasonItemIds(args.monthKey, args.excludeSeasonId);
  const reroll = new Set(args.slots ?? SEASON_SKIN_SLOTS.map((slot) => slot.key));
  const result: SeasonSkinIds = {};

  for (const slot of SEASON_SKIN_SLOTS) {
    const kept = args.keep?.[slot.key];
    if (kept && !reroll.has(slot.key)) result[slot.key] = kept;
  }

  for (const slot of SEASON_SKIN_SLOTS) {
    if (!reroll.has(slot.key)) continue;
    const taken = new Set(Object.values(result));
    const usedSlots = new Set(
      catalog.filter((item) => taken.has(item.id)).map((item) => item.slot),
    );
    const current = args.keep?.[slot.key];
    const ofRarity = catalog.filter(
      (item) =>
        item.rarity === args.template.slotRarities[slot.key] &&
        !taken.has(item.id),
    );
    const fresh = ofRarity.filter(
      (item) => !recent.has(item.id) && item.id !== current,
    );
    const rarityPool = fresh.length > 0 ? fresh : ofRarity;
    const showpiece = slot.finale
      ? rarityPool.filter((item) => FINALE_SLOTS.includes(item.slot))
      : [];
    const pool = showpiece.length > 0 ? showpiece : rarityPool;
    const varied = pool.filter((item) => !usedSlots.has(item.slot));
    const picked = randomOf(varied.length > 0 ? varied : pool);
    if (picked) result[slot.key] = picked.id;
  }

  return result;
}

export async function ensureSeasonForMonth(
  monthKey: string,
): Promise<QuestSeasonDoc | null> {
  const existing = await QuestSeasonModel.findOne({ monthKey }).lean<QuestSeasonDoc>();
  if (existing) return existing;

  const { startsAt, endsAt } = seasonMonthWindow(monthKey);
  const handDated = await QuestSeasonModel.exists({
    monthKey: { $exists: false },
    isActive: true,
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt },
  });
  if (handDated) return null;

  const template = await loadSeasonTemplate();
  const config = normalizeSeasonPassConfig(template);
  const skinIds = await pickSeasonSkins({ monthKey, template });

  try {
    const created = await QuestSeasonModel.create({
      seasonId: uuid(),
      monthKey,
      name: defaultSeasonName(monthKey),
      images: { mobile: '', tablet: '', web: '', webLarge: '' },
      startsAt,
      endsAt,
      ...config,
      skinIds,
      tierRewards: buildSeasonPassLadder(config.tierCount, skinIds),
      isActive: true,
    });
    return created.toObject();
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    return QuestSeasonModel.findOne({ monthKey }).lean<QuestSeasonDoc>();
  }
}

export async function ensureSeasonCalendar(now = new Date()) {
  const current = seasonMonthKey(now);
  await ensureSeasonForMonth(current);
  await ensureSeasonForMonth(shiftSeasonMonth(current, 1));
}

export function seasonHasStarted(season: Pick<QuestSeasonDoc, 'startsAt'>, now = new Date()) {
  return new Date(season.startsAt).getTime() <= now.getTime();
}

export async function restampUpcomingSeason(
  seasonId: string,
  input: { skinIds?: SeasonSkinIds; template?: SeasonTemplateView },
) {
  const season = await QuestSeasonModel.findOne({ seasonId });
  if (!season) throw new Error('Season not found');
  if (seasonHasStarted(season)) {
    throw new Error('This season is live — its rewards are locked');
  }
  const config = input.template
    ? normalizeSeasonPassConfig(input.template)
    : normalizeSeasonPassConfig(season);
  const skinIds = input.skinIds ?? normalizeSeasonSkinIds(season.skinIds);
  season.set({
    ...config,
    skinIds,
    tierRewards: buildSeasonPassLadder(config.tierCount, skinIds),
  });
  await season.save();
  return season.toObject() as QuestSeasonDoc;
}

export async function applyTemplateToUpcomingSeasons(template: SeasonTemplateView) {
  const upcoming = await QuestSeasonModel.find({
    monthKey: { $exists: true },
    startsAt: { $gt: new Date() },
  }).lean<QuestSeasonDoc[]>();
  const byId = new Map((await getCachedCatalog()).map((item) => [item.id, item]));

  for (const season of upcoming) {
    const current = normalizeSeasonSkinIds(season.skinIds);
    const stale = SEASON_SKIN_SLOTS.filter((slot) => {
      const item = current[slot.key] ? byId.get(current[slot.key]!) : undefined;
      return !item || !isEligible(item, template, season.monthKey!) || item.rarity !== template.slotRarities[slot.key];
    }).map((slot) => slot.key);
    const skinIds =
      stale.length > 0
        ? await pickSeasonSkins({
            monthKey: season.monthKey!,
            template,
            keep: current,
            slots: stale,
            excludeSeasonId: season.seasonId,
          })
        : current;
    await restampUpcomingSeason(season.seasonId, { skinIds, template });
  }
}
