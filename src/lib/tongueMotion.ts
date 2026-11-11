export interface Pt {
  x: number;
  y: number;
}

export const TONGUE_WIDTH = 8;
export const TONGUE_EDGE = '#e11d48';
export const TONGUE_EDGE_WIDTH = 1;
export const TONGUE_ROOT_SHADE = '#090506';
export const TONGUE_GLOSS = 'rgba(255, 255, 255, 0.5)';

const SAMPLES = 24;
const ARC_STEPS = 24;
const PAD_LEN = 15;
const PAD_GROW = 48;
const BASE_CAP = 0.35;
const ROOT_LEN = 14;
const REST_LENGTH = 200;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (x: number) => x * x * (3 - 2 * x);
const r1 = (v: number) => Math.round(v * 10) / 10;

export interface TongueTiming {
  extend: number;
  hold: number;
  retract: number;
  total: number;
  hitAt: number;
  holdEnd: number;
}

export function tongueTiming(
  distance: number,
  scale = 1,
  extendStretch = 1,
): TongueTiming {
  const extend = clamp(120 + distance * 0.2, 150, 250) * scale * extendStretch;
  const hold = 84 * scale;
  const retract = clamp(190 + distance * 0.3, 250, 400) * scale;
  const total = extend + hold + retract;
  return {
    extend,
    hold,
    retract,
    total,
    hitAt: extend / total,
    holdEnd: (extend + hold) / total,
  };
}

export const extendEase = (x: number) => x * (1.5 - 0.5 * x);
export const retractEase = (x: number) => x * (0.35 + 0.65 * x);

export function bowSideFor(p0: Pt, p2: Pt): 1 | -1 {
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  if (Math.abs(dx) < 1) return dy >= 0 ? -1 : 1;
  return dx > 0 ? -1 : 1;
}

export function aimControl(p0: Pt, p2: Pt, bowSide: 1 | -1): Pt {
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = clamp(dist * 0.14, 8, 44) * bowSide;
  return {
    x: (p0.x + p2.x) / 2 + (-dy / dist) * bow,
    y: (p0.y + p2.y) / 2 + (dx / dist) * bow,
  };
}

export const hitWave = (sinceHitMs: number, distance: number) =>
  sinceHitMs < 0
    ? 0
    : -clamp(distance * 0.05, 6, 16) *
      Math.exp(-sinceHitMs / 120) *
      Math.sin((2 * Math.PI * sinceHitMs) / 200);

export const hitPush = (h: number) =>
  h <= 0 || h >= 1 ? 0 : 12 * Math.sin(Math.PI * h) * (1 - h);

export const impactSquash = (sinceHitMs: number) =>
  Math.exp(-sinceHitMs / 60) * Math.cos((2 * Math.PI * sinceHitMs) / 130);

export function lightSide(p0: Pt, p2: Pt): 1 | -1 {
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  return dy * 0.45 - dx * 0.9 >= 0 ? 1 : -1;
}

function paramAtReach(p0: Pt, c: Pt, p2: Pt, reach: number) {
  if (reach <= 0) return 0;
  if (reach >= 1) return 1;
  const lens = new Float32Array(ARC_STEPS + 1);
  let px = p0.x;
  let py = p0.y;
  for (let i = 1; i <= ARC_STEPS; i++) {
    const s = i / ARC_STEPS;
    const a = (1 - s) * (1 - s);
    const b = 2 * s * (1 - s);
    const d = s * s;
    const x = a * p0.x + b * c.x + d * p2.x;
    const y = a * p0.y + b * c.y + d * p2.y;
    lens[i] = lens[i - 1] + Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  const want = lens[ARC_STEPS] * reach;
  for (let i = 1; i <= ARC_STEPS; i++) {
    if (lens[i] >= want) {
      const span = lens[i] - lens[i - 1] || 1;
      return (i - 1 + (want - lens[i - 1]) / span) / ARC_STEPS;
    }
  }
  return 1;
}

export interface TongueShapeOptions {
  width?: number;
  bulge?: number;
  push?: number;
  wave?: number;
  side?: 1 | -1;
  ox?: number;
  oy?: number;
}

export interface TongueShape {
  body: string;
  gloss: string;
  glossWidth: number;
  tip: Pt;
  dir: Pt;
  length: number;
}

export function tongueShape(
  p0: Pt,
  c: Pt,
  p2: Pt,
  reach: number,
  options: TongueShapeOptions = {},
): TongueShape {
  const width = options.width ?? TONGUE_WIDTH;
  const bulge = options.bulge ?? 0;
  const push = options.push ?? 0;
  const wave = options.wave ?? 0;
  const side = options.side ?? 1;
  const ox = options.ox ?? 0;
  const oy = options.oy ?? 0;

  const u = paramAtReach(p0, c, p2, clamp(reach, 0, 1));
  const c1x = p0.x + (c.x - p0.x) * u;
  const c1y = p0.y + (c.y - p0.y) * u;
  const ex = (1 - u) * (1 - u) * p0.x + 2 * u * (1 - u) * c.x + u * u * p2.x;
  const ey = (1 - u) * (1 - u) * p0.y + 2 * u * (1 - u) * c.y + u * u * p2.y;

  let dirX = ex - c1x;
  let dirY = ey - c1y;
  if (Math.hypot(dirX, dirY) < 0.01) {
    dirX = c.x - p0.x;
    dirY = c.y - p0.y;
  }
  const dirLen = Math.hypot(dirX, dirY) || 1;
  dirX /= dirLen;
  dirY /= dirLen;

  const xs = new Float32Array(SAMPLES + 1);
  const ys = new Float32Array(SAMPLES + 1);
  for (let i = 0; i <= SAMPLES; i++) {
    const s = i / SAMPLES;
    const a = (1 - s) * (1 - s);
    const b = 2 * s * (1 - s);
    const d = s * s;
    xs[i] = a * p0.x + b * c1x + d * ex - ox;
    ys[i] = a * p0.y + b * c1y + d * ey - oy;
  }
  if (wave !== 0) {
    const chordX = p2.x - p0.x;
    const chordY = p2.y - p0.y;
    const chordLen = Math.hypot(chordX, chordY) || 1;
    let waveX = -chordY / chordLen;
    let waveY = chordX / chordLen;
    if (waveX * (c.x - p0.x) + waveY * (c.y - p0.y) < 0) {
      waveX = -waveX;
      waveY = -waveY;
    }
    for (let i = 1; i < SAMPLES; i++) {
      const s = i / SAMPLES;
      const k = wave * 6.75 * s * s * (1 - s);
      xs[i] += waveX * k;
      ys[i] += waveY * k;
    }
  }
  xs[SAMPLES] += dirX * push;
  ys[SAMPLES] += dirY * push;

  let length = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    length += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }

  const tip = { x: xs[SAMPLES], y: ys[SAMPLES] };
  const dir = { x: dirX, y: dirY };

  if (length < 0.5) {
    return { body: '', gloss: '', glossWidth: 0, tip, dir, length };
  }

  const thick =
    (width - TONGUE_EDGE_WIDTH) *
    clamp(Math.sqrt(REST_LENGTH / Math.max(length, 1)), 0.8, 1);
  const padR =
    thick * 0.7 * smooth(clamp(length / PAD_GROW, 0, 1)) * (1 + 0.45 * bulge);

  const nx = new Float32Array(SAMPLES + 1);
  const ny = new Float32Array(SAMPLES + 1);
  const hw = new Float32Array(SAMPLES + 1);
  let lastTx = dirX;
  let lastTy = dirY;
  for (let i = 0; i <= SAMPLES; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(SAMPLES, i + 1);
    let tx = xs[i1] - xs[i0];
    let ty = ys[i1] - ys[i0];
    const tl = Math.hypot(tx, ty);
    if (tl < 0.001) {
      tx = lastTx;
      ty = lastTy;
    } else {
      tx /= tl;
      ty /= tl;
    }
    lastTx = tx;
    lastTy = ty;
    nx[i] = -ty;
    ny[i] = tx;

    const s = i / SAMPLES;
    const root = 0.78 + 0.22 * smooth(Math.min(1, (s * length) / ROOT_LEN));
    const base = (thick / 2) * (1 - 0.25 * s) * root;
    const fromTip = (1 - s) * length;
    const pad = fromTip < PAD_LEN ? smooth(1 - fromTip / PAD_LEN) : 0;
    hw[i] =
      (base + Math.max(0, padR - base) * pad) * (1 + 0.4 * bulge * s * s);
  }

  const parts: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    parts.push(
      `${i === 0 ? 'M' : 'L'}${r1(xs[i] + nx[i] * hw[i])} ${r1(
        ys[i] + ny[i] * hw[i],
      )}`,
    );
  }
  const tipTx = ny[SAMPLES];
  const tipTy = -nx[SAMPLES];
  for (let k = 1; k <= 6; k++) {
    const a = (k * Math.PI) / 7;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    parts.push(
      `L${r1(
        xs[SAMPLES] + (nx[SAMPLES] * cos + tipTx * sin) * hw[SAMPLES],
      )} ${r1(ys[SAMPLES] + (ny[SAMPLES] * cos + tipTy * sin) * hw[SAMPLES])}`,
    );
  }
  for (let i = SAMPLES; i >= 0; i--) {
    parts.push(`L${r1(xs[i] - nx[i] * hw[i])} ${r1(ys[i] - ny[i] * hw[i])}`);
  }
  const baseTx = ny[0];
  const baseTy = -nx[0];
  for (let k = 1; k <= 6; k++) {
    const a = (k * Math.PI) / 7;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    parts.push(
      `L${r1(xs[0] - (nx[0] * cos + baseTx * sin * BASE_CAP) * hw[0])} ${r1(
        ys[0] - (ny[0] * cos + baseTy * sin * BASE_CAP) * hw[0],
      )}`,
    );
  }
  parts.push('Z');

  let gloss = '';
  if (length > 28) {
    const g: string[] = [];
    for (let i = 2; i <= SAMPLES - 3; i++) {
      g.push(
        `${i === 2 ? 'M' : 'L'}${r1(xs[i] + nx[i] * side * hw[i] * 0.42)} ${r1(
          ys[i] + ny[i] * side * hw[i] * 0.42,
        )}`,
      );
    }
    gloss = g.join('');
  }

  return {
    body: parts.join(''),
    gloss,
    glossWidth: Math.max(1.2, thick * 0.2),
    tip,
    dir,
    length,
  };
}
