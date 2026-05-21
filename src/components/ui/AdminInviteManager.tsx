'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  UserPlus,
  Save,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import type { QuestReward } from '@/lib/quests/types';
import type { ItemDef } from '@/lib/skins/catalog';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import {
  RewardPickerDialog,
  normalizeRewardList,
  rewardSummary,
} from '@/components/ui/RewardPickerDialog';

type CatalogItem = {
  id: string;
  name: string;
  slot: ItemDef['slot'];
  rarity: ItemDef['rarity'];
  riveIndex: number;
  icon?: string;
};

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

const EMPTY_CONFIG: Config = {
  headline: '',
  subheading: '',
  shareTitle: '',
  shareMessage: '',
  rewards: [],
  giftOptions: [],
};

export function AdminInviteManager() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [config, setConfig] = useState<Config>(EMPTY_CONFIG);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [rewardPickerIndex, setRewardPickerIndex] = useState<number | null>(null);
  const [giftPickerIndex, setGiftPickerIndex] = useState<number | null>(null);

  const catalogById = useMemo(() => Object.fromEntries(catalog.map((c) => [c.id, c])), [catalog]);
  const rewardCatalog = useMemo(
    () =>
      Object.fromEntries(
        catalog.map((item) => [
          item.id,
          item as QuestRewardCatalogItem,
        ]),
      ) as Record<string, QuestRewardCatalogItem>,
    [catalog],
  );

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/invite-config');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setConfig({
        headline: data.config?.headline ?? '',
        subheading: data.config?.subheading ?? '',
        shareTitle: data.config?.shareTitle ?? '',
        shareMessage: data.config?.shareMessage ?? '',
        rewards: data.config?.rewards ?? [],
        giftOptions: data.config?.giftOptions ?? [],
      });
      setCatalog(data.catalog ?? []);
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/invite-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      flash('success', 'Saved');
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const updateReward = (idx: number, patch: Partial<RewardTier>) => {
    setConfig((c) => ({
      ...c,
      rewards: c.rewards.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  };

  const addReward = () => {
    setConfig((c) => {
      const tier = (c.rewards[c.rewards.length - 1]?.tier ?? 0) + 1;
      return {
        ...c,
        rewards: [
          ...c.rewards,
          {
            tier,
            label: `${ordinal(tier)} friend`,
            description: '',
            itemId: null,
            flies: 0,
            imageUrl: '',
            rewards: [],
          },
        ],
      };
    });
  };

  const removeReward = (idx: number) => {
    setConfig((c) => ({ ...c, rewards: c.rewards.filter((_, i) => i !== idx) }));
  };

  const addGift = () => {
    setConfig((c) => ({
      ...c,
      giftOptions: [
        ...c.giftOptions,
        {
          id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: '',
          itemId: '',
          imageUrl: '',
        },
      ],
    }));
  };

  const updateGift = (idx: number, patch: Partial<GiftOption>) => {
    setConfig((c) => ({
      ...c,
      giftOptions: c.giftOptions.map((g, i) => (i === idx ? { ...g, ...patch } : g)),
    }));
  };

  const removeGift = (idx: number) => {
    setConfig((c) => ({ ...c, giftOptions: c.giftOptions.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <UserPlus className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Invite Friends</h1>
              <p className="text-sm text-muted-foreground font-medium">
                Configure invite-tier rewards and the gifts users can send to friends.
              </p>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black inline-flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>

        {message && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-bold ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <>
            {/* Rewards */}
            <section className="rounded-3xl border border-border bg-card shadow-sm p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black tracking-tight">Your Rewards (per friend)</h2>
                <button
                  onClick={addReward}
                  className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-black inline-flex items-center gap-1.5 hover:bg-primary/20 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add tier
                </button>
              </div>

              {config.rewards.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reward tiers configured.</p>
              ) : (
                config.rewards.map((reward, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-border/60 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                        Tier #{reward.tier}
                      </span>
                      <button
                        onClick={() => removeReward(idx)}
                        className="px-2 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold inline-flex items-center gap-1 hover:bg-red-500/20 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>

                    <Field
                      label="Label"
                      value={reward.label}
                      onChange={(v) => updateReward(idx, { label: v })}
                    />

                    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                            Reward
                          </p>
                          <p className="mt-1 text-sm font-bold text-foreground">
                            {rewardSummaries(reward, rewardCatalog)}
                          </p>
                        </div>
                        <button
                          onClick={() => setRewardPickerIndex(idx)}
                          className="shrink-0 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-black hover:bg-primary/20 transition-colors"
                        >
                          Pick reward
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Gift options */}
            <section className="rounded-3xl border border-border bg-card shadow-sm p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black tracking-tight">
                  Gift options (inviter picks one per invite)
                </h2>
                <button
                  onClick={addGift}
                  className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-black inline-flex items-center gap-1.5 hover:bg-primary/20 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add gift
                </button>
              </div>

              {config.giftOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No gift options configured.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {config.giftOptions.map((gift, idx) => {
                    const item = catalogById[gift.itemId];
                    return (
                      <div
                        key={gift.id}
                        className="rounded-2xl border border-border/60 p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                            {item?.name || 'Unnamed gift'}
                          </span>
                          <button
                            onClick={() => removeGift(idx)}
                            className="px-2 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold inline-flex items-center gap-1 hover:bg-red-500/20 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </div>

                        <Field
                          label="Display name (optional)"
                          value={gift.name}
                          onChange={(v) => updateGift(idx, { name: v })}
                          placeholder={item?.name || ''}
                        />

                        <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                                Gift item
                              </p>
                              <p className="mt-1 truncate text-sm font-bold text-foreground">
                                {item?.name || 'No gift selected'}
                              </p>
                            </div>
                            <button
                              onClick={() => setGiftPickerIndex(idx)}
                              className="shrink-0 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-black hover:bg-primary/20 transition-colors"
                            >
                              Pick gift
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {rewardPickerIndex !== null && config.rewards[rewardPickerIndex] ? (
          <RewardPickerDialog
            open={rewardPickerIndex !== null}
            onOpenChange={(isOpen) => {
              if (!isOpen) setRewardPickerIndex(null);
            }}
            rewards={legacyRewardToRewards(config.rewards[rewardPickerIndex])}
            rewardItems={catalog as QuestRewardCatalogItem[]}
            rewardCatalog={rewardCatalog}
            singleSelect
            onSave={(rewards) => {
              const normalized = normalizeRewardList(rewards).slice(0, 1);
              updateReward(rewardPickerIndex, {
                rewards: normalized,
                flies: normalized[0]?.type === 'FLIES' ? normalized[0].amount ?? 0 : 0,
                itemId:
                  normalized[0]?.type === 'ITEM' || normalized[0]?.type === 'BOX'
                    ? normalized[0].itemId ?? null
                    : null,
              });
              setRewardPickerIndex(null);
            }}
          />
        ) : null}

        {giftPickerIndex !== null && config.giftOptions[giftPickerIndex] ? (
          <RewardPickerDialog
            open={giftPickerIndex !== null}
            onOpenChange={(isOpen) => {
              if (!isOpen) setGiftPickerIndex(null);
            }}
            rewards={
              config.giftOptions[giftPickerIndex].itemId
                ? [{ type: 'ITEM', itemId: config.giftOptions[giftPickerIndex].itemId }]
                : []
            }
            rewardItems={catalog as QuestRewardCatalogItem[]}
            rewardCatalog={rewardCatalog}
            singleSelect
            tabs={['item', 'box']}
            onSave={(rewards) => {
              const selected = normalizeRewardList(rewards).find(
                (reward) => (reward.type === 'ITEM' || reward.type === 'BOX') && reward.itemId,
              );
              updateGift(giftPickerIndex, {
                itemId: selected?.itemId ?? '',
                imageUrl: '',
              });
              setGiftPickerIndex(null);
            }}
          />
        ) : null}

        <div className="pt-4 flex justify-center">
          <button
            onClick={() => router.push('/admin')}
            className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Admin
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:border-primary"
      />
    </div>
  );
}

function legacyRewardToRewards(reward: RewardTier): QuestReward[] {
  if (reward.rewards?.length) return normalizeRewardList(reward.rewards);
  const rewards: QuestReward[] = [];
  if (reward.flies && reward.flies > 0) {
    rewards.push({ type: 'FLIES', amountMode: 'fixed', amount: reward.flies });
  }
  if (reward.itemId) {
    rewards.push({ type: 'ITEM', itemId: reward.itemId });
  }
  return normalizeRewardList(rewards);
}

function rewardSummaries(
  reward: RewardTier,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
) {
  const rewards = legacyRewardToRewards(reward);
  if (!rewards.length) return 'No reward selected';
  return rewards.map((entry) => rewardSummary(entry, rewardCatalog)).join(', ');
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
