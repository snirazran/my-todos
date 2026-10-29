'use client';

import type { Rarity } from '@/lib/skins/catalog';

export const FROG_EMOTES = [
  'love',
  'loveHeartbeat',
  'loveShy',
  'loveBurst',
  'question',
  'hop',
  'celebrate',
  'tada',
  'surprised',
  'dizzy',
  'sweat',
] as const;

export type FrogEmote = (typeof FROG_EMOTES)[number];
export type FrogEmoteLoop = 'love' | 'loveOrbit' | 'question';

export const EMOTE_MS: Record<FrogEmote, number> = {
  love: 2000,
  loveHeartbeat: 2180,
  loveShy: 2180,
  loveBurst: 1820,
  question: 2750,
  hop: 1820,
  celebrate: 2910,
  tada: 2730,
  surprised: 1820,
  dizzy: 3280,
  sweat: 2550,
};

const EMOTE_WEIGHT: Record<FrogEmote, number> = {
  love: 1,
  loveShy: 1,
  hop: 1,
  surprised: 1,
  question: 1,
  loveHeartbeat: 2,
  sweat: 2,
  dizzy: 2,
  celebrate: 3,
  tada: 3,
  loveBurst: 3,
};

export const outranks = (next: FrogEmote, current: FrogEmote) =>
  EMOTE_WEIGHT[next] >= EMOTE_WEIGHT[current];

const CUTS_IN: ReadonlySet<FrogEmote> = new Set<FrogEmote>(['celebrate', 'tada']);

export const cutsIn = (name: FrogEmote) => CUTS_IN.has(name);

export type FrogMoment =
  | 'catch'
  | 'combo'
  | 'bigCombo'
  | 'miss'
  | 'taskAdded'
  | 'equip'
  | 'tryOn'
  | 'greet'
  | 'welcomeBack'
  | 'cheer'
  | 'milestone'
  | 'sent'
  | 'pick'
  | 'poke'
  | 'pokeTwitchy'
  | 'pokeHarassed'
  | 'pokeResigned'
  | 'fidget'
  | 'fidgetHungry';

const MOMENT_POOLS: Record<FrogMoment, readonly FrogEmote[]> = {
  catch: ['love', 'hop', 'love', 'hop', 'loveShy', 'loveHeartbeat'],
  combo: ['celebrate', 'hop', 'celebrate'],
  bigCombo: ['tada', 'celebrate'],
  miss: ['sweat', 'dizzy'],
  taskAdded: ['hop', 'love', 'loveShy'],
  equip: ['loveShy', 'love', 'hop'],
  tryOn: ['loveShy', 'hop', 'love'],
  greet: ['hop', 'love', 'hop', 'love', 'loveHeartbeat'],
  welcomeBack: ['loveBurst', 'celebrate'],
  cheer: ['celebrate', 'hop'],
  milestone: ['tada', 'loveBurst'],
  sent: ['loveHeartbeat', 'love'],
  pick: ['hop', 'love', 'loveShy'],
  poke: ['love', 'hop', 'loveShy'],
  pokeTwitchy: ['surprised', 'sweat', 'surprised'],
  pokeHarassed: ['dizzy', 'sweat', 'surprised', 'dizzy'],
  pokeResigned: ['dizzy', 'sweat'],
  fidget: ['hop', 'love', 'loveShy', 'question', 'hop', 'love'],
  fidgetHungry: ['question', 'sweat', 'question'],
};

const lastPick: Partial<Record<FrogMoment, FrogEmote>> = {};

export function pickEmote(moment: FrogMoment): FrogEmote {
  const pool = MOMENT_POOLS[moment];
  const fresh = pool.filter((name) => name !== lastPick[moment]);
  const options = fresh.length > 0 ? fresh : pool;
  const name = options[Math.floor(Math.random() * options.length)];
  lastPick[moment] = name;
  return name;
}

export function catchEmote(combo: number, golden: boolean): FrogEmote {
  if (golden) return 'loveBurst';
  if (combo >= 3) return pickEmote('bigCombo');
  if (combo >= 1) return pickEmote('combo');
  return pickEmote('catch');
}

export const TAP_STREAK_MS = 20_000;

export function pokeEmote(streak: number): FrogEmote {
  if (streak >= 10) return pickEmote('pokeResigned');
  if (streak >= 6) return pickEmote('pokeHarassed');
  if (streak >= 3) return pickEmote('pokeTwitchy');
  return pickEmote('poke');
}

const RARITY_EMOTE: Record<Rarity, FrogEmote> = {
  common: 'hop',
  uncommon: 'love',
  rare: 'celebrate',
  epic: 'tada',
  legendary: 'loveBurst',
};

export const rarityEmote = (rarity: Rarity | null | undefined): FrogEmote =>
  (rarity && RARITY_EMOTE[rarity]) || 'love';

const FROG_REACT_EVENT = 'frogress:frog-react';

export function frogReact(emote: FrogEmote) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<FrogEmote>(FROG_REACT_EVENT, { detail: emote }),
  );
}

export function onFrogReact(listener: (emote: FrogEmote) => void) {
  const handler = (event: Event) =>
    listener((event as CustomEvent<FrogEmote>).detail);
  window.addEventListener(FROG_REACT_EVENT, handler);
  return () => window.removeEventListener(FROG_REACT_EVENT, handler);
}

const GREETED_AT_KEY = 'frogress.frog-greeted-at';
const GREET_GAP_MS = 4 * 60 * 60 * 1000;
const WELCOME_BACK_MS = 3 * 24 * 60 * 60 * 1000;

export function takeGreeting(): FrogEmote | null {
  try {
    const now = Date.now();
    const last = Number(window.localStorage.getItem(GREETED_AT_KEY)) || 0;
    if (now - last < GREET_GAP_MS) return null;
    window.localStorage.setItem(GREETED_AT_KEY, String(now));
    return last && now - last > WELCOME_BACK_MS
      ? pickEmote('welcomeBack')
      : pickEmote('greet');
  } catch {
    return null;
  }
}

type Pokeable = {
  element: () => HTMLElement | null;
  hitTest: (clientX: number, clientY: number) => boolean;
  poke: () => void;
};

const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 500;
const NOT_A_POKE =
  'button, a[href], input, textarea, select, label, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [contenteditable="true"], [data-no-frog-poke]';

const pokeables: Pokeable[] = [];
const pointerDowns = new Map<number, { x: number; y: number; t: number }>();

function onPointerDown(event: PointerEvent) {
  if (!event.isPrimary) return;
  pointerDowns.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    t: event.timeStamp,
  });
}

function onPointerEnd(event: PointerEvent) {
  const down = pointerDowns.get(event.pointerId);
  pointerDowns.delete(event.pointerId);
  if (!down || event.type !== 'pointerup') return;
  if (event.timeStamp - down.t > TAP_MAX_MS) return;
  const { clientX, clientY } = event;
  if (Math.hypot(clientX - down.x, clientY - down.y) > TAP_SLOP_PX) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(NOT_A_POKE)) return;
  const top = document.elementFromPoint(clientX, clientY);
  if (!top || top.closest(NOT_A_POKE)) return;
  for (let i = pokeables.length - 1; i >= 0; i--) {
    const entry = pokeables[i];
    const el = entry.element();
    if (!el || !(el.contains(top) || top.contains(el))) continue;
    if (!entry.hitTest(clientX, clientY)) continue;
    entry.poke();
    return;
  }
}

export function registerPokeable(entry: Pokeable) {
  if (pokeables.length === 0) {
    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointerdown', onPointerDown, opts);
    document.addEventListener('pointerup', onPointerEnd, opts);
    document.addEventListener('pointercancel', onPointerEnd, opts);
  }
  pokeables.push(entry);
  return () => {
    const index = pokeables.indexOf(entry);
    if (index >= 0) pokeables.splice(index, 1);
    if (pokeables.length > 0) return;
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerEnd, true);
    document.removeEventListener('pointercancel', onPointerEnd, true);
    pointerDowns.clear();
  };
}
