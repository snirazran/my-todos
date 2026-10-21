'use client';

type FlightOptions = {
  from: DOMRect;
  to?: Element | null;
  count: number;
  onFirstLand?: () => void;
  onAllLanded?: () => void;
};

let counterHolds = 0;
const holdListeners = new Set<() => void>();

function notifyHolds() {
  holdListeners.forEach((listener) => listener());
}

export function subscribeFlyCounterHold(listener: () => void) {
  holdListeners.add(listener);
  return () => {
    holdListeners.delete(listener);
  };
}

export function isFlyCounterHeld() {
  return counterHolds > 0;
}

export function holdFlyCounter(): () => void {
  counterHolds += 1;
  notifyHolds();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    counterHolds = Math.max(0, counterHolds - 1);
    notifyHolds();
  };
}

const FLY_SIZE = 30;
const MAX_FLIES = 8;
const STAGGER_MS = 55;
const BURST_MS = 280;

function onScreen(node: Element) {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

function painted(node: Element) {
  return typeof node.checkVisibility === 'function'
    ? node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    : true;
}

function findVisible(selector: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const node of nodes) {
    if (onScreen(node) && painted(node)) return node;
  }
  return null;
}

export function flyCounterState(): 'shown' | 'faded' | 'absent' {
  let faded = false;
  for (const node of Array.from(document.querySelectorAll('[data-fly-counter]'))) {
    if (!onScreen(node)) continue;
    if (painted(node)) return 'shown';
    faded = true;
  }
  return faded ? 'faded' : 'absent';
}

function findCounterTarget(): DOMRect | null {
  return findVisible('[data-fly-counter]')?.getBoundingClientRect() ?? null;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function createLayer() {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:10050;overflow:hidden;contain:strict';
  document.body.appendChild(layer);
  return layer;
}

export function flyFliesToCounter({ from, to, count, onFirstLand, onAllLanded }: FlightOptions): void {
  const target =
    typeof document === 'undefined'
      ? null
      : to
        ? to.getBoundingClientRect()
        : findCounterTarget();
  const reduceMotion = prefersReducedMotion();

  if (!target || reduceMotion || typeof document.body.animate !== 'function') {
    onFirstLand?.();
    onAllLanded?.();
    return;
  }

  const layer = createLayer();

  const startX = from.left + from.width / 2 - FLY_SIZE / 2;
  const startY = from.top + from.height / 2 - FLY_SIZE / 2;
  const dx = target.left + target.width / 2 - FLY_SIZE / 2 - startX;
  const dy = target.top + target.height / 2 - FLY_SIZE / 2 - startY;
  const total = Math.max(1, Math.min(count, MAX_FLIES));
  let landed = 0;

  const land = () => {
    landed += 1;
    if (landed === 1) onFirstLand?.();
    if (landed === total) {
      layer.remove();
      onAllLanded?.();
    }
  };

  for (let index = 0; index < total; index += 1) {
    const xLayer = document.createElement('div');
    const yLayer = document.createElement('div');
    const fly = document.createElement('img');
    fly.src = '/widgets/Fly.svg';
    fly.alt = '';
    xLayer.style.cssText = `position:absolute;left:${startX}px;top:${startY}px;width:${FLY_SIZE}px;height:${FLY_SIZE}px;will-change:transform`;
    yLayer.style.cssText = 'width:100%;height:100%;will-change:transform';
    fly.style.cssText =
      'display:block;width:100%;height:100%;will-change:transform,opacity;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.25))';
    yLayer.appendChild(fly);
    xLayer.appendChild(yLayer);
    layer.appendChild(xLayer);

    const angle = (index / total) * Math.PI * 2 + Math.random() * 0.7;
    const radius = 34 + Math.random() * 30;
    const burstX = Math.cos(angle) * radius;
    const burstY = Math.sin(angle) * radius;
    const flight = 560 + Math.random() * 160;
    const duration = BURST_MS + flight;
    const burstEnd = BURST_MS / duration;
    const delay = index * STAGGER_MS;
    const spin = (Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 16);
    const timing: KeyframeAnimationOptions = { duration, delay, fill: 'both' };

    xLayer.animate(
      [
        { transform: 'translate3d(0,0,0)', easing: 'cubic-bezier(0.2,0.9,0.3,1)' },
        {
          transform: `translate3d(${burstX}px,0,0)`,
          offset: burstEnd,
          easing: 'cubic-bezier(0.4,0,0.2,1)',
        },
        { transform: `translate3d(${dx}px,0,0)` },
      ],
      timing,
    );
    yLayer.animate(
      [
        { transform: 'translate3d(0,0,0)', easing: 'cubic-bezier(0.2,0.9,0.3,1)' },
        {
          transform: `translate3d(0,${burstY}px,0)`,
          offset: burstEnd,
          easing: 'cubic-bezier(0.6,0,0.9,0.4)',
        },
        { transform: `translate3d(0,${dy}px,0)` },
      ],
      timing,
    );
    const flyAnimation = fly.animate(
      [
        { transform: 'scale(0.3) rotate(0deg)', opacity: 0 },
        { transform: `scale(1.15) rotate(${spin}deg)`, opacity: 1, offset: burstEnd },
        { transform: `scale(0.85) rotate(${-spin}deg)`, opacity: 1, offset: 0.9 },
        { transform: 'scale(0.4) rotate(0deg)', opacity: 0 },
      ],
      timing,
    );
    flyAnimation.onfinish = land;
    flyAnimation.oncancel = land;
  }
}

const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#34d399',
  rare: '#38bdf8',
  epic: '#a78bfa',
  legendary: '#fbbf24',
};

const TOKEN_SIZE = 120;

type ItemFlightOptions = {
  from: DOMRect;
  visual: HTMLElement;
  rarity: string;
  onLand?: () => void;
};

let itemFlightsInAir = 0;
let landedWaiters: Array<() => void> = [];

export function afterItemFlightsLand(callback: () => void): void {
  if (itemFlightsInAir === 0) callback();
  else landedWaiters.push(callback);
}

function itemFlightEnded() {
  itemFlightsInAir = Math.max(0, itemFlightsInAir - 1);
  if (itemFlightsInAir > 0) return;
  const waiters = landedWaiters;
  landedWaiters = [];
  waiters.forEach((waiter) => waiter());
}

export function canFlyToInventory(): boolean {
  return (
    typeof document !== 'undefined' &&
    !prefersReducedMotion() &&
    typeof document.body.animate === 'function' &&
    !!findVisible('[data-inventory-target]')
  );
}

export function flyItemToInventory({ from, visual, rarity, onLand }: ItemFlightOptions): void {
  const targetNode =
    typeof document !== 'undefined' ? findVisible('[data-inventory-target]') : null;
  if (!targetNode || prefersReducedMotion() || typeof document.body.animate !== 'function') {
    onLand?.();
    return;
  }

  const color = RARITY_COLORS[rarity] ?? RARITY_COLORS.common;
  const target = targetNode.getBoundingClientRect();
  const layer = createLayer();
  itemFlightsInAir += 1;

  const startX = from.left + from.width / 2 - TOKEN_SIZE / 2;
  const startY = from.top + from.height / 2 - TOKEN_SIZE / 2;
  const endCenterX = target.left + target.width / 2;
  const endCenterY = target.top + target.height / 2;
  const dx = endCenterX - TOKEN_SIZE / 2 - startX;
  const dy = endCenterY - TOKEN_SIZE / 2 - startY;
  const endScale = Math.max(0.2, Math.min(target.width, target.height) / TOKEN_SIZE);
  const startScale = Math.max(1, Math.min(2.2, (Math.min(from.width, from.height) * 0.72) / TOKEN_SIZE));
  const goingDown = dy > 0;
  const lift = goingDown ? -Math.min(90, 40 + Math.abs(dy) * 0.12) : 0;

  const xLayer = document.createElement('div');
  const yLayer = document.createElement('div');
  const token = document.createElement('div');
  xLayer.style.cssText = `position:absolute;left:${startX}px;top:${startY}px;width:${TOKEN_SIZE}px;height:${TOKEN_SIZE}px;will-change:transform`;
  yLayer.style.cssText = 'width:100%;height:100%;will-change:transform';
  token.style.cssText = `position:relative;width:100%;height:100%;border-radius:24px;background:#fff;border:3px solid ${color};box-shadow:0 10px 24px -6px rgba(0,0,0,0.45),0 0 0 6px ${color}33;overflow:hidden;will-change:transform,opacity`;
  visual.style.position = 'absolute';
  visual.style.inset = '0';
  visual.style.width = '100%';
  visual.style.height = '100%';
  token.appendChild(visual);
  yLayer.appendChild(token);
  xLayer.appendChild(yLayer);
  layer.appendChild(xLayer);

  const duration = Math.round(Math.min(950, 640 + Math.hypot(dx, dy) * 0.35));
  const timing: KeyframeAnimationOptions = { duration, fill: 'both' };
  const hold = 0.16;

  xLayer.animate(
    [
      { transform: 'translate3d(0,0,0)', offset: 0 },
      { transform: 'translate3d(0,0,0)', offset: hold, easing: 'cubic-bezier(0.45,0,0.25,1)' },
      { transform: `translate3d(${dx}px,0,0)` },
    ],
    timing,
  );
  yLayer.animate(
    goingDown
      ? [
          { transform: 'translate3d(0,0,0)', offset: 0 },
          { transform: 'translate3d(0,0,0)', offset: hold, easing: 'cubic-bezier(0.2,0.7,0.4,1)' },
          { transform: `translate3d(0,${lift}px,0)`, offset: hold + 0.22, easing: 'cubic-bezier(0.55,0,0.9,0.45)' },
          { transform: `translate3d(0,${dy}px,0)` },
        ]
      : [
          { transform: 'translate3d(0,0,0)', offset: 0 },
          { transform: 'translate3d(0,0,0)', offset: hold, easing: 'cubic-bezier(0.6,0,0.85,0.45)' },
          { transform: `translate3d(0,${dy}px,0)` },
        ],
    timing,
  );
  const tokenAnimation = token.animate(
    [
      { transform: `scale(${startScale}) rotate(0deg)`, opacity: 1, offset: 0, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
      { transform: `scale(${startScale * 1.06}) rotate(-6deg)`, opacity: 1, offset: hold },
      { transform: `scale(${Math.max(endScale * 1.6, 0.45)}) rotate(8deg)`, opacity: 1, offset: 0.82 },
      { transform: `scale(${endScale}) rotate(0deg)`, opacity: 0 },
    ],
    timing,
  );

  tokenAnimation.onfinish = () => {
    xLayer.remove();
    landBurst(layer, endCenterX, endCenterY, color);
    targetNode.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.28) rotate(-6deg)', offset: 0.35 },
        { transform: 'scale(0.94) rotate(3deg)', offset: 0.7 },
        { transform: 'scale(1)' },
      ],
      { duration: 460, easing: 'ease-out' },
    );
    onLand?.();
    itemFlightEnded();
  };
  tokenAnimation.oncancel = () => {
    layer.remove();
    onLand?.();
    itemFlightEnded();
  };
}

function landBurst(layer: HTMLElement, x: number, y: number, color: string) {
  const ring = document.createElement('div');
  const ringSize = 56;
  ring.style.cssText = `position:absolute;left:${x - ringSize / 2}px;top:${y - ringSize / 2}px;width:${ringSize}px;height:${ringSize}px;border-radius:9999px;border:3px solid ${color};will-change:transform,opacity`;
  layer.appendChild(ring);
  const ringAnimation = ring.animate(
    [
      { transform: 'scale(0.3)', opacity: 1 },
      { transform: 'scale(1.6)', opacity: 0 },
    ],
    { duration: 520, easing: 'cubic-bezier(0.2,0.8,0.3,1)', fill: 'both' },
  );

  const sparks = 7;
  for (let index = 0; index < sparks; index += 1) {
    const spark = document.createElement('div');
    const size = 6 + (index % 3) * 2;
    spark.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:2px;background:${index % 2 ? color : '#fde68a'};will-change:transform,opacity`;
    layer.appendChild(spark);
    const angle = (index / sparks) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 26 + Math.random() * 18;
    spark.animate(
      [
        { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1 },
        {
          transform: `translate3d(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px,0) rotate(120deg) scale(0.4)`,
          opacity: 0,
        },
      ],
      { duration: 480, easing: 'cubic-bezier(0.2,0.8,0.3,1)', fill: 'both' },
    );
  }

  ringAnimation.onfinish = () => layer.remove();
  ringAnimation.oncancel = () => layer.remove();
}
