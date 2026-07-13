'use client';

import React from 'react';
import useSWR from 'swr';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';

const COMPACT_VARS = {
  '--premium-fly-top': '0%',
  '--premium-fly-x-min': '-30px',
  '--premium-fly-x-max': '22px',
  '--premium-fly-y-min': '-4px',
  '--premium-fly-y-max': '6px',
} as React.CSSProperties;

// The companion fly never pauses: it ignores the global slide/sheet Rive
// pause and every popup — a Plus perk should always feel alive.
export function PremiumFrogAura({
  show,
  compact = false,
  flySize,
  className,
}: {
  /** Overrides the self premium check (e.g. viewing a friend's frog). */
  show?: boolean;
  /** Small fly with a tight orbit, for clipped row-sized frog containers. */
  compact?: boolean;
  /** Fly canvas size in px; defaults to 26 (compact) / 46. */
  flySize?: number;
  className?: string;
}) {
  const isSelf = show === undefined;
  const { user } = useAuth();
  const isAccount = !!user && !user.isAnonymous;
  const { data } = useSWR<{ isPremium?: boolean }>(
    isSelf && isAccount ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const active = isSelf ? !!data?.isPremium : show;

  const phase = React.useMemo(() => {
    const t = Date.now() / 1000;
    return {
      orbit: { animationDelay: `${-(t % 14.8).toFixed(3)}s` },
      bob: { animationDelay: `${-(t % 7.8).toFixed(3)}s` },
      tilt: { animationDelay: `${-(t % 14.8).toFixed(3)}s` },
    };
  }, []);

  if (!active) return null;

  return (
    <>
      <span className="sr-only">Frogress Plus member</span>
      <div
        aria-hidden
        className={cn('pointer-events-none absolute inset-0', className)}
        style={compact ? COMPACT_VARS : undefined}
      >
        <div className="premium-fly-orbit" style={phase.orbit}>
          <div className="premium-fly-bob" style={phase.bob}>
            <div className="premium-fly-tilt" style={phase.tilt}>
              <div className="premium-fly-gold">
                <Fly
                  size={flySize ?? (compact ? 26 : 46)}
                  interactive={false}
                  alwaysPlay
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
