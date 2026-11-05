'use client';

import { hapticTick } from '@/lib/haptics';

const FRESH_TTL_MS = 4000;
const fresh = new Map<string, number>();
const playedIds = new Set<string>();
const playedRows = new WeakSet<Element>();

export function markFreshTasks(
  ids: ReadonlyArray<string | null | undefined> | null | undefined,
) {
  if (!ids) return;
  const until = Date.now() + FRESH_TTL_MS;
  ids.forEach((id) => {
    if (!id) return;
    fresh.set(id, until);
    playedIds.delete(id);
  });
}

let pendingOrigin: { rect: DOMRect; until: number } | null = null;

export function launchTaskEntranceFrom(rect: DOMRect) {
  preloadFly();
  pendingOrigin = { rect, until: Date.now() + FRESH_TTL_MS };
}

function takeOrigin() {
  const origin = pendingOrigin;
  pendingOrigin = null;
  return origin && origin.until > Date.now() ? origin.rect : null;
}

export function isFreshTask(id: string) {
  const until = fresh.get(id);
  if (until === undefined) return false;
  if (until < Date.now()) {
    fresh.delete(id);
    return false;
  }
  return true;
}

export function hasPendingFreshTasks() {
  if (fresh.size === 0) return false;
  const now = Date.now();
  let pending = false;
  fresh.forEach((until, id) => {
    if (until < now) {
      fresh.delete(id);
      playedIds.delete(id);
    } else if (!playedIds.has(id)) pending = true;
  });
  return pending;
}

type Curve = { easing: string; duration: number };

let linearSupported: boolean | null = null;
function supportsLinear() {
  if (linearSupported === null) {
    linearSupported =
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)') &&
      !isWebKit();
  }
  return linearSupported;
}

function isWebKit() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/(Chrome|Chromium|Edg|OPR|Android)\//.test(ua);
}

function springPosition(stiffness: number, damping: number, t: number) {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return (
      1 -
      Math.exp(-zeta * w0 * t) *
        (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    );
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

const curveCache = new Map<string, Curve>();
function springCurve(stiffness: number, damping: number, fallback: string): Curve {
  const key = `${stiffness}:${damping}`;
  const cached = curveCache.get(key);
  if (cached) return cached;
  let settle = 2;
  for (let t = 2; t > 0; t -= 1 / 240) {
    if (Math.abs(1 - springPosition(stiffness, damping, t)) > 0.0015) {
      settle = t + 1 / 240;
      break;
    }
  }
  const duration = Math.round(settle * 1000);
  let curve: Curve;
  if (supportsLinear()) {
    const steps = 56;
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = i === steps ? 1 : springPosition(stiffness, damping, (settle * i) / steps);
      points.push(String(Math.round(v * 10000) / 10000));
    }
    curve = { easing: `linear(${points.join(', ')})`, duration };
  } else {
    curve = { easing: fallback, duration: Math.min(duration, 650) };
  }
  curveCache.set(key, curve);
  return curve;
}

const flyPop = () => springCurve(520, 20, 'cubic-bezier(0.34, 1.8, 0.64, 1)');
export const listSlide = () =>
  springCurve(380, 36, 'cubic-bezier(0.2, 0, 0, 1)');
export const morphPop = () =>
  springCurve(260, 21, 'cubic-bezier(0.34, 1.3, 0.64, 1)');
export const SMOOTH_SPRING: Curve = {
  easing: 'cubic-bezier(0.2, 0.25, 0.15, 1)',
  duration: 520,
};

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight + 1
    )
      return node;
    node = node.parentElement;
  }
  return null;
}

function isInFlow(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const { position, display } = getComputedStyle(el);
  return (
    display !== 'none' &&
    display !== 'contents' &&
    (position === 'static' || position === 'relative')
  );
}

function followersOf(row: HTMLElement, stopAt: HTMLElement | null) {
  const out: HTMLElement[] = [];
  const limit = window.innerHeight + 40;
  let node: HTMLElement | null = row;
  while (node && node !== stopAt && node !== document.body) {
    for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
      if (!isInFlow(sib)) continue;
      if (sib.getBoundingClientRect().top > limit) break;
      out.push(sib);
      if (out.length >= 24) return out;
    }
    node = node.parentElement;
  }
  return out;
}

function revealInScroller(row: HTMLElement, scroller: HTMLElement | null) {
  if (!scroller) return 0;
  const box = scroller.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const isPage = scroller.tagName === 'MAIN';
  const top = box.top + 8;
  const bottom = Math.min(box.bottom, window.innerHeight) - (isPage ? 150 : 8);
  if (r.top >= top && r.bottom <= bottom) return 0;
  const delta = r.bottom > bottom ? r.bottom - bottom : r.top - top;
  const max = scroller.scrollHeight - scroller.clientHeight;
  const next = Math.max(0, Math.min(max, scroller.scrollTop + delta));
  const applied = next - scroller.scrollTop;
  scroller.scrollTo({ top: next, behavior: 'smooth' });
  return applied;
}

const FLIGHT_MS = 540;
const FLY_SRC = '/widgets/Fly.svg';
let flyPreloaded = false;

function preloadFly() {
  if (flyPreloaded || typeof Image === 'undefined') return;
  flyPreloaded = true;
  const img = new Image();
  img.src = FLY_SRC;
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      if (sampleX(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

const easeAcross = cubicBezier(0.45, 0, 0.25, 1);
const easeDip = cubicBezier(0.2, 0.7, 0.4, 1);
const easeRise = cubicBezier(0.5, 0, 0.3, 1);
const DIP_AT = 0.16;
const FLY_FRAMES: ReadonlyArray<[number, number, number, number]> = [
  [0, 0.5, 0, 0],
  [0.22, 1.12, -1, 1],
  [0.7, 1.04, 0.6, 1],
  [0.96, 0.92, 0, 1],
  [1, 0.92, 0, 0],
];

function flyFrame(p: number) {
  for (let i = 1; i < FLY_FRAMES.length; i++) {
    const b = FLY_FRAMES[i];
    if (p <= b[0]) {
      const a = FLY_FRAMES[i - 1];
      const k = (p - a[0]) / (b[0] - a[0]);
      return {
        scale: a[1] + (b[1] - a[1]) * k,
        turn: a[2] + (b[2] - a[2]) * k,
        opacity: a[3] + (b[3] - a[3]) * k,
      };
    }
  }
  const last = FLY_FRAMES[FLY_FRAMES.length - 1];
  return { scale: last[1], turn: last[2], opacity: last[3] };
}

function flyIntoSlot(origin: DOMRect, slot: HTMLElement) {
  const first = slot.getBoundingClientRect();
  const size = Math.max(28, Math.min(40, first.width * 0.86));
  const startX = origin.left + origin.width / 2;
  const startY = origin.top + origin.height / 2;
  let targetX = first.left + first.width / 2;
  let targetY = first.top + first.height / 2;
  const lift = Math.min(70, Math.abs(targetY - startY) * 0.18);
  const wobble = targetX >= startX ? 16 : -16;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:10050;overflow:hidden';
  const body = document.createElement('div');
  body.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;opacity:0;will-change:transform,opacity;transform:translate3d(${startX - size / 2}px,${startY - size / 2}px,0) scale(0.5)`;
  const fly = document.createElement('img');
  fly.src = FLY_SRC;
  fly.alt = '';
  fly.decoding = 'sync';
  fly.draggable = false;
  fly.style.cssText =
    'display:block;width:100%;height:100%;filter:drop-shadow(0 3px 4px rgba(15,23,42,0.22))';
  body.appendChild(fly);
  layer.appendChild(body);
  document.body.appendChild(layer);

  let raf = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.cancelAnimationFrame(raf);
    window.clearTimeout(fallback);
    document.removeEventListener('visibilitychange', onHidden);
    layer.style.display = 'none';
    window.setTimeout(() => layer.remove(), 48);
  };
  const onHidden = () => {
    if (document.visibilityState === 'hidden') finish();
  };
  const fallback = window.setTimeout(finish, FLIGHT_MS + 400);
  document.addEventListener('visibilitychange', onHidden);

  const begin = performance.now();
  const tick = (now: number) => {
    if (finished) return;
    const p = Math.min(1, Math.max(0, (now - begin) / FLIGHT_MS));
    if (slot.isConnected) {
      const r = slot.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        targetX = r.left + r.width / 2;
        targetY = r.top + r.height / 2;
      }
    }
    const x = startX + (targetX - startX) * easeAcross(p);
    const y =
      p < DIP_AT
        ? startY + lift * easeDip(p / DIP_AT)
        : startY + lift + (targetY - startY - lift) * easeRise((p - DIP_AT) / (1 - DIP_AT));
    const f = flyFrame(p);
    body.style.transform = `translate3d(${x - size / 2}px,${y - size / 2}px,0) scale(${f.scale}) rotate(${f.turn * wobble}deg)`;
    body.style.opacity = String(f.opacity);
    if (p < 1) raf = window.requestAnimationFrame(tick);
    else finish();
  };
  raf = window.requestAnimationFrame(tick);
}

function sparkBurst(row: HTMLElement, fly: HTMLElement, delay: number) {
  const host = row.getBoundingClientRect();
  const f = fly.getBoundingClientRect();
  const burst = document.createElement('span');
  burst.setAttribute('aria-hidden', 'true');
  burst.className = 'task-enter-sparks';
  burst.style.left = `${f.left - host.left + f.width / 2}px`;
  burst.style.top = `${f.top - host.top + f.height / 2}px`;
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('span');
    s.className = 'task-enter-spark';
    s.style.setProperty('--spark-angle', `${i * 45 + 22}deg`);
    s.style.animationDelay = `${delay + i * 14}ms`;
    s.style.backgroundColor = i % 2 ? '#f59e0b' : '#447d3f';
    burst.appendChild(s);
  }
  row.appendChild(burst);
  window.setTimeout(() => burst.remove(), delay + 900);
}

export function slideFollowers(row: HTMLElement, delta: number) {
  if (Math.abs(delta) < 1 || typeof row.animate !== 'function') return;
  if (prefersReducedMotion()) return;
  const slide = listSlide();
  for (const el of followersOf(row, scrollParent(row))) {
    el.animate(
      [
        { transform: `translate3d(0, ${-delta}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' },
      ],
      {
        duration: slide.duration,
        easing: slide.easing,
        composite: 'add',
      },
    );
  }
}

const FLIP_SELECTOR =
  '[data-row],[data-section-header],[data-completed-divider],[data-list-footer]';

export type FlipSnapshot = Map<HTMLElement, number>;

export function captureListFlip(root: HTMLElement | null): FlipSnapshot {
  const snap: FlipSnapshot = new Map();
  if (!root || typeof root.animate !== 'function') return snap;
  root.querySelectorAll<HTMLElement>(FLIP_SELECTOR).forEach((el) => {
    if (isInFlow(el)) snap.set(el, el.getBoundingClientRect().top);
  });
  for (const el of followersOf(root, scrollParent(root))) {
    snap.set(el, el.getBoundingClientRect().top);
  }
  return snap;
}

export function playListFlip(
  snap: FlipSnapshot,
  curve: Curve = SMOOTH_SPRING,
) {
  if (snap.size === 0 || prefersReducedMotion()) return;
  const moves: [HTMLElement, number][] = [];
  snap.forEach((before, el) => {
    if (!el.isConnected || !isInFlow(el)) return;
    const delta = before - el.getBoundingClientRect().top;
    if (Math.abs(delta) >= 0.5) moves.push([el, delta]);
  });
  for (const [el, delta] of moves) {
    el.animate(
      [
        { transform: `translate3d(0, ${delta}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: curve.duration, easing: curve.easing, composite: 'add' },
    );
  }
}

export function revealRows(rows: HTMLElement[], curve: Curve = SMOOTH_SPRING) {
  if (prefersReducedMotion()) return;
  rows.forEach((el, i) => {
    const delay = Math.min(i, 6) * 28;
    el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      delay,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      fill: 'backwards',
    });
    el.animate(
      [
        { transform: 'translate3d(0, -10px, 0) scale(0.98)' },
        { transform: 'translate3d(0, 0, 0) scale(1)' },
      ],
      {
        duration: curve.duration,
        delay,
        easing: curve.easing,
        composite: 'add',
        fill: 'backwards',
      },
    );
  });
}

const LIFT_SHADOW =
  '0 22px 44px -14px rgba(15, 23, 42, 0.38), 0 6px 14px -6px rgba(15, 23, 42, 0.18)';
const SETTLED_SHADOW =
  '0 22px 44px -14px rgba(15, 23, 42, 0), 0 6px 14px -6px rgba(15, 23, 42, 0)';
const LAND_MS = 440;
const LAND_AT = 0.45;

function slideDown(el: Element, by: number, delay: number) {
  const slide = listSlide();
  el.animate(
    [
      { transform: `translate3d(0, ${-by}px, 0)` },
      { transform: 'translate3d(0, 0, 0)' },
    ],
    {
      duration: slide.duration,
      easing: slide.easing,
      delay,
      fill: 'backwards',
      composite: 'add',
    },
  );
}

function openColumnGap(
  row: HTMLElement,
  column: HTMLElement,
  height: number,
  delay: number,
) {
  const list = column.querySelector<HTMLElement>('[data-column-list]');
  if (!list || !list.contains(row)) return;
  for (const el of followersOf(row, list)) slideDown(el, height, delay);
  if (list.querySelectorAll('[data-row]').length < 2) return;
  const growth = Math.max(
    0,
    Math.min(height, list.clientHeight - (list.scrollHeight - height)),
  );
  if (growth < 1) return;
  for (let sib = list.nextElementSibling; sib; sib = sib.nextElementSibling) {
    if (isInFlow(sib)) slideDown(sib, growth, delay);
  }
  const slide = listSlide();
  const radius = getComputedStyle(column).borderBottomLeftRadius;
  column.animate(
    [
      { clipPath: `inset(0 0 ${growth}px 0 round ${radius})` },
      { clipPath: `inset(0 0 0px 0 round ${radius})` },
    ],
    { duration: slide.duration, easing: slide.easing, delay, fill: 'backwards' },
  );
}

function landCard(card: HTMLElement, delay: number) {
  card.animate(
    [
      {
        transform: 'translate3d(0, -6px, 0) scale(1.035)',
        easing: 'cubic-bezier(0.4, 0, 0.7, 0.6)',
      },
      {
        transform: 'translate3d(0, 0, 0) scale(0.985)',
        offset: LAND_AT,
        easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)',
      },
      { transform: 'translate3d(0, 0, 0) scale(1)' },
    ],
    { duration: LAND_MS, delay, fill: 'backwards', composite: 'add' },
  );
  card.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 180,
    easing: 'ease-out',
    delay,
    fill: 'backwards',
  });
  const base = getComputedStyle(card).boxShadow;
  const over = (shadow: string) =>
    base && base !== 'none' ? `${base}, ${shadow}` : shadow;
  card.animate(
    [{ boxShadow: over(LIFT_SHADOW) }, { boxShadow: over(SETTLED_SHADOW) }],
    {
      duration: Math.round(LAND_MS * LAND_AT),
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      delay,
      fill: 'backwards',
    },
  );
}

export function playTaskEntrance(
  row: HTMLElement,
  id: string,
  {
    card: cardEl,
    followers = 'page',
  }: { card?: HTMLElement | null; followers?: 'page' | 'column' } = {},
) {
  playedIds.add(id);
  if (playedRows.has(row) || typeof row.animate !== 'function') return;
  playedRows.add(row);

  const rect = row.getBoundingClientRect();
  if (rect.right < 0 || rect.left > window.innerWidth || rect.height === 0) return;

  const card = cardEl ?? row;
  const scroller = scrollParent(row);
  revealInScroller(row, scroller);
  const origin = takeOrigin();

  if (prefersReducedMotion()) {
    card.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 220,
      easing: 'ease-out',
    });
    return;
  }

  const stagger = Math.round((Math.max(0, rect.left) / window.innerWidth) * 140);
  const height = row.offsetHeight;

  if (height > 0) {
    if (followers === 'page') {
      for (const el of followersOf(row, scroller)) slideDown(el, height, stagger);
    } else {
      const column = row.closest<HTMLElement>('[data-column]');
      if (column) openColumnGap(row, column, height, stagger);
    }
  }

  const enterDelay = stagger + 90;
  landCard(card, enterDelay);
  const impactAt = enterDelay + Math.round(LAND_MS * LAND_AT);

  const fx = document.createElement('span');
  fx.setAttribute('aria-hidden', 'true');
  fx.className = 'task-enter-fx';
  fx.style.setProperty('--fx-delay', `${impactAt - 40}ms`);
  card.appendChild(fx);
  window.setTimeout(() => fx.remove(), impactAt + 1200);

  const fly = row.querySelector<HTMLElement>('[data-fly-slot]');
  let landAt = impactAt;
  if (fly && origin) {
    flyIntoSlot(origin, fly);
    landAt = Math.max(landAt, FLIGHT_MS - 30);
  }
  if (fly) {
    const bounce = flyPop();
    fly.animate(
      [
        { transform: 'scale(0.2) rotate(-25deg)' },
        { transform: 'scale(1) rotate(0deg)' },
      ],
      {
        duration: bounce.duration,
        easing: bounce.easing,
        delay: landAt,
        fill: 'backwards',
        composite: 'add',
      },
    );
    fly.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 160,
      easing: 'ease-out',
      delay: landAt,
      fill: 'backwards',
    });
    sparkBurst(row, fly, landAt + 90);
  }
  window.setTimeout(() => hapticTick(), landAt + 60);
}
