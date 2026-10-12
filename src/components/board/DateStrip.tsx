'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { dayLetterFromYmd, parseYmd, todayYmd, cmpYmd } from './helpers';

const VISIBLE = 7;
const COL_SELECTOR = '[data-col="true"]';

export type LiveDateStore = {
  get: () => string;
  set: (v: string) => void;
  subscribe: (fn: () => void) => () => void;
};

export function createLiveDateStore(initial: string): LiveDateStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      if (v === value) return;
      value = v;
      listeners.forEach((fn) => fn());
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function scrollProgress(s: HTMLElement): number {
  const cols = s.querySelectorAll<HTMLElement>(COL_SELECTOR);
  const n = cols.length;
  if (n === 0) return 0;
  const center = s.scrollLeft + s.clientWidth / 2;
  let prev = cols[0].offsetLeft + cols[0].clientWidth / 2;
  if (center <= prev) return 0;
  for (let i = 1; i < n; i++) {
    const c = cols[i].offsetLeft + cols[i].clientWidth / 2;
    if (center < c) return i - 1 + (center - prev) / (c - prev || 1);
    prev = c;
  }
  return n - 1;
}

export default function DateStrip({
  dates,
  scrollerRef,
  syncRef,
  liveDate,
  counts,
  onSelectDate,
}: {
  counts?: ReadonlyMap<string, number>;
  dates: string[];
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  syncRef: React.MutableRefObject<(() => void) | null>;
  liveDate: LiveDateStore;
  onSelectDate: (dateKey: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLElement | null>(null);
  const lastRef = useRef({ p: -1, w: -1, n: -1 });
  const datesRef = useRef(dates);
  datesRef.current = dates;
  const today = todayYmd();

  const sync = useCallback(
    (force = false) => {
      const s = scrollerRef.current;
      const vp = viewportRef.current;
      const track = trackRef.current;
      const pill = pillRef.current;
      if (!s || !vp || !track || !pill) return;
      const n = datesRef.current.length;
      const w = vp.clientWidth / VISIBLE;
      const p = Math.min(Math.max(scrollProgress(s), 0), Math.max(0, n - 1));
      const last = lastRef.current;
      if (!force && Math.abs(last.p - p) < 0.001 && last.w === w && last.n === n)
        return;
      lastRef.current = { p, w, n };

      const maxShift = Math.max(0, n - VISIBLE);
      const shift = Math.min(Math.max(p - (VISIBLE - 1) / 2, 0), maxShift);
      track.style.transform = `translate3d(${-shift * w}px,0,0)`;
      pill.style.width = `${w}px`;
      pill.style.transform = `translate3d(${p * w}px,0,0)`;

      const idx = Math.round(p);
      const cell = track.children[idx + 1] as HTMLElement | undefined;
      if (cell !== activeRef.current) {
        activeRef.current?.removeAttribute('data-active');
        activeRef.current?.removeAttribute('aria-current');
        cell?.setAttribute('data-active', 'true');
        cell?.setAttribute('aria-current', 'date');
        activeRef.current = cell ?? null;
      }
      const dk = datesRef.current[idx];
      if (dk) liveDate.set(dk);
    },
    [scrollerRef, liveDate],
  );

  useEffect(() => {
    const fn = () => sync();
    syncRef.current = fn;
    return () => {
      if (syncRef.current === fn) syncRef.current = null;
    };
  }, [sync, syncRef]);

  useLayoutEffect(() => {
    activeRef.current = null;
    sync(true);
  }, [dates, sync]);

  useEffect(() => {
    const s = scrollerRef.current;
    const vp = viewportRef.current;
    if (!s || !vp) return;
    const onScroll = () => sync();
    s.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => sync(true));
    ro.observe(vp);
    return () => {
      s.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [scrollerRef, sync]);

  return (
    <div ref={viewportRef} className="relative w-full overflow-hidden pb-2.5">
      <div
        ref={trackRef}
        className="relative flex will-change-transform"
        style={{ transform: 'translate3d(0,0,0)' }}
      >
        <div
          ref={pillRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 flex h-[58px] justify-center will-change-transform"
          style={{ width: `${100 / VISIBLE}%` }}
        >
          <span className="h-[58px] w-[44px] rounded-[16px] bg-primary shadow-[0_6px_14px_-6px_rgba(79,145,73,0.65)]" />
        </div>
        {dates.map((d) => {
          const isToday = d === today;
          const isPast = cmpYmd(d, today) < 0;
          const load = Math.min(3, counts?.get(d) ?? 0);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelectDate(d)}
              aria-label={parseYmd(d).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              className="group relative flex h-[58px] shrink-0 flex-col items-center justify-center gap-1 outline-none"
              style={{ width: `${100 / VISIBLE}%` }}
            >
              <span
                className={`text-[11px] font-bold uppercase leading-none tracking-wide transition-colors duration-150 group-data-[active=true]:text-primary-foreground/85 ${
                  isToday
                    ? 'text-primary'
                    : isPast
                      ? 'text-muted-foreground/40'
                      : 'text-muted-foreground'
                }`}
              >
                {dayLetterFromYmd(d)}
              </span>
              <span
                className={`text-[18px] font-black leading-none tabular-nums transition-colors duration-150 group-data-[active=true]:text-primary-foreground ${
                  isToday
                    ? 'text-primary'
                    : isPast
                      ? 'text-muted-foreground/45'
                      : 'text-foreground'
                }`}
              >
                {parseYmd(d).getDate()}
              </span>
              <span className="absolute -bottom-2 flex h-1 items-center gap-[3px]">
                {Array.from({ length: load }).map((_, n) => (
                  <span
                    key={n}
                    className={`h-1 w-1 rounded-full ${
                      isPast ? 'bg-muted-foreground/30' : 'bg-primary/55'
                    }`}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
