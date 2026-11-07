'use client';

import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestReward } from '@/lib/quests/types';
import type { MilestoneMetric, MilestoneRowView } from '@/lib/quests/milestones';
import { useUIStore } from '@/lib/uiStore';
import { QuestRewardTileBadge } from '@/lib/questClaims';
import { QuestTrack } from '@/components/ui/QuestTrack';
import {
  QUEST_ROW_CARD,
  QuestGoButton,
  QuestSectionHeader,
  RewardDetailsPopup,
  sortStreakPrizes,
  type QuestRewardCatalogItem,
} from '@/components/ui/QuestCards';

const MILESTONE_GUIDES: Record<MilestoneMetric, string> = {
  tasks_done: 'complete-task',
  outfits_owned: 'buy-skin',
  trades_made: 'trade-skins',
  focus_minutes: 'focus',
};

function MilestoneRow({
  row,
  claiming,
  isPremium,
  rewardCatalog,
  onClaim,
  onOpenRewards,
}: {
  row: MilestoneRowView;
  claiming: boolean;
  isPremium: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onClaim: () => void;
  onOpenRewards: (rewards: QuestReward[]) => void;
}) {
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const rewards = row.rewards.length
    ? sortStreakPrizes(row.rewards, rewardCatalog)
    : [];
  const guide = MILESTONE_GUIDES[row.metric];
  return (
    <div
      className={cn(
        QUEST_ROW_CARD,
        'flex items-center gap-3 pl-3 pr-3',
        row.complete ? 'py-2.5' : 'py-3',
        row.claimable &&
          'bg-[var(--season-tint,#fffbeb)] dark:bg-[var(--season-soft,rgba(245,158,11,0.1))]',
      )}
    >
      {row.complete ? (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Trophy className="h-5 w-5" strokeWidth={2.5} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => rewards.length > 0 && onOpenRewards(rewards)}
          aria-label="See rewards"
          className="min-h-11 min-w-11 shrink-0 rounded-xl"
        >
          <QuestRewardTileBadge
            rewards={rewards}
            catalog={rewardCatalog as never}
            isPremium={isPremium}
          />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span
          className={cn(
            'line-clamp-2 text-[15px] font-bold leading-tight',
            row.complete ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {row.label}
        </span>
        {!row.complete && (
          <QuestTrack
            progress={row.progress}
            target={row.target}
            size="lg"
            action={
              row.claimable
                ? {
                    label: claiming
                      ? 'Claiming…'
                      : row.readyLevels > 1
                        ? `Claim all ${row.readyLevels}`
                        : 'Claim',
                    disabled: claiming,
                    onPress: onClaim,
                  }
                : null
            }
          />
        )}
      </div>
      {!row.complete && !row.claimable && guide ? (
        <QuestGoButton onPress={() => startHintGuide(guide)} />
      ) : null}
    </div>
  );
}

export function MilestonesCard({
  rows,
  rewardCatalog,
  isPremium,
  claimingTrackId,
  onClaim,
}: {
  rows: MilestoneRowView[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  claimingTrackId: string | null;
  onClaim: (trackId: string) => void;
}) {
  const [rewardPopup, setRewardPopup] = useState<{
    title: string;
    rewards: QuestReward[];
  } | null>(null);
  if (rows.length === 0) return null;

  const ready = rows.filter((row) => row.claimable).length;

  return (
    <div>
      <QuestSectionHeader
        title="Milestones"
        count={ready > 0 ? `${ready} ready` : undefined}
      />
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <MilestoneRow
            key={row.trackId}
            row={row}
            claiming={claimingTrackId === row.trackId}
            isPremium={isPremium}
            rewardCatalog={rewardCatalog}
            onClaim={() => onClaim(row.trackId)}
            onOpenRewards={(rewards) =>
              setRewardPopup({ title: row.label, rewards })
            }
          />
        ))}
      </div>
      <RewardDetailsPopup
        open={!!rewardPopup}
        eyebrow="Milestone"
        title={rewardPopup?.title ?? ''}
        rewards={rewardPopup?.rewards ?? []}
        rewardCatalog={rewardCatalog}
        isPremium={isPremium}
        onClose={() => setRewardPopup(null)}
      />
    </div>
  );
}
