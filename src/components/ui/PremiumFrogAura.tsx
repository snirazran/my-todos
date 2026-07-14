'use client';

import React from 'react';
import useSWR from 'swr';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { useRiveInteractionPause } from '@/lib/riveInteractionPause';
import { useRiveIdlePause } from '@/lib/riveIdlePause';

const COMPACT_VARS = {
  '--premium-fly-top': '0%',
  '--premium-fly-x-min': '-30px',
  '--premium-fly-x-max': '22px',
  '--premium-fly-y-min': '-4px',
  '--premium-fly-y-max': '6px',
} as React.CSSProperties;

// The companion fly freezes with the global slide/sheet Rive pause: while a
// sheet covers it there's nothing to see, and one always-animating canvas
// keeps the whole 60fps render pipeline (and the phone's thermals) alive.
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
  const pauseHeld = useRiveInteractionPause((s) => s.count > 0);
  const idle = useRiveIdlePause((s) => s.idle);
  const frozen = pauseHeld || idle;

  const phase = React.useMemo(() => {
    const t = Date.now() / 1000;
    return {
      orbit: { animationDelay: `${-(t % 14.8).toFixed(3)}s` },
      bob: { animationDelay: `${-(t % 7.8).toFixed(3)}s` },
      tilt: { animationDelay: `${-(t % 14.8).toFixed(3)}s` },
    };
  }, []);

  const playState: React.CSSProperties | undefined = frozen
    ? { animationPlayState: 'paused' }
    : undefined;

  if (!active) return null;

  return (
    <>
      <span className="sr-only">Frogress Plus member</span>
      <div
        aria-hidden
        className={cn('pointer-events-none absolute inset-0', className)}
        style={compact ? COMPACT_VARS : undefined}
      >
        <div className="premium-fly-orbit" style={{ ...phase.orbit, ...playState }}>
          <div className="premium-fly-bob" style={{ ...phase.bob, ...playState }}>
            <div className="premium-fly-tilt" style={{ ...phase.tilt, ...playState }}>
              <div className="premium-fly-gold">
                <span className="premium-fly-glow" aria-hidden />
                <Fly
                  size={flySize ?? (compact ? 26 : 46)}
                  interactive={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
