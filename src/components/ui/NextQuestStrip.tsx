'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Tags } from 'lucide-react';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import {
  HintButton,
  ObjectiveLabel,
  ObjectiveProgressBar,
  QuestRewardTileBadge,
  objectiveCardTone,
  primeQuestsPageCache,
  refreshQuestHomeView,
  setQuestScrollTarget,
  useCompletionReveal,
  type Claimable,
  type Trackable,
} from '@/lib/questClaims';
import {
  priorityReasonLabel,
  rankByQuestPriority,
  resetCountdownLabel,
} from '@/lib/quests/priority';
import { QuestPriorityDebug } from '@/components/ui/QuestPriorityDebug';
import { useUIStore } from '@/lib/uiStore';

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
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const [claiming, setClaiming] = useState(false);

  const claimable =
    claimables?.find((c) => c.placement === 'onboarding') ?? claimables?.[0];
  const claimableCount = claimables?.length ?? 0;

  const { ranked, laterTiers } = useMemo(() => {
    const rankedAll = trackables?.length
      ? rankByQuestPriority(trackables)
      : [];
    const seenQuests = new Set<string>();
    const ranked: typeof rankedAll = [];
    const laterTiers: typeof rankedAll = [];
    for (const entry of rankedAll) {
      const key = entry.item.questId ?? entry.item.id;
      if (seenQuests.has(key)) {
        laterTiers.push(entry);
        continue;
      }
      seenQuests.add(key);
      ranked.push(entry);
    }
    return { ranked, laterTiers };
  }, [trackables]);
  const rankedNextUp = ranked[0] ?? null;
  const nextUp = rankedNextUp?.item ?? null;
  const nextUpReasonLabel = rankedNextUp
    ? priorityReasonLabel(rankedNextUp.result)
    : null;
  const nextUpHoursLeft = rankedNextUp?.result.hoursUntilReset ?? null;
  const nextUpResetLabel = nextUpReasonLabel
    ? null
    : resetCountdownLabel(nextUpHoursLeft);

  // Hold the just-finished trackable on screen so its progress bar visibly
  // fills before the card swaps to the "Reward ready" state.
  const heldTrackableRef = useRef<Trackable | null>(null);
  useEffect(() => {
    if (nextUp && !claimable) heldTrackableRef.current = nextUp;
  });
  useCompletionReveal(nextUp?.id ?? 'strip:none', false);
  const claimableRevealed = useCompletionReveal(
    claimable?.id ?? 'strip:none',
    !!claimable,
  );
  const held = heldTrackableRef.current;
  const fillingTrackable =
    claimable && !claimableRevealed && held && held.id === claimable.id
      ? { ...held, progress: Math.max(1, held.target) }
      : null;
  const displayNextUp = fillingTrackable ?? nextUp;
  const showClaimable = !!claimable && !fillingTrackable;

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

  const handleClaim = async (target: Claimable) => {
    if (claiming) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const request =
      target.kind === 'objective' && target.questId && target.objectiveId
        ? {
            url: '/api/quests/claim-objective',
            body: {
              questId: target.questId,
              objectiveId: target.objectiveId,
              timezone,
            },
          }
        : target.kind === 'season' && target.seasonId
          ? {
              url: '/api/quests/season/claim',
              body: { seasonId: target.seasonId, timezone },
            }
          : null;
    if (!request) {
      goToQuests();
      return;
    }
    setClaiming(true);
    try {
      const res = await fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Claim failed');
      enqueueQuestRewardReveal(payload.rewardSummary, {
        catalog: (catalog ?? {}) as RevealCatalog,
        isPremium: !!isPremium,
        showFlyGainPill: false,
      });
      primeQuestsPageCache();
      await refreshQuestHomeView();
    } catch {
      // Stale claimable (expired daily, claimed elsewhere) — re-sync so the
      // strip stops offering it.
      primeQuestsPageCache();
      await refreshQuestHomeView();
    } finally {
      setClaiming(false);
    }
  };

  return (
    <>
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
      className={`group relative mx-1.5 flex w-[calc(100%-0.75rem)] cursor-pointer items-center text-left transition-colors duration-300 md:mx-4 md:w-[calc(100%-2rem)] ${
        showClaimable
          ? `mb-2 gap-3 rounded-2xl border p-3 shadow-sm ${objectiveCardTone(
              true,
            )} hover:bg-lime-100 dark:hover:bg-lime-500/20`
          : 'mb-1.5 gap-2 rounded-full px-1 py-0.5 hover:bg-muted/30'
      }`}
    >
      {showClaimable && claimable ? (
        <>
          <div className="h-12 w-12 shrink-0 animate-[reward-pop_0.4s_ease-out_both] motion-reduce:animate-none">
            <div className="h-full w-full animate-quest-pulse">
              <QuestRewardTileBadge
                reward={claimable.reward}
                catalog={resolvedCatalog}
                isPremium={!!isPremium}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight animate-[reward-pop_0.4s_ease-out_0.07s_both] motion-reduce:animate-none">
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
          <span
            className="inline-flex shrink-0 animate-[reward-pop_0.45s_ease-out_0.14s_both] motion-reduce:animate-none"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={claiming ? 'inline-flex' : 'claim-wobble inline-flex'}>
              <button
                type="button"
                disabled={claiming}
                onClick={() => void handleClaim(claimable)}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-amber-500 px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {claiming ? 'Claiming...' : 'Claim'}
              </button>
            </span>
          </span>
        </>
      ) : displayNextUp ? (
        <>
          <QuestRewardTileBadge
            reward={displayNextUp.reward}
            catalog={resolvedCatalog}
            isPremium={!!isPremium}
            small
          />
          {displayNextUp.needsFocusTags ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12px] font-black text-foreground">
                Pick a tag to start this quest
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                <Tags className="h-3 w-3" strokeWidth={2.75} />
                Pick a tag
              </span>
            </div>
          ) : (
            <ObjectiveProgressBar
              className="min-w-0 flex-1"
              heightClassName="h-8"
              progress={displayNextUp.progress}
              target={displayNextUp.target}
              inlineLabel={
                <>
                  <ObjectiveLabel
                    label={displayNextUp.remainingLabel}
                    tags={displayNextUp.tags}
                    maxTags={1}
                  />
                  {!fillingTrackable && nextUpReasonLabel ? (
                    <span className="ml-1 shrink-0 whitespace-nowrap">
                      · {nextUpReasonLabel}
                    </span>
                  ) : !fillingTrackable && nextUpResetLabel ? (
                    <span className="ml-1 shrink-0 whitespace-nowrap">
                      · {nextUpResetLabel}
                    </span>
                  ) : null}
                </>
              }
            />
          )}
          {displayNextUp.hint && !displayNextUp.needsFocusTags ? (
            <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
              <HintButton
                text={displayNextUp.hint}
                tags={displayNextUp.tags}
                onShowMe={
                  displayNextUp.guideId
                    ? () =>
                        startHintGuide(
                          displayNextUp.guideId!,
                          displayNextUp.guideContext,
                        )
                    : undefined
                }
              />
            </span>
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          )}
        </>
      ) : null}
    </div>
    <div className="mx-1.5 mb-2 w-[calc(100%-0.75rem)] md:mx-4 md:w-[calc(100%-2rem)] empty:hidden">
      <QuestPriorityDebug
        title="home next-up"
        entries={ranked.map(({ item, result }) => ({
          label: `[${item.placement}] ${item.remainingLabel}`,
          input: item,
          result,
        }))}
        excluded={laterTiers.map(({ item }) => ({
          label: `[${item.placement}] ${item.remainingLabel}`,
          reason: 'later tier of a quest already listed',
        }))}
        notes={[
          'order: needs-tag last → onboarding first → score (2 decimals) → lower tier → fewest remaining → sooner reset',
          'pool: best objective per quest (onboarding + daily + areas)',
          'urgency counts only when resetting sooner than half the pool median',
        ]}
      />
    </div>
    </>
  );
}
