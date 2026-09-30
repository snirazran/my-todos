'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';

type FlySource = Element | DOMRect | null | undefined;

type FlyJarContextValue = {
  count: number;
  award: (key: string, amount: number, from?: FlySource) => void;
  setTarget: (element: HTMLElement | null) => void;
  bump: number;
};

const FlyJarContext = createContext<FlyJarContextValue | null>(null);

const FLIGHT_MS = 780;
const STAGGER_MS = 110;

function rectOf(source: FlySource) {
  if (!source) return null;
  return source instanceof DOMRect ? source : source.getBoundingClientRect();
}

export function FlyJarProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const [bump, setBump] = useState(0);
  const awardedRef = useRef(new Set<string>());
  const targetRef = useRef<HTMLElement | null>(null);

  const land = useCallback(() => {
    setCount((value) => value + 1);
    setBump((value) => value + 1);
  }, []);

  const setTarget = useCallback((element: HTMLElement | null) => {
    targetRef.current = element;
  }, []);

  const award = useCallback(
    (key: string, amount: number, from?: FlySource) => {
      if (awardedRef.current.has(key) || amount <= 0) return;
      awardedRef.current.add(key);

      const start = rectOf(from);
      const end = targetRef.current?.getBoundingClientRect();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!start || !end || reduced || end.width === 0) {
        for (let i = 0; i < amount; i += 1) land();
        return;
      }

      const size = 34;
      const x0 = start.left + start.width / 2 - size / 2;
      const y0 = start.top + start.height / 2 - size / 2;
      const dx = end.left + 20 - size / 2 - x0;
      const dy = end.top + end.height / 2 - size / 2 - y0;
      const lift = Math.min(160, Math.max(70, Math.abs(dy) * 0.25));

      for (let i = 0; i < amount; i += 1) {
        const fly = document.createElement('img');
        fly.src = '/fly.svg';
        fly.alt = '';
        fly.setAttribute('aria-hidden', 'true');
        Object.assign(fly.style, {
          position: 'fixed',
          left: `${x0}px`,
          top: `${y0}px`,
          width: `${size}px`,
          height: `${size}px`,
          zIndex: '300',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 4px 6px rgba(15,46,29,0.35))',
        });
        document.body.appendChild(fly);
        const wobble = (i % 2 === 0 ? 1 : -1) * 22;
        const animation = fly.animate(
          [
            { transform: 'translate(0,0) scale(0.6) rotate(0deg)', opacity: 0 },
            { transform: `translate(${wobble}px,-28px) scale(1.25) rotate(-12deg)`, opacity: 1, offset: 0.18 },
            {
              transform: `translate(${dx * 0.55}px,${dy * 0.55 - lift}px) scale(1.1) rotate(10deg)`,
              opacity: 1,
              offset: 0.6,
            },
            { transform: `translate(${dx}px,${dy}px) scale(0.55) rotate(0deg)`, opacity: 0.9 },
          ],
          {
            duration: FLIGHT_MS,
            delay: i * STAGGER_MS,
            easing: 'cubic-bezier(0.45, 0, 0.35, 1)',
            fill: 'backwards',
          },
        );
        animation.onfinish = () => {
          fly.remove();
          land();
        };
        animation.oncancel = () => {
          fly.remove();
          land();
        };
      }
    },
    [land],
  );

  const value = useMemo(
    () => ({ count, award, setTarget, bump }),
    [count, award, setTarget, bump],
  );

  return <FlyJarContext.Provider value={value}>{children}</FlyJarContext.Provider>;
}

export function useFlyJar() {
  const context = useContext(FlyJarContext);
  if (!context) {
    return {
      count: 0,
      award: () => undefined,
      setTarget: () => undefined,
      bump: 0,
    } satisfies FlyJarContextValue;
  }
  return context;
}

export function FlyJarCounter({ className }: { className?: string }) {
  const { count, setTarget, bump } = useFlyJar();
  const label = `${count} ${count === 1 ? 'fly' : 'flies'} caught on this page`;

  return (
    <div
      ref={setTarget}
      title="Flies you’ve caught on this page"
      className={cn(
        'relative inline-flex h-10 items-center gap-1 rounded-full border border-[#0f2e1d]/10 bg-white/85 py-1 pl-1 pr-3 shadow-[0_2px_0_rgba(15,46,29,0.12)] backdrop-blur-xl transition-colors dark:border-white/15 dark:bg-white/10',
        count === 0 && 'opacity-80',
        className,
      )}
    >
      <span
        key={bump}
        className={cn('grid h-8 w-8 place-items-center', bump > 0 && 'ph-jar-bump')}
      >
        <Fly size={30} y={-2} interactive={false} />
      </span>
      <span
        className="min-w-[1ch] text-[15px] font-black leading-none tabular-nums text-[#0f2e1d] dark:text-white"
        aria-hidden
      >
        {count}
      </span>
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </div>
  );
}

export function FlyJarTally() {
  const { count } = useFlyJar();
  if (count === 0) {
    return (
      <p className="mt-5 max-w-[46ch] text-pretty text-base font-semibold leading-7 text-[#2c5340] dark:text-[#b9d4c0]">
        Got something you’ve been avoiding? Put it on the list. Your frog
        handles lunch.
      </p>
    );
  }
  return (
    <p className="mt-5 max-w-[46ch] text-pretty text-base font-semibold leading-7 text-[#2c5340] dark:text-[#b9d4c0]">
      You caught{' '}
      <span className="font-black text-[#0f2e1d] dark:text-white">
        {count} {count === 1 ? 'fly' : 'flies'}
      </span>{' '}
      on this page. That’s the whole idea. Now try it with your own list.
    </p>
  );
}
