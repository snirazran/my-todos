'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RewardPickerDialog,
  rewardSummary,
} from '@/components/ui/RewardPickerDialog';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import type { QuestReward, QuestRewards } from '@/lib/quests/types';
import {
  LEAP_MARK_IDS,
  type BonusRarity,
  type BonusReward,
  type BonusRewards,
  type LeapConfigView,
  type LeapLeague,
  type LeapMarkConfig,
  type LeapMarkId,
} from '@/lib/leap/types';

const RARITIES: BonusRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const inputClass =
  'h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:border-primary';

const CARD = 'rounded-2xl border border-border/40 bg-card/60 p-5';

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

const isTileReward = (reward: BonusReward): reward is QuestReward =>
  reward.type !== 'SHIELD' && reward.type !== 'RARITY_ITEM';

const shieldAmount = (rewards: BonusRewards) =>
  rewards.reduce(
    (total, reward) =>
      reward.type === 'SHIELD'
        ? total + Math.max(1, Math.floor(reward.amount ?? 1))
        : total,
    0,
  );

const rarityDraw = (rewards: BonusRewards) =>
  (rewards.find((reward) => reward.type === 'RARITY_ITEM') as
    | { rarity: BonusRarity }
    | undefined)?.rarity ?? '';

function RewardLane({
  label,
  hint,
  rewards,
  rewardCatalog,
  rewardItems,
  onChange,
  compact = false,
}: {
  label: string;
  hint?: string;
  rewards: BonusRewards;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  rewardItems: QuestRewardCatalogItem[];
  onChange: (next: BonusRewards) => void;
  compact?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const tiles = rewards.filter(isTileReward);
  const shields = shieldAmount(rewards);
  const rarity = rarityDraw(rewards);

  const rebuild = (args: {
    tiles?: QuestRewards;
    shields?: number;
    rarity?: BonusRarity | '';
  }) => {
    const nextTiles = args.tiles ?? tiles;
    const nextShields = args.shields ?? shields;
    const nextRarity = args.rarity ?? rarity;
    const merged: BonusRewards = [...nextTiles];
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
          <p className="text-[13px] font-black tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm font-bold text-foreground">
            {summary.length ? summary.join(' + ') : 'Nothing'}
          </p>
          {hint && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
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
      {!compact && (
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
            <span className="text-xs font-bold text-foreground">Guaranteed rarity</span>
            <select
              value={rarity}
              onChange={(event) =>
                rebuild({ rarity: event.target.value as BonusRarity | '' })
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
          </label>
        </div>
      )}
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

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

const MARK_LABELS: Record<LeapMarkId, string> = {
  hold: 'Stay (Hold)',
  leap: 'Move up (Leap)',
};

function marksFor(config: LeapConfigView, scheduled: number, days: number) {
  let previous = 0;
  return LEAP_MARK_IDS.map((id) => {
    const mark = config.marks[id];
    const minDays = Math.max(2, Math.min(mark.minDays, days));
    const target = Math.max(1, Math.ceil((scheduled * mark.percent) / 100), minDays);
    const available =
      scheduled >= mark.minScheduled && days >= 2 && target <= scheduled && target > previous;
    if (available) previous = target;
    return { id, target, available };
  });
}

export function AdminLeapManager() {
  const [config, setConfig] = useState<LeapConfigView | null>(null);
  const [defaults, setDefaults] = useState<LeapConfigView | null>(null);
  const [catalog, setCatalog] = useState<QuestRewardCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/leap');
        const payload = await res.json();
        if (res.ok) {
          setConfig(payload.config);
          setDefaults(payload.defaults);
          setCatalog(payload.catalog ?? []);
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

  const previewRows = useMemo(() => {
    if (!config) return [];
    const examples = [
      { label: '1 habit, 3×/week', scheduled: 3, days: 3 },
      { label: '1 daily habit', scheduled: 7, days: 7 },
      { label: '3 daily habits', scheduled: 21, days: 7 },
      { label: '5 weekday habits', scheduled: 25, days: 5 },
    ];
    const top = config.leagues[config.leagues.length - 1]?.multiplier ?? 1;
    return examples.map((example) => {
      const marks = marksFor(config, example.scheduled, example.days);
      const markFlies = marks
        .filter((mark) => mark.available)
        .reduce((sum, mark) => sum + config.marks[mark.id].flies, 0);
      const paidHops = Math.min(example.scheduled, config.hopsPaidPerDay * example.days);
      const base = paidHops * config.hopFlies + markFlies;
      return {
        ...example,
        marks: marks
          .map((mark) => (mark.available ? `${mark.id === 'hold' ? 'Stay' : 'Up'} ${mark.target}` : null))
          .filter(Boolean)
          .join(' · '),
        base,
        top: Math.round(base * top),
      };
    });
  }, [config]);

  const patch = (next: Partial<LeapConfigView>) =>
    setConfig((prev) => (prev ? { ...prev, ...next } : prev));

  const patchMark = (id: LeapMarkId, next: Partial<LeapMarkConfig>) =>
    setConfig((prev) =>
      prev
        ? { ...prev, marks: { ...prev.marks, [id]: { ...prev.marks[id], ...next } } }
        : prev,
    );

  const patchLeague = (index: number, next: Partial<LeapLeague>) =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            leagues: prev.leagues.map((entry, i) =>
              i === index ? { ...entry, ...next } : entry,
            ),
          }
        : prev,
    );

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch('/api/admin/leap', {
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

  if (loading || !config) {
    return (
      <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  const lane = (
    label: string,
    rewards: BonusRewards,
    onChange: (next: BonusRewards) => void,
    hint?: string,
  ) => (
    <RewardLane
      label={label}
      hint={hint}
      rewards={rewards}
      rewardCatalog={rewardCatalog}
      rewardItems={catalog}
      onChange={onChange}
    />
  );

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Leap</p>
            <p className="text-sm text-muted-foreground">
              Every repeating task is a habit. Each on-time tick is a hop that
              pays right away. Land the week&apos;s Leap to move up a Lily
              league next week; miss it and you slip one league unless a Lily
              Pad catches you.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {defaults && (
              <button
                type="button"
                onClick={() => setConfig({ ...defaults })}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Load defaults
              </button>
            )}
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
        </div>
      </div>

      <div className={CARD}>
        <p className="text-lg font-black text-foreground">Every hop</p>
        <p className="text-sm text-muted-foreground">
          Paid the instant a habit is ticked (today or yesterday), multiplied by
          the league and doubled for Plus.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Flies per hop"
            min={0}
            max={50}
            value={config.hopFlies}
            onChange={(hopFlies) => patch({ hopFlies })}
          />
          <NumberField
            label="Paying hops per day"
            hint="Hops past this still count toward the week."
            min={0}
            max={50}
            value={config.hopsPaidPerDay}
            onChange={(hopsPaidPerDay) => patch({ hopsPaidPerDay })}
          />
          <div />
          <NumberField
            label="Comeback flies"
            hint="First hop after a habit's last scheduled day was missed."
            min={0}
            max={100}
            value={config.comebackFlies}
            onChange={(comebackFlies) => patch({ comebackFlies })}
          />
          <NumberField
            label="Comeback lookback (days)"
            min={1}
            max={30}
            value={config.comebackLookbackDays}
            onChange={(comebackLookbackDays) => patch({ comebackLookbackDays })}
          />
          <NumberField
            label="Comebacks per day"
            min={0}
            max={10}
            value={config.comebacksPerDay}
            onChange={(comebacksPerDay) => patch({ comebacksPerDay })}
          />
        </div>
      </div>

      <div className={CARD}>
        <p className="text-lg font-black text-foreground">Lucky hops</p>
        <p className="text-sm text-muted-foreground">
          A variable reward on top of the hop. A user&apos;s first hop ever
          always drops the first-hop prize.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Chance per hop (%)"
            min={0}
            max={100}
            step={0.5}
            value={config.luckyChancePercent}
            onChange={(luckyChancePercent) => patch({ luckyChancePercent })}
          />
          <NumberField
            label="Guaranteed by hop #"
            hint="Pity: a drop lands by this many hops. 0 = off."
            min={0}
            max={200}
            value={config.luckyPityHops}
            onChange={(luckyPityHops) => patch({ luckyPityHops })}
          />
          <NumberField
            label="Drops per day"
            min={0}
            max={20}
            value={config.luckyDropsPerDay}
            onChange={(luckyDropsPerDay) => patch({ luckyDropsPerDay })}
          />
        </div>
        <div className="mt-4 space-y-3">
          {lane('First hop ever', config.firstHopRewards, (firstHopRewards) =>
            patch({ firstHopRewards }),
          )}
          {config.luckyDrops.map((drop, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="w-24 shrink-0">
                <NumberField
                  label="Weight"
                  min={0}
                  max={1000}
                  value={drop.weight}
                  onChange={(weight) =>
                    patch({
                      luckyDrops: config.luckyDrops.map((entry, i) =>
                        i === index ? { ...entry, weight } : entry,
                      ),
                    })
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                {lane(`Drop ${index + 1}`, drop.rewards, (rewards) =>
                  patch({
                    luckyDrops: config.luckyDrops.map((entry, i) =>
                      i === index ? { ...entry, rewards } : entry,
                    ),
                  }),
                )}
              </div>
              <div className="mt-5">
                <RemoveButton
                  label="Remove drop"
                  onClick={() =>
                    patch({
                      luckyDrops: config.luckyDrops.filter((_, i) => i !== index),
                    })
                  }
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              patch({
                luckyDrops: [
                  ...config.luckyDrops,
                  { weight: 10, rewards: [{ type: 'FLIES', amount: 10 }] },
                ],
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add drop
          </Button>
        </div>
      </div>

      <div className={CARD}>
        <p className="text-lg font-black text-foreground">The week</p>
        <p className="text-sm text-muted-foreground">
          Targets are a share of the habit ticks the user scheduled this week,
          so every schedule is judged against itself. Each line pays the moment
          it is crossed. Stay keeps the league; Move up promotes next week.
        </p>
        <div className="mt-4 space-y-4">
          {LEAP_MARK_IDS.map((id) => {
            const mark = config.marks[id];
            return (
              <div key={id} className="rounded-xl border border-border/60 p-3">
                <p className="mb-2 text-sm font-black text-foreground">{MARK_LABELS[id]}</p>
                <div className="grid gap-3 sm:grid-cols-4">
                  <NumberField
                    label="% of scheduled"
                    min={1}
                    max={100}
                    value={mark.percent}
                    onChange={(percent) => patchMark(id, { percent })}
                  />
                  <NumberField
                    label="Min distinct days"
                    min={1}
                    max={7}
                    value={mark.minDays}
                    onChange={(minDays) => patchMark(id, { minDays })}
                  />
                  <NumberField
                    label="Min scheduled ticks"
                    min={1}
                    max={100}
                    value={mark.minScheduled}
                    onChange={(minScheduled) => patchMark(id, { minScheduled })}
                  />
                  <NumberField
                    label="Flies"
                    min={0}
                    max={10000}
                    value={mark.flies}
                    onChange={(flies) => patchMark(id, { flies })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={CARD}>
        <p className="text-lg font-black text-foreground">Lily leagues</p>
        <p className="text-sm text-muted-foreground">
          Everyone starts in the first league. The multiplier raises every hop
          and line while in that league. The week prize lands with each Leap;
          the reach prize pays once, the first time a league is reached; Plus
          adds the Plus reach prize, back-paid for leagues already reached when
          someone upgrades.
        </p>
        <div className="mt-4 space-y-4">
          {config.leagues.map((league, index) => (
            <div key={index} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-bold text-foreground">
                    League {index + 1} name
                  </span>
                  <input
                    value={league.label}
                    onChange={(event) => patchLeague(index, { label: event.target.value })}
                    className={cn(inputClass, 'w-full')}
                  />
                </label>
                <div className="w-28 shrink-0">
                  <NumberField
                    label="Multiplier"
                    min={1}
                    max={5}
                    step={0.05}
                    value={league.multiplier}
                    onChange={(multiplier) => patchLeague(index, { multiplier })}
                  />
                </div>
                <RemoveButton
                  label="Remove league"
                  onClick={() =>
                    patch({ leagues: config.leagues.filter((_, i) => i !== index) })
                  }
                />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {lane('Week prize', league.weekRewards, (weekRewards) =>
                  patchLeague(index, { weekRewards }),
                )}
                {lane('Plus week prize', league.plusWeekRewards, (plusWeekRewards) =>
                  patchLeague(index, { plusWeekRewards }),
                )}
                {lane('Reach prize', league.reachRewards, (reachRewards) =>
                  patchLeague(index, { reachRewards }),
                )}
                {lane('Plus reach prize', league.plusReachRewards, (plusReachRewards) =>
                  patchLeague(index, { plusReachRewards }),
                )}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              patch({
                leagues: [
                  ...config.leagues,
                  {
                    label: 'New Lily',
                    multiplier:
                      (config.leagues[config.leagues.length - 1]?.multiplier ?? 1) + 0.25,
                    weekRewards: [],
                    reachRewards: [],
                    plusReachRewards: [],
                    plusWeekRewards: [],
                  },
                ],
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add league
          </Button>
        </div>
      </div>

      <div className={CARD}>
        <p className="text-lg font-black text-foreground">What a full week pays</p>
        <p className="text-sm text-muted-foreground">
          Every scheduled habit ticked, before Plus. Gifts and lucky drops not
          included.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-bold">Schedule</th>
                <th className="py-1.5 pr-3 font-bold">Lines (hops)</th>
                <th className="py-1.5 pr-3 font-bold">Flies, first league</th>
                <th className="py-1.5 font-bold">Flies, top league</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.label} className="border-t border-border/40">
                  <td className="py-1.5 pr-3 font-bold text-foreground">{row.label}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{row.marks || '—'}</td>
                  <td className="py-1.5 pr-3 font-bold tabular-nums">{row.base}</td>
                  <td className="py-1.5 font-bold tabular-nums">{row.top}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {note && <span className="text-sm font-bold text-muted-foreground">{note}</span>}
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Save Leap
        </Button>
      </div>
    </div>
  );
}
