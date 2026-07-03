'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import {
  ObjectiveLabel,
  QuestProgressBar,
  QuestRewardTileBadge,
  setQuestScrollTarget,
  type Claimable,
  type Trackable,
} from '@/lib/questClaims';

export function NextQuestStrip({
  claimables,
  trackables,
  catalog,
  isPremium,
}: {
  claimables?: Claimable[];
  trackables?: Trackable[];
  catalog?: Record<string, QuestRewardCatalogItem>;
  isPremium?: boolean;
}) {
  const router = useRouter();

  const claimable = claimables?.[0];
  const claimableCount = claimables?.length ?? 0;

  const nextUp = useMemo(() => {
    if (!trackables?.length) return null;
    return [...trackables].sort((a, b) => {
      const aTarget = Math.max(1, a.target);
      const bTarget = Math.max(1, b.target);
      return (
        b.progress / bTarget - a.progress / aTarget ||
        aTarget - a.progress - (bTarget - b.progress)
      );
    })[0];
  }, [trackables]);

  if (!claimable && !nextUp) return null;

  const resolvedCatalog = catalog ?? {};
  const targetQuestId =
    claimable && claimable.kind === 'objective'
      ? claimable.questId ?? null
      : !claimable && nextUp
        ? nextUp.questId ?? null
        : null;

  return (
    <button
      type="button"
      onClick={() => {
        if (targetQuestId) setQuestScrollTarget(targetQuestId);
        router.push('/quests');
      }}
      className={`group relative mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-3 overflow-hidden rounded-xl border p-3 text-left shadow-sm transition-colors ${
        claimable
          ? 'border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/15'
          : 'border-primary/10 bg-primary/5 hover:bg-primary/10'
      }`}
    >
      {claimable ? (
        <>
          <div className="animate-quest-pulse">
            <QuestRewardTileBadge
              reward={claimable.reward}
              catalog={resolvedCatalog}
              isPremium={!!isPremium}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
              {claimableCount > 1
                ? `${claimableCount} rewards ready`
                : 'Reward ready'}
            </span>
            <span className="mt-0.5 text-[13px] font-black text-foreground">
              {claimable.kind === 'season' ? (
                <span className="truncate">
                  {claimable.seasonName
                    ? `${claimable.seasonName} · Day ${claimable.day}`
                    : `Season day ${claimable.day}`}
                </span>
              ) : (
                <ObjectiveLabel
                  label={claimable.objectiveLabel}
                  tags={claimable.tags}
                />
              )}
            </span>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_3px_0_0_#b45309] transition-all group-hover:translate-y-[-1px] group-hover:shadow-[0_4px_0_0_#b45309] group-active:translate-y-[2px] group-active:shadow-none">
            Claim
          </span>
        </>
      ) : nextUp ? (
        <>
          <QuestRewardTileBadge
            reward={nextUp.reward}
            catalog={resolvedCatalog}
            isPremium={!!isPremium}
          />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              {nextUp.placement === 'category'
                ? nextUp.categoryName ?? 'Focus quest'
                : 'Daily quest'}
            </span>
            <span className="mt-0.5 text-[13px] font-black text-foreground">
              <ObjectiveLabel label={nextUp.remainingLabel} tags={nextUp.tags} />
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <QuestProgressBar
                from={nextUp.progress / Math.max(1, nextUp.target)}
                to={nextUp.progress / Math.max(1, nextUp.target)}
              />
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                {Math.min(nextUp.progress, nextUp.target)}/{nextUp.target}
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </>
      ) : null}
    </button>
  );
}
