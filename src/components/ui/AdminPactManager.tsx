'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RewardPickerDialog,
  rewardSummary,
} from '@/components/ui/RewardPickerDialog';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import type { QuestReward, QuestRewards } from '@/lib/quests/types';
import { PACT_MAX_SESSIONS } from '@/lib/pact/types';
import type {
  PactBonusReward,
  PactBonusRewards,
  PactConfigView,
  PactPrestigeCycle,
  PactRarity,
  PactSuggestion,
} from '@/lib/pact/types';


type AdminCategory = {
  categoryId: string;
  name: string;
  shortLabel?: string;
  accent?: string;
};

const RARITIES: PactRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

// Placeholders only — mirrors the seeded set so an empty name field suggests
// the pad the cycle carries you to rather than a bare index.
const CYCLE_NAME_HINTS = [
  'Bronze Lily',
  'Silver Lily',
  'Gold Lily',
  'Emerald Lily',
  'Diamond Lily',
];

const inputClass =
  'h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:border-primary';

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-foreground">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(inputClass, 'w-full')}
      />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const isTileReward = (reward: PactBonusReward): reward is QuestReward =>
  reward.type !== 'SHIELD' && reward.type !== 'RARITY_ITEM';

const shieldAmount = (rewards: PactBonusRewards) =>
  rewards.reduce(
    (total, reward) =>
      reward.type === 'SHIELD'
        ? total + Math.max(1, Math.floor(reward.amount ?? 1))
        : total,
    0,
  );

const rarityDraw = (rewards: PactBonusRewards) =>
  (rewards.find((reward) => reward.type === 'RARITY_ITEM') as
    | { rarity: PactRarity }
    | undefined)?.rarity ?? '';

/**
 * One reward lane. Flies, boxes and items go through the shared picker; the
 * two entries it has no vocabulary for — a Lily Pad and a guaranteed-rarity
 * draw — get their own controls beside it and are merged back into the same
 * array on save, so the lane the admin edits is the lane settlement reads.
 */
function BonusRewardLane({
  label,
  hint,
  rewards,
  rewardCatalog,
  rewardItems,
  onChange,
}: {
  label: string;
  hint?: string;
  rewards: PactBonusRewards;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  rewardItems: QuestRewardCatalogItem[];
  onChange: (next: PactBonusRewards) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const tiles = rewards.filter(isTileReward);
  const shields = shieldAmount(rewards);
  const rarity = rarityDraw(rewards);

  const rebuild = (args: {
    tiles?: QuestRewards;
    shields?: number;
    rarity?: PactRarity | '';
  }) => {
    const nextTiles = args.tiles ?? tiles;
    const nextShields = args.shields ?? shields;
    const nextRarity = args.rarity ?? rarity;
    const merged: PactBonusRewards = [...nextTiles];
    if (nextShields > 0) merged.push({ type: 'SHIELD', amount: nextShields });
    if (nextRarity) merged.push({ type: 'RARITY_ITEM', rarity: nextRarity });
    onChange(merged);
  };

  const summary = [
    ...tiles.map((reward) => rewardSummary(reward, rewardCatalog)),
    shields > 0 ? `${shields} Lily Pad${shields === 1 ? '' : 's'}` : null,
    rarity ? `guaranteed ${rarity}` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm font-bold text-foreground">
            {summary.length ? summary.join(' + ') : 'Nothing'}
          </p>
          {hint && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-xs font-black text-primary transition-colors hover:bg-primary/20"
        >
          Pick
        </button>
      </div>

      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Lily Pads"
          hint="0 = none. Capped by the shield pool."
          min={0}
          max={5}
          value={shields}
          onChange={(next) => rebuild({ shields: Math.max(0, next) })}
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-foreground">
            Guaranteed rarity
          </span>
          <select
            value={rarity}
            onChange={(event) =>
              rebuild({ rarity: event.target.value as PactRarity | '' })
            }
            className={cn(inputClass, 'w-full')}
          >
            <option value="">None</option>
            {RARITIES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground">
            Tier is certain, identity is drawn — wishlist first, un-owned
            favoured.
          </span>
        </label>
      </div>

      <RewardPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        rewards={tiles}
        rewardItems={rewardItems}
        rewardCatalog={rewardCatalog}
        onSave={(next) => {
          rebuild({ tiles: next });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

/**
 * One turn of the ladder and the piece finishing it awards.
 *
 * The piece is a single named item, not a reward list, because that is what
 * makes five cycles a *set* — pick the real set piece here and the cycle
 * hands over exactly that. Leave it unpicked and the cycle falls back to a
 * guaranteed-rarity draw, so a cycle whose art does not exist yet still pays
 * something of the right tier rather than nothing. Choosing an item clears the
 * fallback: holding both would quietly pay twice.
 */
function PrestigeCycleLane({
  cycle,
  index,
  rewardCatalog,
  rewardItems,
  onChange,
  onRemove,
}: {
  cycle: PactPrestigeCycle;
  index: number;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  rewardItems: QuestRewardCatalogItem[];
  onChange: (next: PactPrestigeCycle) => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rewards = cycle.rewards ?? [];
  const piece = rewards.find(
    (reward): reward is QuestReward =>
      reward.type === 'ITEM' && !!(reward as QuestReward).itemId,
  );
  const fallback = rewards.find((reward) => reward.type === 'RARITY_ITEM') as
    | { rarity: PactRarity }
    | undefined;
  const rarity = fallback?.rarity ?? 'legendary';
  // Anything an admin added beyond the piece itself rides along untouched.
  const extras = rewards.filter(
    (reward) => reward.type !== 'ITEM' && reward.type !== 'RARITY_ITEM',
  );
  const pieceDef = piece?.itemId ? rewardCatalog[piece.itemId] : undefined;

  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-bold text-foreground">
            Cycle {index + 1} — name
          </span>
          <input
            value={cycle.label ?? ''}
            placeholder={CYCLE_NAME_HINTS[index] ?? `Cycle ${index + 1}`}
            onChange={(event) =>
              onChange({ ...cycle, label: event.target.value })
            }
            className={cn(inputClass, 'w-full')}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete cycle"
          className="mt-6 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2.5 rounded-lg bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              Exclusive piece
            </p>
            <p className="mt-1 truncate text-sm font-bold text-foreground">
              {piece?.itemId
                ? (pieceDef?.name ?? piece.itemId)
                : `Random ${rarity} (default)`}
            </p>
            {pieceDef?.rarity && (
              <span className="mt-1 inline-block rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                {pieceDef.rarity}
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {piece && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...cycle,
                    rewards: [...extras, { type: 'RARITY_ITEM', rarity }],
                  })
                }
                className="rounded-xl px-3 py-2 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-xl bg-primary/10 px-3 py-2 text-xs font-black text-primary transition-colors hover:bg-primary/20"
            >
              Pick item
            </button>
          </div>
        </div>

        {!piece && (
          <label className="mt-2.5 flex flex-col gap-1">
            <span className="text-xs font-bold text-foreground">
              Fallback rarity
            </span>
            <select
              value={rarity}
              onChange={(event) =>
                onChange({
                  ...cycle,
                  rewards: [
                    ...extras,
                    {
                      type: 'RARITY_ITEM',
                      rarity: event.target.value as PactRarity,
                    },
                  ],
                })
              }
              className={cn(inputClass, 'w-full')}
            >
              {RARITIES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted-foreground">
              Drawn like a trade-up — wishlist first, un-owned favoured. Pays the
              right tier, but not a matching piece.
            </span>
          </label>
        )}
      </div>

      <RewardPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        rewards={piece ? [piece] : []}
        rewardItems={rewardItems}
        rewardCatalog={rewardCatalog}
        singleSelect
        tabs={['item']}
        onSave={(next) => {
          const chosen = next.find((reward) => reward.itemId);
          onChange({
            ...cycle,
            rewards: chosen
              ? [...extras, { type: 'ITEM', itemId: chosen.itemId }]
              : [...extras, { type: 'RARITY_ITEM', rarity }],
          });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

export function AdminPactManager() {
  const [config, setConfig] = useState<PactConfigView | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [catalog, setCatalog] = useState<QuestRewardCatalogItem[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/pact');
        const payload = await res.json();
        if (res.ok) {
          setConfig(payload.config);
          setCategories(payload.categories ?? []);
          setCatalog(payload.catalog ?? []);
          setActiveCategoryId(payload.categories?.[0]?.categoryId ?? '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rewardCatalog = useMemo(
    () =>
      Object.fromEntries(catalog.map((item) => [item.id, item])) as Record<
        string,
        QuestRewardCatalogItem
      >,
    [catalog],
  );

  const suggestions = useMemo(
    () =>
      (config?.suggestions ?? []).filter(
        (entry) => entry.categoryId === activeCategoryId,
      ),
    [config?.suggestions, activeCategoryId],
  );

  // What the numbers above actually pay, session count by session count. The
  // same arithmetic settlement runs, so a rate nobody would want to ship is
  // visible before it is saved rather than after it is live.
  const payoutRows = useMemo(() => {
    if (!config) return [];
    const giftFor = (sessions: number) => {
      const tiers = [...(config.completionGiftTiers ?? [])].sort(
        (a, b) => a.minSessions - b.minSessions,
      );
      let reached: QuestRewards | null = null;
      for (const tier of tiers) {
        if (sessions >= tier.minSessions && tier.rewards?.length) {
          reached = tier.rewards;
        }
      }
      const rewards = reached ?? config.completionRewards ?? [];
      return rewards.length
        ? rewards
            .map((reward) => rewardSummary(reward, rewardCatalog))
            .join(' + ')
        : 'None';
    };
    return Array.from({ length: PACT_MAX_SESSIONS }, (_, index) => {
      const sessions = index + 1;
      const total = Math.round(
        config.weekValuePerSession * (sessions + config.weekValueBaseSessions),
      );
      return {
        sessions,
        total,
        bonus: Math.max(0, total - config.fliesPerCompletion * sessions),
        gift: giftFor(sessions),
      };
    });
  }, [config, rewardCatalog]);

  const cycleRows = useMemo(() => {
    if (!config) return [];
    const topRung = (config.streakMultipliers ?? []).reduce(
      (max, rung) => Math.max(max, rung.multiplier),
      1,
    );
    const weeks = config.prestigeWeeks;
    return (config.prestigeCycles ?? []).map((cycle, index) => {
      const base = 1 + config.prestigeBaseStep * index;
      const raw = base * topRung;
      const peak = Math.min(config.maxEffectiveMultiplier, raw);
      return {
        cycle: index + 1,
        weeks: weeks > 0 ? `${index * weeks + 1}–${(index + 1) * weeks}` : '—',
        base: base.toFixed(2),
        peak: peak.toFixed(2),
        capped: raw > config.maxEffectiveMultiplier + 1e-9,
        label: cycle.label || `Cycle ${index + 1} piece`,
      };
    });
  }, [config]);

  // The smallest week the near-miss rule can actually save, and what it takes.
  // Below it, rounding puts the threshold at the whole week.
  const nearMissExample = useMemo(() => {
    const percent = config?.nearMissPercent ?? 0;
    for (let sessions = 2; sessions <= PACT_MAX_SESSIONS; sessions += 1) {
      const needed = Math.ceil((sessions * percent) / 100);
      if (needed < sessions) return { sessions, needed };
    }
    return { sessions: PACT_MAX_SESSIONS, needed: PACT_MAX_SESSIONS };
  }, [config?.nearMissPercent]);

  const coverage = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of config?.suggestions ?? []) {
      if (!entry.isActive) continue;
      map.set(entry.categoryId, (map.get(entry.categoryId) ?? 0) + 1);
    }
    return map;
  }, [config?.suggestions]);

  const patch = (next: Partial<PactConfigView>) =>
    setConfig((prev) => (prev ? { ...prev, ...next } : prev));

  const patchSuggestion = (id: string, next: Partial<PactSuggestion>) =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            suggestions: prev.suggestions.map((entry) =>
              entry.id === id ? { ...entry, ...next } : entry,
            ),
          }
        : prev,
    );

  const addSuggestion = () =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            suggestions: [
              ...prev.suggestions,
              {
                id: crypto.randomUUID(),
                categoryId: activeCategoryId,
                text: '',
                isActive: true,
                picked: 0,
                kept: 0,
              },
            ],
          }
        : prev,
    );

  const removeSuggestion = (id: string) =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            suggestions: prev.suggestions.filter((entry) => entry.id !== id),
          }
        : prev,
    );

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch('/api/admin/pact', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save');
      setConfig(payload.config);
      setNote('Saved');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (!activeCategoryId) return;
    setGenerating(true);
    setNote(null);
    try {
      const res = await fetch('/api/admin/pact/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: activeCategoryId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not generate');
      setConfig((prev) =>
        prev
          ? { ...prev, suggestions: [...prev.suggestions, ...payload.suggestions] }
          : prev,
      );
      setNote(
        `Added ${payload.suggestions.length} drafts — review and switch them on.`,
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not generate');
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Weekly Pact</p>
            <p className="text-sm text-muted-foreground">
              One area a week. Accepting writes real tasks into the user&apos;s list.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={config.isActive}
              onChange={(event) => patch({ isActive: event.target.checked })}
              className="h-4 w-4"
            />
            Active
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Evening cutover hour"
            hint="After this hour on the last day of a week, picking commits to next week instead. Local hour, 0–23."
            min={0}
            max={23}
            value={config.pickHour}
            onChange={(pickHour) => patch({ pickHour })}
          />
          <div className="rounded-xl bg-muted/30 p-3 text-[12px] leading-snug text-muted-foreground">
            The pick screen is always open — a user can start a pact any day.
            The nudge goes out on the first day of{' '}
            <span className="font-bold text-foreground">their own</span> week
            (set per user in Settings → Week starts on), taking that
            morning&apos;s reminder slot rather than adding one.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Base payout</p>
        <p className="text-sm text-muted-foreground">
          One formula: a pact is worth{' '}
          <span className="font-bold text-foreground">
            {config.weekValuePerSession} × (sessions +{' '}
            {config.weekValueBaseSessions})
          </span>{' '}
          flies. Of that, {config.fliesPerCompletion} lands on each completed
          session and the remainder lands at the finish — so most of the value
          is back-loaded onto the last session, which is where the goal-gradient
          effect does the most work. Raise the per-session rate and you flatten
          that gradient; raise the base and every week gets richer at once.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <NumberField
            label="Flies per session"
            hint="Paid as each task is ticked"
            min={0}
            max={200}
            value={config.fliesPerCompletion}
            onChange={(fliesPerCompletion) => patch({ fliesPerCompletion })}
          />
          <NumberField
            label="Week value per session"
            hint="The 20 in 20 × (sessions + 1)"
            min={0}
            max={500}
            value={config.weekValuePerSession}
            onChange={(weekValuePerSession) => patch({ weekValuePerSession })}
          />
          <NumberField
            label="Base sessions"
            hint="The + 1. What finishing is worth on its own."
            min={0}
            max={10}
            step={0.25}
            value={config.weekValueBaseSessions}
            onChange={(weekValueBaseSessions) =>
              patch({ weekValueBaseSessions })
            }
          />
          <NumberField
            label="Comeback bonus"
            hint="Once a week, for the first session after a miss. Sits on top of the formula."
            min={0}
            max={2000}
            value={config.comebackBonusFlies}
            onChange={(comebackBonusFlies) => patch({ comebackBonusFlies })}
          />
        </div>

        {/* The table the numbers above actually produce. Reading a formula and
            reading a payout are different skills, and the second is the one
            that catches a rate nobody would want to ship. */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-3">Sessions</th>
                <th className="py-1.5 pr-3">Per session</th>
                <th className="py-1.5 pr-3">Completion bonus</th>
                <th className="py-1.5 pr-3">Week total</th>
                <th className="py-1.5">Gift at completion</th>
              </tr>
            </thead>
            <tbody className="font-bold tabular-nums text-foreground">
              {payoutRows.map((row) => (
                <tr key={row.sessions} className="border-t border-border/40">
                  <td className="py-1.5 pr-3">{row.sessions}</td>
                  <td className="py-1.5 pr-3">{config.fliesPerCompletion}</td>
                  <td className="py-1.5 pr-3">{row.bonus}</td>
                  <td className="py-1.5 pr-3">{row.total}</td>
                  <td className="py-1.5 font-semibold text-muted-foreground">
                    {row.gift}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Gift at completion</p>
        <p className="text-sm text-muted-foreground">
          The gift arrives <span className="font-bold text-foreground">only</span>{' '}
          at completion, never per session — one delivered mid-pact spends the
          anticipation that pulls someone through session four. Each tier
          applies from its session count upward. A week asking for fewer
          sessions than the first tier falls back to the base gift.
        </p>

        <div className="mt-4">
          <BonusRewardLane
            label="Base gift (below the first tier)"
            rewards={config.completionRewards}
            rewardCatalog={rewardCatalog}
            rewardItems={catalog}
            onChange={(next) =>
              patch({ completionRewards: next.filter(isTileReward) })
            }
          />
        </div>

        <div className="mt-3 space-y-3">
          {(config.completionGiftTiers ?? []).map((tier, index) => (
            <div
              key={index}
              className="rounded-xl border border-border/60 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-32 shrink-0">
                  <NumberField
                    label="From sessions"
                    min={1}
                    max={PACT_MAX_SESSIONS}
                    value={tier.minSessions}
                    onChange={(minSessions) =>
                      patch({
                        completionGiftTiers: (
                          config.completionGiftTiers ?? []
                        ).map((entry, i) =>
                          i === index ? { ...entry, minSessions } : entry,
                        ),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      completionGiftTiers: (
                        config.completionGiftTiers ?? []
                      ).filter((_, i) => i !== index),
                    })
                  }
                  aria-label="Delete tier"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2.5">
                <BonusRewardLane
                  label={`Gift from ${tier.minSessions} sessions up`}
                  rewards={tier.rewards}
                  rewardCatalog={rewardCatalog}
                  rewardItems={catalog}
                  onChange={(next) =>
                    patch({
                      completionGiftTiers: (
                        config.completionGiftTiers ?? []
                      ).map((entry, i) =>
                        i === index
                          ? { ...entry, rewards: next.filter(isTileReward) }
                          : entry,
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              patch({
                completionGiftTiers: [
                  ...(config.completionGiftTiers ?? []),
                  { minSessions: PACT_MAX_SESSIONS, rewards: [] },
                ],
              })
            }
            className="rounded-xl"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add tier
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Streak milestones</p>
        <p className="text-sm text-muted-foreground">
          The multiplier applies to the whole payout, sessions and bonus alike,
          and stacks on top of the prestige base below. A week is paid at the
          rung its own number reaches, so the week that takes a run to{' '}
          {config.streakMultipliers?.[0]?.weeks ?? 4} already pays at that rate.
          Milestone rewards pay{' '}
          <span className="font-bold text-foreground">once</span> — the first
          time a streak reaches the rung in this cycle — not every week after.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Three weeks apart is the spacing to keep: two feels unearned, four is
          too far to see.
        </p>

        <div className="mt-4 space-y-3">
          {(config.streakMultipliers ?? []).map((rung, index) => (
            <div key={index} className="rounded-xl border border-border/60 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label={`Milestone ${index + 1} — weeks held`}
                  min={1}
                  max={104}
                  value={rung.weeks}
                  onChange={(weeks) =>
                    patch({
                      streakMultipliers: (config.streakMultipliers ?? []).map(
                        (entry, i) => (i === index ? { ...entry, weeks } : entry),
                      ),
                    })
                  }
                />
                <NumberField
                  label="Multiplier"
                  hint={`Effective ×${(
                    (1 +
                      config.prestigeBaseStep * (config.prestigeCycles?.length ?? 0)) *
                    rung.multiplier
                  ).toFixed(2)} at the last cycle, before the ×${config.maxEffectiveMultiplier} cap`}
                  min={1}
                  max={10}
                  step={0.05}
                  value={rung.multiplier}
                  onChange={(multiplier) =>
                    patch({
                      streakMultipliers: (config.streakMultipliers ?? []).map(
                        (entry, i) =>
                          i === index ? { ...entry, multiplier } : entry,
                      ),
                    })
                  }
                />
              </div>
              <div className="mt-2.5">
                <BonusRewardLane
                  label={`Paid once, on reaching ${rung.weeks} weeks`}
                  rewards={rung.rewards ?? []}
                  rewardCatalog={rewardCatalog}
                  rewardItems={catalog}
                  onChange={(rewards) =>
                    patch({
                      streakMultipliers: (config.streakMultipliers ?? []).map(
                        (entry, i) =>
                          i === index ? { ...entry, rewards } : entry,
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Near-miss protection (%)"
            hint="Finish this share of the sessions and the streak survives — no bonus, no gift, no milestone, but no reset either. 0 turns it off."
            min={0}
            max={100}
            value={config.nearMissPercent}
            onChange={(nearMissPercent) => patch({ nearMissPercent })}
          />
          <div className="rounded-xl bg-muted/30 p-3 text-[12px] leading-snug text-muted-foreground">
            At {config.nearMissPercent}% a{' '}
            {nearMissExample.sessions}-session week survives on{' '}
            <span className="font-bold text-foreground">
              {nearMissExample.needed}
            </span>
            . Below about 5 sessions the rule never fires — rounding puts the
            threshold at the full week — which is deliberate: a 2-session pact
            has no partial credit to give.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Prestige</p>
        <p className="text-sm text-muted-foreground">
          Completing a cycle resets the streak to zero and raises the permanent
          base multiplier. Nothing already earned is ever taken back: break a
          streak and you lose the streak multiplier, never the base. Five
          cycles, five unique pieces that form a visible matching set — a
          half-complete set of five is a far stronger long-horizon motivator
          than five unrelated legendaries of the same value.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Weeks per cycle"
            hint="0 turns prestige off and the streak simply keeps climbing."
            min={0}
            max={104}
            value={config.prestigeWeeks}
            onChange={(prestigeWeeks) => patch({ prestigeWeeks })}
          />
          <NumberField
            label="Base step per cycle"
            hint="Added to the permanent base multiplier each prestige."
            min={0}
            max={1}
            step={0.01}
            value={config.prestigeBaseStep}
            onChange={(prestigeBaseStep) => patch({ prestigeBaseStep })}
          />
          <NumberField
            label="Effective multiplier cap"
            hint="Hard ceiling on base × streak. Plus doubling sits outside it."
            min={1}
            max={10}
            step={0.05}
            value={config.maxEffectiveMultiplier}
            onChange={(maxEffectiveMultiplier) =>
              patch({ maxEffectiveMultiplier })
            }
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-3">Cycle</th>
                <th className="py-1.5 pr-3">Weeks</th>
                <th className="py-1.5 pr-3">Base ×</th>
                <th className="py-1.5 pr-3">Peak effective ×</th>
                <th className="py-1.5">Piece</th>
              </tr>
            </thead>
            <tbody className="font-bold tabular-nums text-foreground">
              {cycleRows.map((row) => (
                <tr key={row.cycle} className="border-t border-border/40">
                  <td className="py-1.5 pr-3">{row.cycle}</td>
                  <td className="py-1.5 pr-3">{row.weeks}</td>
                  <td className="py-1.5 pr-3">{row.base}</td>
                  <td className="py-1.5 pr-3">
                    {row.peak}
                    {row.capped && (
                      <span className="ml-1 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                        cap
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 font-semibold text-muted-foreground">
                    {row.label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-3">
          <BonusRewardLane
            label="Every prestige"
            hint="Paid on top of that cycle's piece, on every cycle in the set."
            rewards={config.prestigeRewards ?? []}
            rewardCatalog={rewardCatalog}
            rewardItems={catalog}
            onChange={(prestigeRewards) => patch({ prestigeRewards })}
          />
          <BonusRewardLane
            label="After the set is complete"
            hint="Each further cycle pays this instead — and issues no new piece, because a sixth would cheapen the other five."
            rewards={config.postSetPrestigeRewards ?? []}
            rewardCatalog={rewardCatalog}
            rewardItems={catalog}
            onChange={(postSetPrestigeRewards) =>
              patch({ postSetPrestigeRewards })
            }
          />
        </div>

        <p className="mt-5 text-sm font-bold text-foreground">
          The set, one piece per cycle
        </p>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          Pick a real, exclusive item per cycle to make this an actual set. Leave
          one unpicked and it falls back to a guaranteed-rarity draw — the right
          tier, but not a matching piece — so a cycle whose art does not exist
          yet still pays properly.
        </p>
        <div className="mt-3 space-y-3">
          {(config.prestigeCycles ?? []).map((cycle, index) => (
            <PrestigeCycleLane
              key={index}
              cycle={cycle}
              index={index}
              rewardCatalog={rewardCatalog}
              rewardItems={catalog}
              onChange={(next) =>
                patch({
                  prestigeCycles: (config.prestigeCycles ?? []).map((entry, i) =>
                    i === index ? next : entry,
                  ),
                })
              }
              onRemove={() =>
                patch({
                  prestigeCycles: (config.prestigeCycles ?? []).filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            />
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              patch({
                prestigeCycles: [
                  ...(config.prestigeCycles ?? []),
                  { label: '', rewards: [] },
                ],
              })
            }
            className="rounded-xl"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add cycle
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Lily Pads (price, caps, and the rescue cooldown) are tuned under{' '}
          <span className="font-bold">Shields</span> — one pool covers this
          streak and the daily one. The every-other-week auto-grant is off by
          default now: the milestones above issue them, and against a holding
          cap of 2 a second faucet only oversupplies.
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Plus swap tokens / month"
            hint="Change area mid-week, keep the streak"
            min={0}
            max={20}
            value={config.plusSwapTokensPerMonth}
            onChange={(plusSwapTokensPerMonth) =>
              patch({ plusSwapTokensPerMonth })
            }
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Ideas per area</p>
            <p className="text-sm text-muted-foreground">
              Users see three of these. Areas with fewer than three active ideas
              fall back to generic wording.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={generate}
            disabled={generating || !activeCategoryId}
            className="rounded-xl"
          >
            {generating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Draft ideas
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => {
            const count = coverage.get(category.categoryId) ?? 0;
            return (
              <button
                key={category.categoryId}
                type="button"
                onClick={() => setActiveCategoryId(category.categoryId)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm font-bold transition',
                  activeCategoryId === category.categoryId
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-primary/40',
                )}
              >
                {category.shortLabel || category.name}
                <span
                  className={cn(
                    'ml-1.5 text-[11px] font-black',
                    count < config.minOptionsPerArea
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-primary',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-3">
          {suggestions.length === 0 && (
            <p className="rounded-xl bg-muted/30 p-3 text-sm text-muted-foreground">
              No ideas yet for this area. Add one, or draft a set.
            </p>
          )}
          {suggestions.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'rounded-xl border p-3',
                entry.isActive
                  ? 'border-border/60 bg-background/40'
                  : 'border-dashed border-border/60 bg-muted/20',
              )}
            >
              <div className="flex items-center gap-2">
                <input
                  value={entry.text}
                  placeholder="Take a 20-minute walk"
                  onChange={(event) =>
                    patchSuggestion(entry.id, { text: event.target.value })
                  }
                  className={cn(inputClass, 'min-w-0 flex-1')}
                />
                <button
                  type="button"
                  onClick={() => removeSuggestion(entry.id)}
                  aria-label="Delete idea"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={entry.isActive}
                    onChange={(event) =>
                      patchSuggestion(entry.id, { isActive: event.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  Live
                </label>
                {entry.picked > 0 && (
                  <span className="text-[11px] font-bold text-muted-foreground">
                    picked {entry.picked} · kept {entry.kept} (
                    {Math.round((entry.kept / entry.picked) * 100)}%)
                  </span>
                )}
                {entry.generated && (
                  <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">
                    Draft
                  </span>
                )}
              </div>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={addSuggestion}
            disabled={!activeCategoryId}
            className="rounded-xl"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add idea
          </Button>
        </div>
      </div>

      <div className="sticky bottom-4 flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="rounded-xl">
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
        {note && (
          <span className="text-sm font-bold text-muted-foreground">{note}</span>
        )}
      </div>
    </div>
  );
}
