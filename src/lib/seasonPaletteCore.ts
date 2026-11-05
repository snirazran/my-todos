import {
  argbFromRgb,
  DislikeAnalyzer,
  Hct,
  hexFromArgb,
  QuantizerCelebi,
  Score,
  TonalPalette,
} from '@material/material-color-utilities';

export type SeasonPalette = {
  band: string;
  bandLip: string;
  accent: string;
  accentLip: string;
  onAccent: string;
  soft: string;
  softText: string;
  softTextDark: string;
  tint: string;
  fill: string;
  fillStrong: string;
  onFill: string;
};

export const DEFAULT_SEASON_PALETTE: SeasonPalette = {
  band: '#1f4a2a',
  bandLip: '#13301b',
  accent: '#58a83f',
  accentLip: '#2f6b1f',
  onAccent: '#ffffff',
  soft: 'rgba(88,168,63,0.14)',
  softText: '#2f6b1f',
  softTextDark: '#8fd17f',
  tint: 'rgba(88,168,63,0.07)',
  fill: '#9bd682',
  fillStrong: '#7fc364',
  onFill: '#163a10',
};

export const SEASON_PALETTE_SAMPLE_SIZE = 64;
export const SEASON_PALETTE_VERSION = 2;

const FALLBACK_SEED = argbFromRgb(88, 168, 63);
const PALETTE_KEYS = Object.keys(DEFAULT_SEASON_PALETTE) as (keyof SeasonPalette)[];

function rgba(argb: number, alpha: number) {
  return `rgba(${(argb >> 16) & 255},${(argb >> 8) & 255},${argb & 255},${alpha})`;
}

export function paletteFromSeed(seed: number): SeasonPalette {
  const hct = DislikeAnalyzer.fixIfDisliked(Hct.fromInt(seed));
  const accent = TonalPalette.fromHueAndChroma(hct.hue, Math.max(hct.chroma, 48));
  const band = TonalPalette.fromHueAndChroma(
    hct.hue,
    Math.min(Math.max(hct.chroma, 24), 40),
  );
  const accentArgb = accent.tone(45);
  return {
    band: hexFromArgb(band.tone(25)),
    bandLip: hexFromArgb(band.tone(15)),
    accent: hexFromArgb(accentArgb),
    accentLip: hexFromArgb(accent.tone(30)),
    onAccent: '#ffffff',
    soft: rgba(accentArgb, 0.14),
    softText: hexFromArgb(accent.tone(35)),
    softTextDark: hexFromArgb(accent.tone(80)),
    tint: rgba(accentArgb, 0.08),
    fill: hexFromArgb(accent.tone(80)),
    fillStrong: hexFromArgb(accent.tone(72)),
    onFill: hexFromArgb(accent.tone(15)),
  };
}

export function paletteFromPixels(data: ArrayLike<number>): SeasonPalette {
  const pixels: number[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 255) continue;
    pixels.push(argbFromRgb(data[i], data[i + 1], data[i + 2]));
  }
  const [seed] = Score.score(QuantizerCelebi.quantize(pixels, 128), {
    desired: 1,
    fallbackColorARGB: FALLBACK_SEED,
  });
  return paletteFromSeed(seed ?? FALLBACK_SEED);
}

export function readSeasonPalette(value: unknown): SeasonPalette | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const out = {} as SeasonPalette;
  for (const key of PALETTE_KEYS) {
    const entry = source[key];
    if (typeof entry !== 'string' || !entry) return null;
    out[key] = entry;
  }
  return out;
}
