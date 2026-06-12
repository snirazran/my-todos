'use client';

import type { ReactNode } from 'react';
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

export type Claimable = {
  id: string;
  kind: 'objective' | 'season';
  placement?: 'daily' | 'category';
  categoryName?: string;
  objectiveLabel?: string;
  seasonName?: string;
  day?: number;
  reward?: any;
};

type ShowNotification = (
  content: ReactNode,
  undoAction?: () => void | Promise<void>,
  options?: { durationMs?: number },
) => void;

type HomeData = {
  claimables: Claimable[];
  catalog: Catalog;
  isPremium: boolean;
};

let baseline: Set<string> | null = null;

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
      catalog: (data?.claimablesRewardCatalog ?? {}) as Catalog,
      isPremium: !!data?.isPremium,
    };
  } catch {
    return null;
  }
}

export async function seedQuestClaims(): Promise<void> {
  if (baseline !== null) return;
  const data = await fetchHome();
  if (data) baseline = new Set(data.claimables.map((c) => c.id));
}

export async function notifyQuestClaims(show: ShowNotification): Promise<void> {
  const data = await fetchHome();
  if (!data) return;
  const ids = new Set(data.claimables.map((c) => c.id));
  const prev = baseline;
  baseline = ids;
  if (prev === null) return;
  for (const c of data.claimables) {
    if (prev.has(c.id)) continue;
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

function toastTitle(c: Claimable): string {
  if (c.kind === 'season') return 'Season reward ready';
  if (c.placement === 'category') {
    return `${c.categoryName ?? 'Focus'} objective complete`;
  }
  return 'Daily objective complete';
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
  return (
    <div className="flex w-full items-center gap-3">
      {claimable.reward ? (
        <div className="relative shrink-0">
          <RewardTile
            reward={claimable.reward}
            rewardCatalog={catalog}
            isPremium={isPremium}
            hideBadge
            className="h-12 w-12 rounded-xl"
          />
          <span className="absolute -right-0.5 -top-1 z-20 flex min-w-4 items-center justify-center rounded-sm border border-white/10 bg-black/50 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
            {rewardQuantityLabel(claimable.reward)}
          </span>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] font-black text-foreground">
          {toastTitle(claimable)}
        </span>
        {claimable.kind === 'objective' ? (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
            <Check className="h-3 w-3 shrink-0 stroke-[3.5] text-emerald-500" />
            <span className="truncate line-through">
              {claimable.objectiveLabel}
            </span>
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
        onClick={() => router.push('/quests')}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_3px_0_0_#b45309] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none"
      >
        <span className="mr-[-0.15em]">Claim</span>
      </button>
    </div>
  );
}
