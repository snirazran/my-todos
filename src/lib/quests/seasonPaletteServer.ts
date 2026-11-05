import sharp from 'sharp';
import QuestSeasonModel, {
  type QuestSeasonSizeKey,
} from '@/lib/models/QuestSeason';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import {
  SEASON_PALETTE_SAMPLE_SIZE,
  SEASON_PALETTE_VERSION,
  paletteFromPixels,
  readSeasonPalette,
  type SeasonPalette,
} from '@/lib/seasonPaletteCore';

const SOURCE_ORDER: QuestSeasonSizeKey[] = ['mobile', 'tablet', 'web', 'webLarge'];
const pending = new Map<string, Promise<SeasonPalette | null>>();

export async function paletteFromImageBytes(bytes: Buffer): Promise<SeasonPalette> {
  const { data } = await sharp(bytes)
    .resize(SEASON_PALETTE_SAMPLE_SIZE, SEASON_PALETTE_SAMPLE_SIZE, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return paletteFromPixels(data);
}

export async function ensureSeasonPalette(season: any): Promise<SeasonPalette | null> {
  if (!season) return null;
  const existing = readSeasonPalette(season.palette);
  if (existing && season.paletteVersion === SEASON_PALETTE_VERSION) return existing;
  const size = SOURCE_ORDER.find((key) => season.imageFiles?.[key]?.storagePath);
  if (!size) return null;
  const storagePath: string = season.imageFiles[size].storagePath;
  const key = `${season.seasonId}:${storagePath}:${SEASON_PALETTE_VERSION}`;
  let job = pending.get(key);
  if (!job) {
    job = (async () => {
      try {
        const [buffer] = await getAdminStorage().file(storagePath).download();
        const palette = await paletteFromImageBytes(buffer);
        await QuestSeasonModel.updateOne(
          { seasonId: season.seasonId },
          { $set: { palette, paletteVersion: SEASON_PALETTE_VERSION } },
        );
        return palette;
      } catch {
        return null;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, job);
  }
  const palette = await job;
  if (palette) {
    season.palette = palette;
    season.paletteVersion = SEASON_PALETTE_VERSION;
  }
  return palette;
}
