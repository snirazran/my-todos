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

  const frogW = tier === 'lg' ? 76 : tier === 'md' ? 72 : 60;
  const frogH = Math.round(frogW * 0.9);
  const overlap = Math.round(frogW * 0.42);
  const pairW = frogW * 2 - overlap;
  const flySize = tier === 'lg' ? 22 : tier === 'md' ? 20 : 18;
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
        <div className="mx-1.5 mt-2 md:mx-4 md:mt-8">
          <div className="relative">
            <button
              type="button"
              onClick={() => setFlowOpen(true)}
              className="group relative flex w-full items-center gap-2 rounded-2xl border border-border/50 bg-card py-2.5 pl-1.5 pr-12 text-left shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149]/40 sm:gap-3 sm:py-3 sm:pl-2 md:rounded-none md:border-x-0 md:border-b-0 md:border-t md:border-border/50 md:bg-transparent md:py-4 md:shadow-none md:hover:bg-muted/30"
            >
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
                <span className="block text-[13px] font-black leading-tight tracking-tight text-foreground md:font-bold">
                  Catch flies together!
                </span>
                <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-muted-foreground">
                  Team up — earn extra flies!
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              aria-label="Dismiss buddy suggestion"
              onClick={dismiss}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149]/40"
            >
              <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
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
