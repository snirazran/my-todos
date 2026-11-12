import QuestSeasonModel, { type QuestSeasonDoc } from '@/lib/models/QuestSeason';
import { normalizeSeasonSet } from '@/lib/quests/seasonLadder';

export type SeasonSetSummary = {
  seasonId: string;
  name: string;
  image: string | null;
  ids: string[];
};

const MAX_SETS = 24;

export async function loadSeasonSetSummaries(now: Date = new Date()): Promise<SeasonSetSummary[]> {
  try {
    const seasons = await QuestSeasonModel.find(
      { startsAt: { $lte: now }, 'seasonSet.ids.1': { $exists: true } },
      { seasonId: 1, name: 1, images: 1, seasonSet: 1, startsAt: 1 },
    )
      .sort({ startsAt: -1 })
      .limit(MAX_SETS)
      .lean<QuestSeasonDoc[]>();
    return seasons.flatMap((season) => {
      const set = normalizeSeasonSet(season.seasonSet);
      if (!set) return [];
      const images = season.images;
      return [
        {
          seasonId: season.seasonId,
          name: season.name,
          image: images?.mobile || images?.tablet || images?.web || images?.webLarge || null,
          ids: set.ids,
        },
      ];
    });
  } catch {
    return [];
  }
}

export type SeasonSetProgress = { name: string; total: number; have: number };

export async function loadRunningSeasonSetProgress(
  inventory: Record<string, number> | null | undefined,
  now: Date = new Date(),
): Promise<SeasonSetProgress | null> {
  try {
    const season = await QuestSeasonModel.findOne(
      {
        isActive: true,
        startsAt: { $lte: now },
        endsAt: { $gt: now },
        'seasonSet.ids.1': { $exists: true },
      },
      { name: 1, seasonSet: 1 },
    ).lean<QuestSeasonDoc>();
    const set = normalizeSeasonSet(season?.seasonSet);
    if (!season || !set) return null;
    const owned = inventory ?? {};
    return {
      name: season.name,
      total: set.ids.length,
      have: set.ids.filter((id) => (owned[id] ?? 0) > 0).length,
    };
  } catch {
    return null;
  }
}
