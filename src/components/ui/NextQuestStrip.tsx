'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Tags } from 'lucide-react';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import {
  HintButton,
  ObjectiveLabel,
  ObjectiveProgressBar,
  QuestRewardTileBadge,
  objectiveCardTone,
  setQuestScrollTarget,
  trackableEyebrow,
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

  const claimable =
    claimables?.find((c) => c.placement === 'onboarding') ?? claimables?.[0];
  const claimableCount = claimables?.length ?? 0;

  const nextUp = useMemo(() => {
    if (!trackables?.length) return null;
    return [...trackables].sort((a, b) => {
      const aTarget = Math.max(1, a.target);
      const bTarget = Math.max(1, b.target);
      return (
        Number(b.placement === 'onboarding') -
          Number(a.placement === 'onboarding') ||
        Number(a.needsFocusTags ?? false) - Number(b.needsFocusTags ?? false) ||
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

  const goToQuests = () => {
    if (targetQuestId) setQuestScrollTarget(targetQuestId);
    router.push('/quests');
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToQuests}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          goToQuests();
        }
      }}
      className={`group relative mx-1.5 mb-2 flex w-[calc(100%-0.75rem)] cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left shadow-sm transition-colors md:mx-4 md:w-[calc(100%-2rem)] ${objectiveCardTone(
        !!claimable,
      )} ${
        claimable
          ? 'hover:bg-lime-100 dark:hover:bg-lime-500/20'
          : 'hover:bg-muted/40'
      }`}
    >
      {claimable ? (
        <>
          <div className="h-12 w-12 shrink-0 animate-quest-pulse">
            <QuestRewardTileBadge
              reward={claimable.reward}
              catalog={resolvedCatalog}
              isPremium={!!isPremium}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-lime-700 dark:text-lime-400">
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
          <span className="claim-wobble inline-flex shrink-0">
            <span className="inline-flex h-9 items-center justify-center rounded-xl bg-amber-500 px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all group-hover:translate-y-[-1px] group-hover:shadow-[0_4px_0_0_#b45309] group-active:translate-y-[2px] group-active:shadow-none">
              Claim
            </span>
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
              {trackableEyebrow(nextUp)}
            </span>
            {nextUp.needsFocusTags ? (
              <>
                <span className="mt-0.5 text-[13px] font-black text-foreground">
                  Pick a tag to start this quest
                </span>
                <span className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                  <Tags className="h-3 w-3" strokeWidth={2.75} />
                  Pick a tag
                </span>
              </>
            ) : (
              <>
                <span className="mt-0.5 text-[13px] font-black text-foreground">
                  <ObjectiveLabel
                    label={nextUp.remainingLabel}
                    tags={nextUp.tags}
                  />
                </span>
                <ObjectiveProgressBar
                  className="mt-1.5"
                  progress={nextUp.progress}
                  target={nextUp.target}
                />
              </>
            )}
          </div>
          {nextUp.hint && !nextUp.needsFocusTags ? (
            <span className="shrink-0">
              <HintButton text={nextUp.hint} />
            </span>
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          )}
        </>
      ) : null}
    </div>
  );
}
