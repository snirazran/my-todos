'use client';

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { Check } from 'lucide-react';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';

const RewardTile = dynamic(
  () => import('@/components/ui/QuestCards').then((m) => m.RewardTile),
  { ssr: false },
);

type Catalog = Record<string, QuestRewardCatalogItem>;

export type ObjectiveTagChip = {
  id: string;
  name: string;
  color: string;
};

export type Claimable = {
  id: string;
  questId?: string;
  objectiveId?: string;
  kind: 'objective' | 'season';
  placement?: 'daily' | 'category' | 'onboarding';
  categoryName?: string;
  objectiveLabel?: string;
  tags?: ObjectiveTagChip[];
  seasonId?: string;
  seasonName?: string;
  day?: number;
  reward?: any;
};

export type Trackable = {
  id: string;
  questId?: string;
  placement: 'daily' | 'category' | 'onboarding';
  categoryId?: string;
  categoryName?: string;
  objectiveLabel: string;
  remainingLabel: string;
  objectiveType?: string;
  tags?: ObjectiveTagChip[];
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  reward?: any;
  hint?: string;
  guideId?: string;
  guideContext?: import('@/lib/hints/guides').HintGuideContext;
  lastProgressAt?: string;
  expiresAt?: string;
};

type ShowNotification = (
  content: ReactNode,
  undoAction?: () => void | Promise<void>,
  options?: { durationMs?: number },
) => void;

type HomeData = {
  claimables: Claimable[];
  trackables: Trackable[];
  catalog: Catalog;
  isPremium: boolean;
};

let baseline: Set<string> | null = null;
let progressBaseline: Map<string, number> | null = null;

const QUEST_SCROLL_KEY = 'quest-scroll-target';

export function setQuestScrollTarget(questId: string) {
  try {
    sessionStorage.setItem(QUEST_SCROLL_KEY, `${questId}|${Date.now()}`);
  } catch {}
}

export function takeQuestScrollTarget(): string | null {
  try {
    const raw = sessionStorage.getItem(QUEST_SCROLL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(QUEST_SCROLL_KEY);
    const sep = raw.lastIndexOf('|');
    if (sep <= 0) return null;
    const id = raw.slice(0, sep);
    const ts = Number(raw.slice(sep + 1));
    if (!Number.isFinite(ts) || Date.now() - ts > 15000) return null;
    return id;
  } catch {
    return null;
  }
}

function currentTimezone(): string {
  return typeof window !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC';
}

async function fetchHome(): Promise<HomeData | null> {
  const key = `/api/quests?view=home&timezone=${encodeURIComponent(
    currentTimezone(),
  )}`;
  try {
    const res = await fetch(key);
    if (!res.ok) return null;
    const data = await res.json();
    mutate(key, data, { revalidate: false });
    return {
      claimables: Array.isArray(data?.claimables)
        ? (data.claimables as Claimable[])
        : [],
      trackables: Array.isArray(data?.trackables)
        ? (data.trackables as Trackable[])
        : [],
      catalog: (data?.claimablesRewardCatalog ?? {}) as Catalog,
      isPremium: !!data?.isPremium,
    };
  } catch {
    return null;
  }
}

function toProgressMap(trackables: Trackable[]): Map<string, number> {
  return new Map(trackables.map((t) => [t.id, t.progress]));
}

export async function seedQuestClaims(): Promise<void> {
  if (baseline !== null) return;
  const data = await fetchHome();
  if (data) {
    baseline = new Set(data.claimables.map((c) => c.id));
    progressBaseline = toProgressMap(data.trackables);
  }
}

// Silently re-sync the home-view cache and baselines after quest state
// changed elsewhere (quests-page claims), so returning to the home strip
// never flashes the stale pre-claim payload — and never toasts.
export async function refreshQuestHomeView(): Promise<void> {
  const data = await fetchHome();
  if (data) {
    baseline = new Set(data.claimables.map((c) => c.id));
    progressBaseline = toProgressMap(data.trackables);
  }
}

// Keep the full quests-page cache in step with the home view. Without this,
// navigating to /quests right after progressing a quest paints the stale
// cached payload first (old progress), then revalidates — replaying the
// fill/celebration animation from zero.
export function primeQuestsPageCache(): void {
  const key = `/api/quests?timezone=${encodeURIComponent(currentTimezone())}`;
  fetch(key)
    .then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      mutate(key, data, { revalidate: false });
    })
    .catch(() => {});
}

export async function notifyQuestClaims(
  show: ShowNotification,
  opts?: {
    // Recurring background refreshes (live focus ticks) pass false so a toast
    // doesn't pop every minute; new-claimable toasts still show.
    progressToast?: boolean;
  },
): Promise<void> {
  const data = await fetchHome();
  primeQuestsPageCache();
  if (!data) return;
  const ids = new Set(data.claimables.map((c) => c.id));
  const prev = baseline;
  const prevProgress = progressBaseline;
  baseline = ids;
  progressBaseline = toProgressMap(data.trackables);
  if (prev === null) return;
  let claimToastShown = false;
  for (const c of data.claimables) {
    if (prev.has(c.id)) continue;
    claimToastShown = true;
    show(
      <ClaimRewardToast
        claimable={c}
        catalog={data.catalog}
        isPremium={data.isPremium}
      />,
      undefined,
      { durationMs: 6000 },
    );
  }
  if (claimToastShown || !prevProgress || opts?.progressToast === false) return;
  let best: { trackable: Trackable; from: number } | null = null;
  for (const t of data.trackables) {
    const from = prevProgress.get(t.id);
    if (from === undefined || t.progress <= from) continue;
    if (!best) {
      best = { trackable: t, from };
      continue;
    }
    const bT = Math.max(1, best.trackable.target);
    const tT = Math.max(1, t.target);
    const ratioDiff = t.progress / tT - best.trackable.progress / bT;
    if (
      ratioDiff > 0 ||
      (ratioDiff === 0 &&
        tT - t.progress < bT - best.trackable.progress)
    ) {
      best = { trackable: t, from };
    }
  }
  if (best) {
    show(
      <QuestProgressToast
        trackable={best.trackable}
        fromProgress={best.from}
        catalog={data.catalog}
        isPremium={data.isPremium}
      />,
      undefined,
      { durationMs: 5000 },
    );
  }
}

function rewardQuantityLabel(reward: any): string {
  if (reward?.type === 'FLIES') {
    if (reward.amountMode === 'random') {
      const min = Math.max(1, reward.minAmount ?? 1);
      const max = Math.max(min, reward.maxAmount ?? min);
      return min === max ? String(max) : `${min}-${max}`;
    }
    return String(Math.max(0, reward.amount ?? 0));
  }
  const base = reward?.amount && reward.amount > 1 ? reward.amount : 1;
  return `x${base}`;
}

export function QuestRewardTileBadge({
  reward,
  catalog,
  isPremium,
}: {
  reward: any;
  catalog: Catalog;
  isPremium: boolean;
}) {
  if (!reward) return null;
  return (
    <div className="relative shrink-0">
      <RewardTile
        reward={reward}
        rewardCatalog={catalog}
        isPremium={isPremium}
        hideBadge
        className="h-12 w-12 rounded-xl"
        frogClassName="-translate-y-[18%]"
        flySize={30}
        flyOversample={1.25}
        giftAnimation="box_shake"
      />
      <span className="absolute -right-0.5 -top-1 z-20 flex min-w-4 items-center justify-center rounded-sm border border-white/10 bg-black/50 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
        {rewardQuantityLabel(reward)}
      </span>
    </div>
  );
}

export function QuestTagPillInline({ tag }: { tag: ObjectiveTagChip }) {
  return (
    <span
      className="relative inline-flex max-w-[8rem] items-center justify-center rounded-xl border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-sm md:max-w-[10rem] md:px-3 md:py-1 md:text-[11px]"
      style={{
        backgroundColor: `${tag.color}20`,
        borderColor: `${tag.color}40`,
        color: tag.color,
      }}
    >
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

export function ObjectiveLabel({
  label,
  tags,
  strikeText = false,
}: {
  label?: string;
  tags?: ObjectiveTagChip[];
  strikeText?: boolean;
}) {
  const textClass = strikeText ? 'line-through' : undefined;
  if (!tags?.length) {
    return <span className={`truncate ${textClass ?? ''}`}>{label}</span>;
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className={textClass}>{label} with</span>
      {tags.map((tag) => (
        <QuestTagPillInline key={tag.id} tag={tag} />
      ))}
      <span className={textClass}>{tags.length > 1 ? 'tags' : 'tag'}</span>
    </span>
  );
}

export function QuestProgressBar({
  from,
  to,
  className,
}: {
  from: number;
  to: number;
  className?: string;
}) {
  const [ratio, setRatio] = useState(Math.min(Math.max(from, 0), 1));
  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setRatio(Math.min(Math.max(to, 0), 1))),
    );
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${
        className ?? ''
      }`}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%` }}
      />
    </div>
  );
}

export function HintButton({
  text,
  onShowMe,
}: {
  text: string;
  onShowMe?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="How to do this"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-8 items-center justify-center rounded-xl border border-border/70 bg-background px-3 text-[12px] font-black text-muted-foreground shadow-[0_3px_0_0_rgba(15,23,42,0.08)] transition-all hover:text-foreground active:translate-y-[2px] active:shadow-none min-[400px]:px-3.5"
      >
        Hint
      </button>
      {open && (
        <span
          className="absolute bottom-full right-0 z-30 mb-2 flex w-56 flex-col gap-2 rounded-xl border border-border bg-popover px-3 py-2 text-left text-xs font-medium normal-case tracking-normal leading-snug text-popover-foreground shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          {text}
          {onShowMe && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onShowMe();
              }}
              className="inline-flex h-8 items-center justify-center self-start rounded-lg bg-amber-500 px-3 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_2px_0_0_#b45309] transition-all active:translate-y-[1px] active:shadow-none"
            >
              Show me
            </button>
          )}
        </span>
      )}
    </span>
  );
}

// Completion reveal: when an objective finishes while the user is watching,
// hold the "done" styling back briefly so the progress bar visibly fills to
// 100% first, then flip. Objectives that are already complete when first
// rendered (page load, navigation) flip instantly. Module-level state keeps
// the answer consistent across every component watching the same objective.
const REVEAL_DELAY_MS = 1000;
const revealSeenIncomplete = new Set<string>();
const revealCompletedAt = new Map<string, number>();

export function useCompletionReveal(id: string, complete: boolean): boolean {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  if (!complete) {
    revealSeenIncomplete.add(id);
    revealCompletedAt.delete(id);
  } else if (revealSeenIncomplete.has(id) && !revealCompletedAt.has(id)) {
    revealCompletedAt.set(id, Date.now());
  }

  const completedAt = revealCompletedAt.get(id);
  const revealed =
    complete &&
    (completedAt === undefined || Date.now() - completedAt >= REVEAL_DELAY_MS);

  useEffect(() => {
    if (!complete || revealed) return;
    const at = revealCompletedAt.get(id) ?? Date.now();
    const remaining = Math.max(0, REVEAL_DELAY_MS - (Date.now() - at)) + 30;
    const timer = window.setTimeout(forceRender, remaining);
    return () => window.clearTimeout(timer);
  }, [id, complete, revealed]);

  return revealed;
}

export function objectiveCardTone(complete: boolean) {
  return complete
    ? 'border-lime-500/40 bg-lime-100/80 dark:border-lime-500/25 dark:bg-lime-500/15'
    : 'border-border/50 bg-card';
}

export function ObjectiveProgressBar({
  progress,
  target,
  targetLabel,
  complete,
  className,
}: {
  progress: number;
  target: number;
  targetLabel?: string;
  complete?: boolean;
  className?: string;
}) {
  const safeTarget = Math.max(1, target);
  const pct = Math.min(100, (Math.max(0, progress) / safeTarget) * 100);
  const done = complete ?? progress >= safeTarget;
  const countLabel = (
    <>
      {Math.min(progress, safeTarget)}
      {' / '}
      {targetLabel ?? target}
    </>
  );
  return (
    <div
      className={`relative h-5 overflow-hidden rounded-full bg-muted ${className ?? ''}`}
    >
      <div className="absolute inset-[3px]">
        <div
          className={`relative h-full min-w-8 overflow-hidden rounded-full transition-all duration-500 ${done ? 'bg-lime-600' : 'bg-amber-400'}`}
          style={{ width: pct > 0 ? `${pct}%` : '2rem' }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-white/30 animate-[bar-shine-idle_2.8s_ease-in-out_infinite] motion-reduce:hidden"
          />
        </div>
      </div>
      {done && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/40 animate-[bar-shine_0.7s_ease-out_0.35s_both] motion-reduce:hidden"
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums text-foreground/70">
        {countLabel}
      </span>
      {/* Same label clipped to the filled width, in a dark tone that reads
          on the lime/amber bar regardless of theme. */}
      <span
        aria-hidden
        className={`absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums ${done ? 'text-lime-950' : 'text-amber-950'}`}
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        {countLabel}
      </span>
    </div>
  );
}

function toastTitle(c: Claimable): string {
  if (c.kind === 'season') return 'Season reward ready';
  if (c.placement === 'category') {
    return `${c.categoryName ?? 'Focus'} objective complete`;
  }
  if (c.placement === 'onboarding') return 'Starter objective complete';
  return 'Daily objective complete';
}

export function trackableEyebrow(t: {
  placement: 'daily' | 'category' | 'onboarding';
  categoryName?: string;
}): string {
  if (t.placement === 'category') return t.categoryName ?? 'Focus quest';
  if (t.placement === 'onboarding') return 'Getting started';
  return 'Daily quest';
}

function ClaimRewardToast({
  claimable,
  catalog,
  isPremium,
}: {
  claimable: Claimable;
  catalog: Catalog;
  isPremium: boolean;
}) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const goToQuest = () => {
    if (claimable.kind === 'objective' && claimable.questId) {
      setQuestScrollTarget(claimable.questId);
    }
    router.push('/quests');
  };
  // Claims right here — the global reveal host plays the reward popup on
  // whichever page the toast was tapped from.
  const handleClaimPress = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (claiming) return;
    const timezone = currentTimezone();
    const request =
      claimable.kind === 'objective' &&
      claimable.questId &&
      claimable.objectiveId
        ? {
            url: '/api/quests/claim-objective',
            body: {
              questId: claimable.questId,
              objectiveId: claimable.objectiveId,
              timezone,
            },
          }
        : claimable.kind === 'season' && claimable.seasonId
          ? {
              url: '/api/quests/season/claim',
              body: { seasonId: claimable.seasonId, timezone },
            }
          : null;
    if (!request) {
      goToQuest();
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
        catalog: catalog as RevealCatalog,
        isPremium,
        showFlyGainPill: window.location.pathname !== '/',
      });
      primeQuestsPageCache();
      await refreshQuestHomeView();
    } catch {
      primeQuestsPageCache();
      await refreshQuestHomeView();
    } finally {
      setClaiming(false);
    }
  };
  return (
    <div
      className="flex w-full cursor-pointer items-center gap-3"
      onClick={goToQuest}
    >
      <QuestRewardTileBadge
        reward={claimable.reward}
        catalog={catalog}
        isPremium={isPremium}
      />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] font-black text-foreground">
          {toastTitle(claimable)}
        </span>
        {claimable.kind === 'objective' ? (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
            <Check className="h-3 w-3 shrink-0 stroke-[3.5] text-emerald-500" />
            <ObjectiveLabel
              label={claimable.objectiveLabel}
              tags={claimable.tags}
              strikeText
            />
          </span>
        ) : (
          <span className="mt-0.5 truncate text-[11px] font-bold text-muted-foreground">
            {claimable.seasonName
              ? `${claimable.seasonName} · Day ${claimable.day}`
              : `Day ${claimable.day}`}
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={claiming}
        onClick={(event) => void handleClaimPress(event)}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_3px_0_0_#b45309] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="mr-[-0.15em]">{claiming ? '...' : 'Claim'}</span>
      </button>
    </div>
  );
}

function QuestProgressToast({
  trackable,
  fromProgress,
  catalog,
  isPremium,
}: {
  trackable: Trackable;
  fromProgress: number;
  catalog: Catalog;
  isPremium: boolean;
}) {
  const router = useRouter();
  const target = Math.max(1, trackable.target);
  return (
    <button
      type="button"
      onClick={() => {
        if (trackable.questId) setQuestScrollTarget(trackable.questId);
        router.push('/quests');
      }}
      className="flex w-full items-center gap-3 text-left"
    >
      <QuestRewardTileBadge
        reward={trackable.reward}
        catalog={catalog}
        isPremium={isPremium}
      />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          {trackableEyebrow(trackable)}
        </span>
        <span className="mt-0.5 text-[13px] font-black text-foreground">
          <ObjectiveLabel
            label={trackable.remainingLabel}
            tags={trackable.tags}
          />
        </span>
        <div className="mt-1.5 flex items-center gap-2">
          <QuestProgressBar
            from={fromProgress / target}
            to={trackable.progress / target}
          />
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
            {Math.min(trackable.progress, target)}/{target}
          </span>
        </div>
      </div>
    </button>
  );
}
