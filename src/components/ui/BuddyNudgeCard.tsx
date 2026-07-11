'use client';

import React, { useEffect, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useRandomReveal } from '@/hooks/useRandomReveal';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { BuddyStartFlow } from '@/components/ui/BuddyStartFlow';
import type { FriendSummary } from '@/lib/friends/indices';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function BuddyNudgeCard() {
  const { user } = useAuth();
  const { indices } = useWardrobeIndices(!!user);
  const { show, dismiss } = useRandomReveal('home_buddy');
  const [flowOpen, setFlowOpen] = useState(false);

  // Size the Rive frogs/fly by breakpoint via real dimensions (not CSS scale),
  // so their drawing surface renders crisp at every width instead of a stretched
  // bitmap.
  const [tier, setTier] = useState<'sm' | 'md' | 'lg'>('sm');
  useEffect(() => {
    const md = window.matchMedia('(min-width: 400px)');
    const lg = window.matchMedia('(min-width: 640px)');
    const update = () => setTier(lg.matches ? 'lg' : md.matches ? 'md' : 'sm');
    update();
    md.addEventListener('change', update);
    lg.addEventListener('change', update);
    return () => {
      md.removeEventListener('change', update);
      lg.removeEventListener('change', update);
    };
  }, []);

  const frogW = tier === 'lg' ? 92 : tier === 'md' ? 72 : 60;
  const frogH = Math.round(frogW * 0.9);
  const overlap = Math.round(frogW * 0.42);
  const pairW = frogW * 2 - overlap;
  const flySize = tier === 'lg' ? 26 : tier === 'md' ? 20 : 18;
  const flyTop = tier === 'lg' ? -2 : tier === 'md' ? 0 : -4;

  const { data } = useSWR<{ friends: FriendSummary[] }>(
    user && (show || flowOpen) ? '/api/friends' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const friends = data?.friends ?? [];

  if (!user) return null;

  return (
    <>
      {show && (
        <div className="mx-1.5 mt-2 md:mx-4">
            <button
              type="button"
              onClick={() => setFlowOpen(true)}
              className="group relative flex w-full items-center gap-2 overflow-hidden rounded-[18px] border border-[#4f9149]/30 bg-popover py-2.5 pl-1.5 pr-1.5 text-left shadow-[0_3px_0_0_rgba(79,145,73,0.35)] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149]/40 active:translate-y-[3px] active:shadow-none sm:gap-3 sm:py-4 sm:pl-2 sm:pr-2.5 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_rgba(79,145,73,0.35)]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'linear-gradient(105deg, rgba(79,145,73,0.20) 0%, rgba(79,145,73,0.07) 42%, transparent 72%)',
                }}
              />
              <span
                className="relative flex shrink-0 items-end justify-center"
                style={{ width: pairW, height: frogH }}
              >
                <span className="relative z-20">
                  <Frog width={frogW} height={frogH} indices={indices} paused />
                </span>
                <span className="relative z-10" style={{ marginLeft: -overlap }}>
                  <Frog width={frogW} height={frogH} paused />
                </span>
                <span
                  className="absolute left-1/2 z-30 -translate-x-1/2"
                  style={{ top: flyTop }}
                >
                  <Fly size={flySize} y={-1} paused />
                </span>
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block text-[13px] font-black leading-tight tracking-tight text-foreground sm:text-base">
                  Catch flies together!
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-muted-foreground sm:text-[13px]">
                  Team up — earn extra flies!
                </span>
              </span>
              <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4f9149] text-white ring-1 ring-[#34631f]/40 shadow-[0_2px_0_0_#34631f] transition-transform group-hover:translate-x-0.5 group-active:translate-y-0 sm:h-9 sm:w-9">
                <ChevronRight className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={2.5} />
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    dismiss();
                  }
                }}
                className="relative flex h-7 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground sm:w-7"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </span>
            </button>
        </div>
      )}

      <BuddyStartFlow
        open={flowOpen}
        onClose={() => setFlowOpen(false)}
        friends={friends}
        indices={indices}
      />
    </>
  );
}
