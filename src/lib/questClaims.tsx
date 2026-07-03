'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { Check } from 'lucide-react';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';

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
  kind: 'objective' | 'season';
  placement?: 'daily' | 'category' | 'onboarding';
  categoryName?: string;
  objectiveLabel?: string;
  tags?: ObjectiveTagChip[];
  seasonName?: string;
  day?: number;
  reward?: any;
};

export type Trackable = {
  id: string;
  questId?: string;
  placement: 'daily' | 'category' | 'onboarding';
  categoryName?: string;
  objectiveLabel: string;
  remainingLabel: string;
  tags?: ObjectiveTagChip[];
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  reward?: any;
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

export async function notifyQuestClaims(show: ShowNotification): Promise<void> {
  const data = await fetchHome();
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
  if (claimToastShown || !prevProgress) return;
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
  const goToQuest = () => {
    if (claimable.kind === 'objective' && claimable.questId) {
      setQuestScrollTarget(claimable.questId);
    }
    router.push('/quests');
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
        onClick={goToQuest}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_3px_0_0_#b45309] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none"
      >
        <span className="mr-[-0.15em]">Claim</span>
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
