'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import type { QuestReward } from '@/lib/quests/types';
import { RewardTile, type QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import { RewardPickerDialog, normalizeRewardList, rewardSummary } from '@/components/ui/RewardPickerDialog';
import {
  AdminCard,
  AdminPage,
  ConfigShell,
  EmptyState,
  Field,
  NumberInput,
  PondButton,
  SaveBar,
  inputClass,
} from '@/components/admin/kit';
import { useAdminConfig, useSaveAll } from '@/components/admin/useAdminConfig';
import { useEconomy } from '@/components/admin/useEconomy';

type RewardTier = {
  tier: number;
  label: string;
  description?: string;
  itemId?: string | null;
  flies?: number;
  imageUrl?: string;
  rewards?: QuestReward[];
};

type GiftOption = {
  id: string;
  name: string;
  itemId: string;
  imageUrl?: string;
};

type Config = {
  headline: string;
  subheading: string;
  shareTitle: string;
  shareMessage: string;
  rewards: RewardTier[];
  giftOptions: GiftOption[];
};

export function AdminInviteManager() {
  const invites = useAdminConfig<Config>({
    url: '/api/admin/invite-config',
    read: (payload) =>
      payload?.config
        ? {
            headline: payload.config.headline ?? '',
            subheading: payload.config.subheading ?? '',
            shareTitle: payload.config.shareTitle ?? '',
            shareMessage: payload.config.shareMessage ?? '',
            rewards: payload.config.rewards ?? [],
            giftOptions: payload.config.giftOptions ?? [],
          }
        : null,
  });
  const economy = useEconomy();
  const all = useSaveAll([invites, economy]);
  const [rewardPickerIndex, setRewardPickerIndex] = useState<number | null>(null);
  const [giftPickerIndex, setGiftPickerIndex] = useState<number | null>(null);

  const catalog = (invites.payload?.catalog ?? []) as QuestRewardCatalogItem[];
  const rewardCatalog = useMemo(
    () => Object.fromEntries(catalog.map((item) => [item.id, item])) as Record<string, QuestRewardCatalogItem>,
    [catalog],
  );
  const config = invites.config;

  const updateReward = (idx: number, patch: Partial<RewardTier>) =>
    invites.set((prev) => ({ ...prev, rewards: prev.rewards.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  const updateGift = (idx: number, patch: Partial<GiftOption>) =>
    invites.set((prev) => ({ ...prev, giftOptions: prev.giftOptions.map((g, i) => (i === idx ? { ...g, ...patch } : g)) }));

  const addReward = () =>
    invites.set((prev) => {
      const tier = (prev.rewards[prev.rewards.length - 1]?.tier ?? 0) + 1;
      return {
        ...prev,
        rewards: [...prev.rewards, { tier, label: `${ordinal(tier)} friend`, description: '', itemId: null, flies: 0, imageUrl: '', rewards: [] }],
      };
    });

  const addGift = () =>
    invites.set((prev) => ({
      ...prev,
      giftOptions: [
        ...prev.giftOptions,
        { id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: '', itemId: '', imageUrl: '' },
      ],
    }));

  const tileFor = (itemId: string): QuestReward => ({
    type: rewardCatalog[itemId]?.slot === 'container' ? 'BOX' : 'ITEM',
    itemId,
    amount: 1,
  });

  return (
    <AdminPage
      title="Invites"
      subtitle="What a player earns for each friend who joins, and the gifts they can send with an invite."
      icon={<UserPlus />}
    >
      <ConfigShell loading={invites.loading || economy.loading} error={all.error}>
        {config ? (
          <div className="space-y-5">
            <AdminCard
              title="Rewards for each friend who joins"
              subtitle="Paid in order. The first friend pays the first row, the second friend the second, and so on."
              icon={<span className="text-[20px]">🏆</span>}
              actions={
                <PondButton variant="secondary" size="sm" onClick={addReward}>
                  <Plus className="h-4 w-4" />
                  Add a friend
                </PondButton>
              }
            >
              {config.rewards.length === 0 ? (
                <EmptyState>No rewards yet. Inviting pays nothing.</EmptyState>
              ) : (
                <ol className="space-y-2">
                  {config.rewards.map((reward, idx) => {
                    const rewards = legacyRewardToRewards(reward);
                    return (
                      <li key={idx} className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/45 p-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[14px] font-black text-primary-foreground shadow-[0_2px_0_0_#2c511a]">
                          {reward.tier}
                        </span>
                        <input
                          value={reward.label}
                          onChange={(event) => updateReward(idx, { label: event.target.value })}
                          className={`${inputClass} min-w-[9rem] flex-1`}
                          aria-label="Reward label"
                        />
                        <button
                          type="button"
                          onClick={() => setRewardPickerIndex(idx)}
                          className="flex items-center gap-2 rounded-2xl border border-border bg-card py-1 pl-1 pr-3 shadow-[0_2px_0_0_hsl(var(--border))] transition hover:bg-muted/50"
                        >
                          {rewards[0] ? (
                            <RewardTile reward={rewards[0]} rewardCatalog={rewardCatalog} isPremium={false} still className="h-10 w-10 rounded-xl" />
                          ) : (
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground">
                              <Plus className="h-4 w-4" />
                            </span>
                          )}
                          <span className="max-w-[10rem] truncate text-[13px] font-black">
                            {rewards.length ? rewards.map((entry) => rewardSummary(entry, rewardCatalog)).join(', ') : 'Pick a reward'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => invites.set((prev) => ({ ...prev, rewards: prev.rewards.filter((_, i) => i !== idx) }))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                          aria-label="Remove reward"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
              {economy.config ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                  <div>
                    <p className="text-[14px] font-black">Paid invites a month</p>
                    <p className="text-[12px] font-medium text-muted-foreground">
                      Invites past this still make friends. They just stop paying.
                    </p>
                  </div>
                  <NumberInput
                    value={economy.config.invites.monthlyCap}
                    max={1000}
                    onChange={(monthlyCap) => economy.patchGroup('invites', { monthlyCap })}
                  />
                </div>
              ) : null}
            </AdminCard>

            <AdminCard
              title="Gifts to send"
              subtitle="The inviter picks one of these for their friend. The first one is preselected."
              icon={<span className="text-[20px]">💌</span>}
              tone="berry"
              actions={
                <PondButton variant="secondary" size="sm" onClick={addGift}>
                  <Plus className="h-4 w-4" />
                  Add gift
                </PondButton>
              }
            >
              {config.giftOptions.length === 0 ? (
                <EmptyState>No gifts yet. Invites go out empty-handed.</EmptyState>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {config.giftOptions.map((gift, idx) => {
                    const item = rewardCatalog[gift.itemId];
                    return (
                      <div key={gift.id} className="relative rounded-2xl border border-border/70 bg-muted/30 p-3">
                        {idx === 0 ? (
                          <span className="absolute right-3 top-3 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                            Preselected
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setGiftPickerIndex(idx)}
                          className="mb-3 flex items-center gap-3 text-left"
                        >
                          {gift.itemId ? (
                            <RewardTile reward={tileFor(gift.itemId)} rewardCatalog={rewardCatalog} isPremium={false} still compact />
                          ) : (
                            <span className="flex h-16 w-16 items-center justify-center rounded-[20px] border-2 border-dashed border-border text-muted-foreground">
                              <Plus className="h-5 w-5" />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-black">{item?.name ?? 'Pick an item'}</span>
                            <span className="block text-[12px] font-bold capitalize text-muted-foreground">
                              {item ? item.rarity : 'Tap to choose'}
                            </span>
                          </span>
                        </button>
                        <div className="flex items-end gap-2">
                          <Field label="Name players see" className="flex-1">
                            <input
                              value={gift.name}
                              placeholder={item?.name || 'Same as the item'}
                              onChange={(event) => updateGift(idx, { name: event.target.value })}
                              className={inputClass}
                            />
                          </Field>
                          <button
                            type="button"
                            onClick={() => invites.set((prev) => ({ ...prev, giftOptions: prev.giftOptions.filter((_, i) => i !== idx) }))}
                            className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                            aria-label="Remove gift"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </AdminCard>
          </div>
        ) : null}
      </ConfigShell>

      {config && rewardPickerIndex !== null && config.rewards[rewardPickerIndex] ? (
        <RewardPickerDialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setRewardPickerIndex(null);
          }}
          rewards={legacyRewardToRewards(config.rewards[rewardPickerIndex])}
          rewardItems={catalog}
          rewardCatalog={rewardCatalog}
          singleSelect
          onSave={(rewards) => {
            const normalized = normalizeRewardList(rewards).slice(0, 1);
            updateReward(rewardPickerIndex, {
              rewards: normalized,
              flies: normalized[0]?.type === 'FLIES' ? normalized[0].amount ?? 0 : 0,
              itemId: normalized[0]?.type === 'ITEM' || normalized[0]?.type === 'BOX' ? normalized[0].itemId ?? null : null,
            });
            setRewardPickerIndex(null);
          }}
        />
      ) : null}

      {config && giftPickerIndex !== null && config.giftOptions[giftPickerIndex] ? (
        <RewardPickerDialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setGiftPickerIndex(null);
          }}
          rewards={config.giftOptions[giftPickerIndex].itemId ? [{ type: 'ITEM', itemId: config.giftOptions[giftPickerIndex].itemId }] : []}
          rewardItems={catalog}
          rewardCatalog={rewardCatalog}
          singleSelect
          tabs={['item', 'box']}
          onSave={(rewards) => {
            const selected = normalizeRewardList(rewards).find(
              (reward) => (reward.type === 'ITEM' || reward.type === 'BOX') && reward.itemId,
            );
            updateGift(giftPickerIndex, { itemId: selected?.itemId ?? '', imageUrl: '' });
            setGiftPickerIndex(null);
          }}
        />
      ) : null}

      <SaveBar
        dirty={all.dirty}
        saving={all.saving}
        onSave={() => void all.save()}
        onDiscard={all.discard}
        label="Invites have unsaved changes"
      />
    </AdminPage>
  );
}

function legacyRewardToRewards(reward: RewardTier): QuestReward[] {
  if (reward.rewards?.length) return normalizeRewardList(reward.rewards);
  const rewards: QuestReward[] = [];
  if (reward.flies && reward.flies > 0) rewards.push({ type: 'FLIES', amountMode: 'fixed', amount: reward.flies });
  if (reward.itemId) rewards.push({ type: 'ITEM', itemId: reward.itemId });
  return normalizeRewardList(rewards);
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
