'use client';

import React, { useEffect, useState } from 'react';
import { DEFAULT_BACKGROUND_IMAGES } from '@/hooks/useBackgrounds';

export function AuthWordmark({ id }: { id: string }) {
  return (
    <svg
      aria-label="Frogress"
      role="img"
      viewBox="0 0 220 34"
      className="h-12 w-[280px] overflow-visible text-white [filter:drop-shadow(0_2px_0_rgba(15,40,20,0.35))]"
    >
      <path id={id} d="M 36 22 Q 110 6 184 22" fill="none" />
      <text
        fill="currentColor"
        fontSize="21"
        fontWeight="800"
        textAnchor="middle"
        style={{
          fontFamily:
            '"Arial Rounded MT Bold", "Avenir Next Rounded", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <textPath href={`#${id}`} startOffset="50%">
          Frogress
        </textPath>
      </text>
    </svg>
  );
}

export function AuthShell({
  heroTop,
  frog,
  children,
  footer,
  compactHero = false,
}: {
  heroTop: React.ReactNode;
  frog: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  compactHero?: boolean;
}) {
  const [showArt, setShowArt] = useState(false);
  useEffect(() => setShowArt(true), []);
  return (
    <main className="fixed inset-0 overflow-x-hidden overflow-y-auto bg-background">
      <div className="relative flex min-h-full flex-col items-center">
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden ${
            compactHero ? 'h-[40svh] max-h-[380px]' : 'h-[50svh] max-h-[480px]'
          } min-h-[300px]`}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#2f7a55] via-[#5ea476] to-[#a9d6b1]" />
          {showArt && (
          <picture>
            <source media="(min-width: 1280px)" srcSet={DEFAULT_BACKGROUND_IMAGES.web} />
            <source media="(min-width: 768px)" srcSet={DEFAULT_BACKGROUND_IMAGES.tablet} />
            <img
              src={DEFAULT_BACKGROUND_IMAGES.mobile}
              alt=""
              className="relative h-full w-full object-cover object-center"
              draggable={false}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </picture>
          )}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background" />
        </div>

        <div className="relative z-10 flex w-full max-w-sm flex-1 flex-col items-center px-5 pb-8 pt-[calc(env(safe-area-inset-top)+2.25rem)]">
          <div className="flex flex-col items-center text-center">{heroTop}</div>

          <div className="mt-auto w-full pt-6">
            <div className="relative z-10 -mt-[76px] flex justify-center">
              {frog}
            </div>
            <div className="relative z-0 -mt-[26px] rounded-[28px] border border-border/60 bg-card px-5 pb-5 pt-8 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.45)]">
              {children}
            </div>
          </div>

          {footer}
        </div>
      </div>
    </main>
  );
}
