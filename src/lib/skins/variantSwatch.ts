import type { ItemDef } from './catalog';

const NAMED: Record<string, string> = {
  red: '#ef4444',
  ruby: '#e11d48',
  rose: '#fb7185',
  pink: '#f472b6',
  bubblegum: '#f9a8d4',
  berry: '#be185d',
  orange: '#fb923c',
  peach: '#fdba74',
  yellow: '#facc15',
  gold: '#f59e0b',
  golden: '#f59e0b',
  green: '#22c55e',
  lime: '#84cc16',
  mint: '#6ee7b7',
  teal: '#14b8a6',
  cyan: '#22d3ee',
  blue: '#3b82f6',
  sapphire: '#2563eb',
  navy: '#1e3a8a',
  sky: '#38bdf8',
  purple: '#a855f7',
  violet: '#8b5cf6',
  lavender: '#c4b5fd',
  orchid: '#da70d6',
  plum: '#8e4585',
  brown: '#92400e',
  black: '#1f2937',
  white: '#f8fafc',
  grey: '#9ca3af',
  gray: '#9ca3af',
  silver: '#cbd5e1',
};

const NEON: Record<string, string> = {
  green: '#39ff6a',
  pink: '#ff4fd8',
  blue: '#3d9bff',
  yellow: '#f5ff3d',
  orange: '#ff8a3d',
  purple: '#b84dff',
};

const SPECIAL: Record<string, string> = {
  rainbow: 'conic-gradient(#ef4444, #f59e0b, #facc15, #22c55e, #3b82f6, #a855f7, #ef4444)',
  cool: 'linear-gradient(135deg, #38bdf8, #a78bfa)',
  warm: 'linear-gradient(135deg, #fb923c, #f472b6)',
};

const split = (a: string, b: string) => `linear-gradient(135deg, ${a} 50%, ${b} 50%)`;

function fromCsv(color: string) {
  const [a, b] = color.split('/');
  return b ? split(a, b) : a;
}

function fromName(name: string) {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const picked: string[] = [];
  for (let i = 0; i < words.length && picked.length < 2; i++) {
    const word = words[i];
    if (SPECIAL[word]) return SPECIAL[word];
    const neon = words[i - 1] === 'neon' ? NEON[word] : undefined;
    const hex = neon ?? NAMED[word];
    if (hex && !picked.includes(hex)) picked.push(hex);
  }
  if (picked.length === 2) return split(picked[0], picked[1]);
  if (picked.length === 1) return picked[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 68% 60%)`;
}

export function variantSwatch(item: Pick<ItemDef, 'name' | 'color'>) {
  return item.color ? fromCsv(item.color) : fromName(item.name);
}
