'use client';

import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import { AdminCard, LoadingBlock, SaveBar, ToggleRow } from '@/components/admin/kit';
import { useRewardCatalog } from '@/components/admin/pickers';
import { useAdminConfig } from '@/components/admin/useAdminConfig';
import { RewardTile } from '@/components/ui/QuestCards';
import { RewardPickerDialog, rewardSummary } from '@/components/ui/RewardPickerDialog';
import type { QuestReward } from '@/lib/quests/types';
import { cn } from '@/lib/utils';

type MoveToWebConfig = { isActive: boolean; reward: QuestReward | null };

export function MoveToWebCard() {
  const web = useAdminConfig<MoveToWebConfig>({
    url: '/api/admin/quests/move-to-web',
    read: (payload) => payload?.moveToWeb ?? null,
    write: (config) => ({ isActive: config.isActive, reward: config.reward }),
  });
  const catalog = useRewardCatalog();
  const [pickerOpen, setPickerOpen] = useState(false);
  const config = web.config;

  if (web.loading || !config) return <LoadingBlock rows={1} />;

  return (
    <>
      <AdminCard
        title="Play on the web"
        subtitle="A one-time quest under the daily quests for phone players who have never opened the web. Logging in on the web completes it."
        icon={<span className="text-[20px]">💻</span>}
        tone="sky"
      >
        <div className="space-y-4">
          <ToggleRow
            title={config.isActive ? 'Shown to phone-only players' : 'Hidden'}
            description="It never shows as the next quest to do."
            checked={config.isActive}
            onChange={(isActive) => web.patch({ isActive })}
          />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="group flex w-full items-center gap-3 rounded-2xl bg-muted/40 p-3 text-left transition hover:bg-muted/70"
          >
            {config.reward ? (
              <RewardTile reward={config.reward} rewardCatalog={catalog.byId} isPremium={false} still className="h-12 w-12 rounded-xl" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-dashed border-border text-[18px] text-muted-foreground">
                🎁
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">Prize</span>
              <span className={cn('block truncate text-[14px] font-black', !config.reward && 'text-muted-foreground')}>
                {config.reward ? rewardSummary(config.reward, catalog.byId) : 'No prize yet'}
              </span>
            </span>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[12px] font-black shadow-[0_2px_0_0_hsl(var(--border))] group-hover:border-primary/40">
              <Pencil className="h-3.5 w-3.5" />
              {config.reward ? 'Change' : 'Pick'}
            </span>
          </button>
        </div>
      </AdminCard>
      <RewardPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        rewards={config.reward ? [config.reward] : []}
        rewardItems={catalog.items}
        rewardCatalog={catalog.byId}
        singleSelect
        onSave={(rewards) => {
          web.patch({ reward: rewards[0] ?? null });
          setPickerOpen(false);
        }}
      />
      <SaveBar
        dirty={web.dirty}
        saving={web.saving}
        onSave={() => void web.save()}
        onDiscard={web.discard}
        label="Play on the web has unsaved changes"
      />
    </>
  );
}
