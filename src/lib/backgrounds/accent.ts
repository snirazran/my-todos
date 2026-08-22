import sharp from 'sharp';
import { converter } from 'culori';
import {
  ACCENT_MAX_CHROMA as MAX_CHROMA,
  ACCENT_MIN_CHROMA as MIN_CHROMA,
  DEFAULT_ACCENT,
  type BackgroundAccent,
} from './constants';

export { DEFAULT_ACCENT, type BackgroundAccent };

const SAMPLE_EDGE = 64;
const HUE_BUCKETS = 36;
const BUCKET_DEG = 360 / HUE_BUCKETS;

const toOklch = converter('oklch');
const toRgb = converter('rgb');
const toHsl = converter('hsl');

function hslHueFor(hue: number, chroma: number): number {
  const hsl = toHsl({ mode: 'oklch', l: 0.62, c: Math.max(chroma, 0.09), h: hue });
  if (!hsl || typeof hsl.h !== 'number') return DEFAULT_ACCENT.hslHue;
  return Number((((hsl.h % 360) + 360) % 360).toFixed(1));
}

function swatchHex(hue: number, chroma: number): string {
  const rgb = toRgb({ mode: 'oklch', l: 0.62, c: Math.max(chroma, 0.09), h: hue });
  if (!rgb) return DEFAULT_ACCENT.hex;
  const channel = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

export function accentFromHex(hex: string): BackgroundAccent | null {
  const parsed = toOklch(hex);
  if (!parsed || typeof parsed.h !== 'number') return null;
  const chroma = Math.min(MAX_CHROMA, Math.max(MIN_CHROMA, parsed.c ?? 0));
  const hue = ((parsed.h % 360) + 360) % 360;
  return {
    hue: Number(hue.toFixed(1)),
    hslHue: hslHueFor(hue, chroma),
    chroma: Number(chroma.toFixed(4)),
    hex,
    mode: 'manual',
  };
}

export async function extractAccent(input: Buffer): Promise<BackgroundAccent> {
  let raw: Buffer;
  try {
    raw = await sharp(input)
      .resize(SAMPLE_EDGE, SAMPLE_EDGE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
  } catch {
    return DEFAULT_ACCENT;
  }

  const cos = new Float64Array(HUE_BUCKETS);
  const sin = new Float64Array(HUE_BUCKETS);
  const chromaSum = new Float64Array(HUE_BUCKETS);
  const weightSum = new Float64Array(HUE_BUCKETS);
  let sampled = 0;

  for (let i = 0; i + 2 < raw.length; i += 3) {
    const color = toOklch({
      mode: 'rgb',
      r: raw[i] / 255,
      g: raw[i + 1] / 255,
      b: raw[i + 2] / 255,
    });
    if (!color || typeof color.h !== 'number') continue;

    const l = color.l ?? 0;
    const c = color.c ?? 0;
    if (l < 0.18 || l > 0.93) continue;
    if (c < 0.02) continue;

    const hue = ((color.h % 360) + 360) % 360;
    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor(hue / BUCKET_DEG));
    const rad = (hue * Math.PI) / 180;
    const weight = c;

    cos[bucket] += Math.cos(rad) * weight;
    sin[bucket] += Math.sin(rad) * weight;
    chromaSum[bucket] += c * weight;
    weightSum[bucket] += weight;
    sampled += 1;
  }

  if (sampled < 64) return DEFAULT_ACCENT;

  let bestStart = 0;
  let bestWeight = -1;
  for (let start = 0; start < HUE_BUCKETS; start += 1) {
    let total = 0;
    for (let k = -1; k <= 1; k += 1) {
      total += weightSum[(start + k + HUE_BUCKETS) % HUE_BUCKETS];
    }
    if (total > bestWeight) {
      bestWeight = total;
      bestStart = start;
    }
  }

  let x = 0;
  let y = 0;
  let chromaAcc = 0;
  let weightAcc = 0;
  for (let k = -1; k <= 1; k += 1) {
    const idx = (bestStart + k + HUE_BUCKETS) % HUE_BUCKETS;
    x += cos[idx];
    y += sin[idx];
    chromaAcc += chromaSum[idx];
    weightAcc += weightSum[idx];
  }

  if (weightAcc <= 0) return DEFAULT_ACCENT;

  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const chroma = Math.min(MAX_CHROMA, Math.max(MIN_CHROMA, chromaAcc / weightAcc));

  return {
    hue: Number(hue.toFixed(1)),
    hslHue: hslHueFor(hue, chroma),
    chroma: Number(chroma.toFixed(4)),
    hex: swatchHex(hue, chroma),
    mode: 'auto',
  };
}
