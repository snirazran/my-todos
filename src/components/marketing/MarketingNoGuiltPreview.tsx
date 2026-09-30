'use client';

import Image from 'next/image';
import { useState } from 'react';

const states = [
  {
    id: 'away',
    tab: 'Three days off',
    frog: '/sad_frog.png',
    line: 'Missed you. Snack?',
    belly: 1,
    note: 'Still here. Still yours. Nothing lost.',
  },
  {
    id: 'back',
    tab: 'Finished one task',
    frog: '/love_frog.png',
    line: 'You’re back!',
    belly: 4,
    note: 'One finish and the frog perks right up.',
  },
] as const;

export function MarketingNoGuiltPreview() {
  const [index, setIndex] = useState(0);
  const state = states[index];

  return (
    <div className="mx-auto w-full max-w-[440px]">
      <div className="relative overflow-hidden rounded-[32px] bg-[#dff0d6] px-5 pb-6 pt-5 shadow-[0_6px_0_#bcd9ad] dark:bg-[#12291c] dark:shadow-[0_6px_0_#081a10]">
        <div
          role="tablist"
          aria-label="Frog mood"
          className="relative mx-auto grid max-w-[340px] grid-cols-2 rounded-full bg-white/70 p-1 dark:bg-black/25"
        >
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_2px_0_rgba(15,46,29,0.15)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] dark:bg-white/15"
            style={{ transform: index === 1 ? 'translateX(100%)' : 'translateX(0)' }}
          />
          {states.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === itemIndex}
              onClick={() => setIndex(itemIndex)}
              className={`relative z-10 rounded-full px-2 py-2.5 text-[13px] font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4f9149] ${
                index === itemIndex
                  ? 'text-[#0f2e1d] dark:text-white'
                  : 'text-[#0f2e1d]/55 hover:text-[#0f2e1d] dark:text-white/55 dark:hover:text-white'
              }`}
            >
              {item.tab}
            </button>
          ))}
        </div>

        <div className="relative mt-8 flex h-[210px] items-end justify-center">
          <p
            key={`line-${state.id}`}
            className="ph-bubble-in absolute left-1/2 top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#0f2e1d] shadow-[0_3px_0_rgba(15,46,29,0.12)]"
          >
            {state.line}
          </p>
          <Image
            key={state.frog}
            src={state.frog}
            alt={index === 0 ? 'A hungry, slightly sad frog' : 'A happy frog surrounded by hearts'}
            width={968}
            height={556}
            className="ph-frog-swap relative z-10 h-auto w-[290px] max-w-full"
          />
        </div>

        <div className="relative z-10 -mt-1 rounded-2xl bg-white px-4 py-3 shadow-[0_2px_0_rgba(15,46,29,0.1)] dark:bg-[#0e1f16]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-black text-muted-foreground">Belly</span>
            <span className="flex flex-1 justify-end gap-1" aria-label={`${state.belly} of 6`}>
              {Array.from({ length: 6 }).map((_, pip) => (
                <span
                  key={pip}
                  className={`h-3 max-w-8 flex-1 rounded-full transition-colors duration-500 ${
                    pip < state.belly
                      ? index === 0
                        ? 'bg-amber-400'
                        : 'bg-emerald-500'
                      : 'bg-[#0f2e1d]/10 dark:bg-white/10'
                  }`}
                  style={{ transitionDelay: `${pip * 60}ms` }}
                />
              ))}
            </span>
          </div>
          <p className="mt-2 text-[13px] font-bold text-foreground">{state.note}</p>
        </div>
      </div>
    </div>
  );
}
