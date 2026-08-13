'use client';

import { useState } from 'react';
import { Loader2, Play, ShieldCheck } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { showRewardedAd, rewardedAdsAvailable } from '@/lib/ads';
import { FlyWorth } from '@/components/ui/QuestCards';
import type { PactView } from '@/lib/pact/types';

/**
 * Getting a shield, never spending one — a shield fires by itself on a missed
 * week, because protection that works while you are away reads as a gift and
 * protection you have to remember to arm reads as another chore.
 */
export function PactShieldSheet({
  open,
  onClose,
  view,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  view: PactView;
  onChanged: (next: PactView) => void;
}) {
  const [busy, setBusy] = useState<'flies' | 'ad' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streak = view.streak;
  const full = streak.shields >= streak.shieldCap;
  const adsOffered = streak.canEarnShieldWithAd && rewardedAdsAvailable();

  const get = async (method: 'flies' | 'ad') => {
    setBusy(method);
    setError(null);
    try {
      let adsWatched = 0;
      if (method === 'ad') {
        for (let i = 0; i < streak.shieldAdsRequired; i += 1) {
          const result = await showRewardedAd('pact_shield');
          if (result !== 'rewarded') {
            setError('The ad did not finish — nothing was charged.');
            return;
          }
          adsWatched += 1;
        }
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, method, adsWatched }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not get a shield');
      onChanged(payload.view);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get a shield');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1420}
      className="bg-background ring-1 ring-border/70 sm:max-w-[420px]"
    >
      {() => (
        <div className="flex flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15">
              <ShieldCheck className="h-6 w-6 text-sky-500" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[19px] font-black leading-tight text-foreground">
                Streak shields
              </h2>
              <p className="text-[12.5px] font-bold text-muted-foreground">
                {streak.shields} of {streak.shieldCap} held
              </p>
            </div>
          </div>

          <p className="text-[13px] font-semibold leading-snug text-muted-foreground">
            Miss a week after making a start and a shield saves your streak on
            its own. It never pays that week&apos;s reward, and it can&apos;t
            cover two weeks in a row.
          </p>

          {full ? (
            <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-[12.5px] font-bold text-muted-foreground">
              You&apos;re holding all {streak.shieldCap}. Keep finishing weeks
              and you&apos;ll earn the next one back after you spend this.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={!streak.canBuyShield || busy !== null}
                onClick={() => get('flies')}
                className="flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card px-4 text-left transition active:scale-[0.99] disabled:opacity-50"
              >
                <span className="text-[14px] font-black text-foreground">
                  {busy === 'flies' ? 'Getting it…' : 'Buy a shield'}
                </span>
                {busy === 'flies' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <FlyWorth amount={streak.shieldPriceFlies} />
                )}
              </button>

              {adsOffered && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => get('ad')}
                  className="flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card px-4 text-left transition active:scale-[0.99] disabled:opacity-50"
                >
                  <span className="text-[14px] font-black text-foreground">
                    {busy === 'ad' ? 'Loading…' : 'Watch for a shield'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-black text-muted-foreground">
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {streak.shieldAdsRequired} ad
                    {streak.shieldAdsRequired === 1 ? '' : 's'}
                  </span>
                </button>
              )}

              {!streak.canBuyShield && !adsOffered && (
                <p className="text-[12.5px] font-bold text-muted-foreground">
                  Not enough flies yet. Finish this week&apos;s pact and
                  you&apos;ll be close.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-[13px] font-bold text-destructive">{error}</p>
          )}
        </div>
      )}
    </BaseSheet>
  );
}
