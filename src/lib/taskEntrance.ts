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
      CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)');
  }
  return linearSupported;
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

const rowPop = () => springCurve(300, 22, 'cubic-bezier(0.34, 1.36, 0.64, 1)');
const flyPop = () => springCurve(520, 20, 'cubic-bezier(0.34, 1.8, 0.64, 1)');
export const listSlide = () =>
  springCurve(380, 36, 'cubic-bezier(0.2, 0, 0, 1)');

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
  if (!scroller) return;
  const box = scroller.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const isPage = scroller.tagName === 'MAIN';
  const top = box.top + 8;
  const bottom = Math.min(box.bottom, window.innerHeight) - (isPage ? 150 : 8);
  if (r.top >= top && r.bottom <= bottom) return;
  const delta = r.bottom > bottom ? r.bottom - bottom : r.top - top;
  scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' });
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
    s.style.backgroundColor = i % 2 ? '#f59e0b' : '#4f9149';
    burst.appendChild(s);
  }
  row.appendChild(burst);
  window.setTimeout(() => burst.remove(), delay + 900);
}

export function playTaskEntrance(
  row: HTMLElement,
  id: string,
  { moveFollowers = true }: { moveFollowers?: boolean } = {},
) {
  playedIds.add(id);
  if (playedRows.has(row) || typeof row.animate !== 'function') return;
  playedRows.add(row);

  const rect = row.getBoundingClientRect();
  if (rect.right < 0 || rect.left > window.innerWidth || rect.height === 0) return;

  const scroller = scrollParent(row);
  revealInScroller(row, scroller);

  if (prefersReducedMotion()) {
    row.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 220,
      easing: 'ease-out',
    });
    return;
  }

  const stagger = Math.round((Math.max(0, rect.left) / window.innerWidth) * 140);
  const height = row.offsetHeight;

  if (moveFollowers && height > 0) {
    const slide = listSlide();
    for (const el of followersOf(row, scroller)) {
      el.animate(
        [
          { transform: `translate3d(0, ${-height}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        {
          duration: slide.duration,
          easing: slide.easing,
          delay: stagger,
          fill: 'backwards',
          composite: 'add',
        },
      );
    }
  }

  const pop = rowPop();
  const enterDelay = stagger + 70;
  row.animate(
    [
      { transform: 'translate3d(0, 16px, 0) scale(0.93)' },
      { transform: 'translate3d(0, 0, 0) scale(1)' },
    ],
    {
      duration: pop.duration,
      easing: pop.easing,
      delay: enterDelay,
      fill: 'backwards',
      composite: 'add',
    },
  );
  row.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 260,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    delay: enterDelay,
    fill: 'backwards',
  });

  const fx = document.createElement('span');
  fx.setAttribute('aria-hidden', 'true');
  fx.className = 'task-enter-fx';
  fx.style.setProperty('--fx-delay', `${enterDelay}ms`);
  row.appendChild(fx);
  window.setTimeout(() => fx.remove(), enterDelay + 1400);

  const fly = row.querySelector<HTMLElement>('[data-fly-slot]');
  const landAt = enterDelay + 170;
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
