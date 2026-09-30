'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type FaqItem = { question: string; answer: string };

const FEATURED = [
  'Is Frogress free?',
  'What if plain to-do lists never stick for me?',
  'What happens to my frog if I take a break?',
  'Does Frogress work on iPhone, Android and the web?',
  'Can Frogress sync with my calendar?',
];

export function MarketingFaq({ items }: { items: readonly FaqItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const featured = FEATURED.map((question) => items.find((item) => item.question === question)).filter(
    (item): item is FaqItem => !!item,
  );
  const ordered = [...featured, ...items.filter((item) => !featured.includes(item))];
  const visibleCount = featured.length || 5;

  return (
    <div>
      <div className="divide-y divide-[#0f2e1d]/[0.08] overflow-hidden rounded-[24px] bg-card shadow-[0_4px_0_rgba(15,46,29,0.06)] ring-1 ring-[#0f2e1d]/[0.06] dark:divide-white/[0.07] dark:ring-white/[0.07] sm:rounded-[28px]">
        {ordered.map((item, index) => (
          <details
            key={item.question}
            className={cn('group', !expanded && index >= visibleCount && 'hidden')}
          >
            <summary className="cursor-pointer list-none px-4 py-4 transition-colors hover:bg-[#4f9149]/[0.04] [&::-webkit-details-marker]:hidden sm:px-7 sm:py-[18px]">
              <h3 className="flex items-center justify-between gap-3 text-[15px] font-black leading-snug text-foreground sm:gap-4 sm:text-base">
                {item.question}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#4f9149]/10 text-[#34631f] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none dark:text-[#9fd98f]">
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </span>
              </h3>
            </summary>
            <p className="px-4 pb-5 text-[15px] font-medium leading-7 text-muted-foreground sm:px-7 sm:pb-6">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
      {ordered.length > visibleCount ? (
        <div className="mt-4 flex justify-center lg:justify-start">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-black text-[#34631f] transition-colors hover:bg-[#4f9149]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4f9149] dark:text-[#9fd98f]"
          >
            {expanded ? 'Show fewer' : `Show all ${ordered.length} questions`}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
              aria-hidden
            />
          </button>
        </div>
      ) : null}
    </div>
  );
}
