'use client';

import React, { useMemo, useState } from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  AdminCard,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  PageTabs,
  PondButton,
  ResetLink,
  SaveBar,
  ToggleRow,
  inputClass,
} from '@/components/admin/kit';
import { RewardEditButton, RewardStrip } from '@/components/admin/pickers';
import { useAdminConfig } from '@/components/admin/useAdminConfig';
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
import { markTargets } from '@/lib/leap/targets';
import { cn } from '@/lib/utils';

const RARITIES: BonusRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const LEAGUE_EMOJI = ['🍃', '🌱', '🌸', '💐', '🏡', '🌳', '🌺'];

type Section = 'leagues' | 'hops' | 'lucky' | 'week' | 'check';

const isTileReward = (reward: BonusReward): reward is QuestReward =>
  reward.type !== 'SHIELD' && reward.type !== 'RARITY_ITEM';

const shieldAmount = (rewards: BonusRewards) =>
  rewards.reduce(
    (total, reward) => (reward.type === 'SHIELD' ? total + Math.max(1, Math.floor(reward.amount ?? 1)) : total),
    0,
  );

const rarityDraw = (rewards: BonusRewards) =>
  (rewards.find((reward) => reward.type === 'RARITY_ITEM') as { rarity: BonusRarity } | undefined)?.rarity ?? '';

function PrizeLane({
  rewards,
  rewardCatalog,
  rewardItems,
  onChange,
}: {
  rewards: BonusRewards;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  rewardItems: QuestRewardCatalogItem[];
  onChange: (next: BonusRewards) => void;
}) {
  const tiles = rewards.filter(isTileReward);
  const shields = shieldAmount(rewards);
  const rarity = rarityDraw(rewards);

  const rebuild = (args: { tiles?: QuestRewards; shields?: number; rarity?: BonusRarity | '' }) => {
    const merged: BonusRewards = [...(args.tiles ?? tiles)];
    const nextShields = args.shields ?? shields;
    const nextRarity = args.rarity ?? rarity;
    if (nextShields > 0) merged.push({ type: 'SHIELD', amount: nextShields });
    if (nextRarity) merged.push({ type: 'RARITY_ITEM', rarity: nextRarity });
    onChange(merged);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex min-h-[44px] flex-wrap items-center gap-2">
        <RewardStrip
          rewards={tiles}
          rewardCatalog={rewardCatalog}
          empty="Nothing"
          extra={
            shields > 0 || rarity ? (
              <>
                {shields > 0 ? (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-black text-emerald-700 dark:text-emerald-400">
                    +{shields} Lily Pad{shields === 1 ? '' : 's'}
                  </span>
                ) : null}
                {rarity ? (
                  <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-[12px] font-black capitalize text-violet-700 dark:text-violet-400">
                    + a {rarity} item
                  </span>
                ) : null}
    </>
            ) : undefined
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RewardEditButton
          rewards={tiles}
          rewardCatalog={rewardCatalog}
          rewardItems={rewardItems}
          onChange={(next) => rebuild({ tiles: next })}
        />
        <label className="flex items-center gap-1.5 text-[12px] font-black text-muted-foreground">
          🪷
          <span className="w-[64px]">
            <NumberInput value={shields} max={5} onChange={(next) => rebuild({ shields: next })} />
          </span>
        </label>
        <select
          value={rarity}
          onChange={(event) => rebuild({ rarity: event.target.value as BonusRarity | '' })}
          className={cn(inputClass, 'w-auto text-[12px]')}
          aria-label="Guaranteed rarity item"
        >
          <option value="">No rarity item</option>
          {RARITIES.map((entry) => (
            <option key={entry} value={entry}>
              + {entry} item
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const MARK_COPY: Record<LeapMarkId, { title: string; blurb: string; emoji: string }> = {
  hold: { title: 'Stay', blurb: 'Keeps the player in their league.', emoji: '🛟' },
  leap: { title: 'Move up', blurb: 'Promotes next week. Its % is set per league.', emoji: '🚀' },
};

export function AdminLeapManager() {
  const leap = useAdminConfig<LeapConfigView>({
    url: '/api/admin/leap',
    read: (payload) => payload?.config,
  });
  const [section, setSection] = useState<Section>('leagues');
  const [leagueIndex, setLeagueIndex] = useState(0);
  const config = leap.config;
  const defaults = (leap.payload?.defaults ?? null) as LeapConfigView | null;
  const catalog = (leap.payload?.catalog ?? []) as QuestRewardCatalogItem[];
  const rewardCatalog = useMemo(
    () => Object.fromEntries(catalog.map((item) => [item.id, item])) as Record<string, QuestRewardCatalogItem>,
    [catalog],
  );

  const previewRows = useMemo(() => {
    if (!config) return [];
    const examples = [
      { label: '1 habit, 3× a week', scheduled: 3, days: 3 },
      { label: '1 daily habit', scheduled: 7, days: 7 },
      { label: '3 daily habits', scheduled: 21, days: 7 },
      { label: '5 weekday habits', scheduled: 25, days: 5 },
    ];
    const topIndex = Math.max(0, config.leagues.length - 1);
    const top = config.leagues[topIndex]?.multiplier ?? 1;
    return examples.map((example) => {
      const marks = markTargets(config, example.scheduled, example.days, 0);
      const markFlies = marks
        .filter((mark) => mark.available)
        .reduce((sum, mark) => sum + config.marks[mark.id].flies, 0);
      const paidHops = Math.min(example.scheduled, config.hopsPaidPerDay * example.days);
      const base = paidHops * config.hopFlies + markFlies;
      return {
        ...example,
        stay: marks.find((mark) => mark.id === 'hold'),
        up: marks.find((mark) => mark.id === 'leap'),
        base,
        top: Math.round(base * top),
      };
    });
  }, [config]);

  const patchMark = (id: LeapMarkId, next: Partial<LeapMarkConfig>) =>
    leap.set((prev) => ({ ...prev, marks: { ...prev.marks, [id]: { ...prev.marks[id], ...next } } }));

  const patchLeague = (index: number, next: Partial<LeapLeague>) =>
    leap.set((prev) => ({ ...prev, leagues: prev.leagues.map((entry, i) => (i === index ? { ...entry, ...next } : entry)) }));

  const lane = (rewards: BonusRewards, onChange: (next: BonusRewards) => void) => (
    <PrizeLane rewards={rewards} rewardCatalog={rewardCatalog} rewardItems={catalog} onChange={onChange} />
  );

  const dropWeightTotal = config ? config.luckyDrops.reduce((sum, drop) => sum + Math.max(0, drop.weight), 0) : 0;
  const league = config?.leagues[Math.min(leagueIndex, Math.max(0, (config?.leagues.length ?? 1) - 1))];
  const safeLeagueIndex = config ? Math.min(leagueIndex, Math.max(0, config.leagues.length - 1)) : 0;

  return (
    <ConfigShell loading={leap.loading} error={leap.error}>
      {config ? (
        <div className="space-y-5">
          <AdminCard bodyClassName="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <ToggleRow
                  title={config.isActive ? 'Leap is live' : 'Leap is off'}
                  description="Every repeating task is a habit. Each on-time tick is a hop that pays right away; land the week's Leap to climb a Lily league."
                  checked={config.isActive}
                  onChange={(isActive) => leap.patch({ isActive })}
                />
              </div>
              {defaults ? <ResetLink onClick={() => leap.set(() => ({ ...defaults }))}>Load defaults</ResetLink> : null}
            </div>
          </AdminCard>

          <PageTabs<Section>
            value={section}
            onChange={setSection}
            options={[
              { value: 'leagues', label: 'Leagues', badge: config.leagues.length },
              { value: 'hops', label: 'Every hop' },
              { value: 'lucky', label: 'Lucky drops', badge: config.luckyDrops.length },
              { value: 'week', label: 'Weekly goals' },
              { value: 'check', label: 'Payout check' },
            ]}
          />

          {section === 'leagues' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {config.leagues.map((entry, index) => (
                  <React.Fragment key={index}>
                    {index > 0 ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" /> : null}
                    <button
                      type="button"
                      onClick={() => setLeagueIndex(index)}
                      className={cn(
                        'flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition',
                        index === safeLeagueIndex
                          ? 'border-primary/40 bg-primary/10 shadow-[0_3px_0_0_hsl(var(--primary)/0.25)]'
                          : 'border-border/70 bg-card shadow-[0_3px_0_0_hsl(var(--border))] hover:bg-muted/40',
                      )}
                    >
                      <span className="text-[20px]">{LEAGUE_EMOJI[index % LEAGUE_EMOJI.length]}</span>
                      <span>
                        <span className="block text-[13px] font-black leading-tight">{entry.label || `League ${index + 1}`}</span>
                        <span className="block text-[11px] font-bold text-muted-foreground">
                          ×{entry.multiplier} · up at {entry.leapPercent}%
                        </span>
                      </span>
                    </button>
                  </React.Fragment>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const last = config.leagues[config.leagues.length - 1];
                    leap.patch({
                      leagues: [
                        ...config.leagues,
                        {
                          label: 'New Lily',
                          multiplier: (last?.multiplier ?? 1) + 0.25,
                          leapPercent: Math.min(95, (last?.leapPercent ?? config.marks.leap.percent) + 5),
                          weekRewards: [],
                          reachRewards: [],
                          plusReachRewards: [],
                          plusWeekRewards: [],
                        },
                      ],
                    });
                    setLeagueIndex(config.leagues.length);
                  }}
                  className="ml-1 flex h-[52px] shrink-0 items-center gap-1.5 rounded-2xl border-2 border-dashed border-border px-3 text-[12px] font-black text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  <Plus className="h-4 w-4" />
                  League
                </button>
              </div>

              {league ? (
                <AdminCard
                  title={league.label || `League ${safeLeagueIndex + 1}`}
                  subtitle={
                    safeLeagueIndex === 0
                      ? 'Everyone starts here.'
                      : `Reached after ${safeLeagueIndex} Leap week${safeLeagueIndex === 1 ? '' : 's'}.`
                  }
                  icon={<span className="text-[20px]">{LEAGUE_EMOJI[safeLeagueIndex % LEAGUE_EMOJI.length]}</span>}
                  actions={
                    config.leagues.length > 1 ? (
                      <PondButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          leap.patch({ leagues: config.leagues.filter((_, i) => i !== safeLeagueIndex) });
                          setLeagueIndex(Math.max(0, safeLeagueIndex - 1));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </PondButton>
                    ) : null
                  }
                >
                  <div className="space-y-5">
                    <FieldGrid cols={3}>
                      <Field label="Name">
                        <input
                          value={league.label}
                          onChange={(event) => patchLeague(safeLeagueIndex, { label: event.target.value })}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Move up at" hint="Share of the week's scheduled ticks.">
                        <NumberInput value={league.leapPercent} min={1} max={100} suffix="%" onChange={(leapPercent) => patchLeague(safeLeagueIndex, { leapPercent })} />
                      </Field>
                      <Field label="Fly multiplier" hint="On every hop and goal in this league.">
                        <NumberInput value={league.multiplier} min={1} max={5} step={0.05} suffix="×" onChange={(multiplier) => patchLeague(safeLeagueIndex, { multiplier })} />
                      </Field>
                    </FieldGrid>

                    <div className="overflow-hidden rounded-2xl border border-border/70">
                      <div className="hidden grid-cols-[10rem_1fr_1fr] bg-muted/50 text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground md:grid">
                        <span className="px-4 py-2" />
                        <span className="px-4 py-2">Everyone</span>
                        <span className="px-4 py-2">Plus gets extra</span>
                      </div>
                      {(
                        [
                          { title: 'Each Leap week', note: 'Every week they move up from here.', free: 'weekRewards', plus: 'plusWeekRewards' },
                          { title: 'First time here', note: 'Once. Plus is back-paid on upgrade.', free: 'reachRewards', plus: 'plusReachRewards' },
                        ] as const
                      ).map((row) => (
                        <div key={row.title} className="grid gap-3 border-t border-border/60 p-4 first:border-t-0 md:grid-cols-[10rem_1fr_1fr] md:gap-0 md:p-0">
                          <div className="md:px-4 md:py-4">
                            <p className="text-[14px] font-black">{row.title}</p>
                            <p className="text-[12px] font-medium text-muted-foreground">{row.note}</p>
                          </div>
                          <div className="md:border-l md:border-border/60 md:px-4 md:py-4">
                            <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground md:hidden">Everyone</p>
                            {lane(league[row.free], (next) => patchLeague(safeLeagueIndex, { [row.free]: next } as Partial<LeapLeague>))}
                          </div>
                          <div className="rounded-xl bg-amber-400/[0.07] p-3 md:rounded-none md:border-l md:border-border/60 md:px-4 md:py-4">
                            <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400 md:hidden">Plus gets extra</p>
                            {lane(league[row.plus], (next) => patchLeague(safeLeagueIndex, { [row.plus]: next } as Partial<LeapLeague>))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[12px] font-medium text-muted-foreground">
                      🪷 adds Lily Pads (held back once the shield pool is full). The rarity item draws a random item of that rarity.
                    </p>
                  </div>
                </AdminCard>
              ) : null}
            </div>
          ) : null}

          {section === 'hops' ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <AdminCard
                title="Every hop"
                subtitle="Paid the moment a habit is ticked (today or yesterday), times the league, doubled for Plus."
                icon={<span className="text-[20px]">🐸</span>}
              >
                <FieldGrid cols={2}>
                  <Field label="Flies per hop">
                    <NumberInput value={config.hopFlies} max={50} onChange={(hopFlies) => leap.patch({ hopFlies })} />
                  </Field>
                  <Field label="Paying hops a day" hint="More still count toward the week.">
                    <NumberInput value={config.hopsPaidPerDay} max={50} onChange={(hopsPaidPerDay) => leap.patch({ hopsPaidPerDay })} />
                  </Field>
                </FieldGrid>
              </AdminCard>
              <AdminCard
                title="Comebacks"
                subtitle="A bonus for the first hop after a habit's last scheduled day was missed."
                icon={<span className="text-[20px]">👋</span>}
                tone="sky"
              >
                <FieldGrid cols={3}>
                  <Field label="Bonus">
                    <NumberInput value={config.comebackFlies} max={100} suffix="flies" onChange={(comebackFlies) => leap.patch({ comebackFlies })} />
                  </Field>
                  <Field label="Looks back">
                    <NumberInput value={config.comebackLookbackDays} min={1} max={30} suffix="days" onChange={(comebackLookbackDays) => leap.patch({ comebackLookbackDays })} />
                  </Field>
                  <Field label="Per day">
                    <NumberInput value={config.comebacksPerDay} max={10} onChange={(comebacksPerDay) => leap.patch({ comebacksPerDay })} />
                  </Field>
                </FieldGrid>
              </AdminCard>
            </div>
          ) : null}

          {section === 'lucky' ? (
            <div className="space-y-5">
              <AdminCard
                title="Lucky hops"
                subtitle="A surprise on top of a hop."
                icon={<span className="text-[20px]">🍀</span>}
                tone="sun"
              >
                <FieldGrid cols={3}>
                  <Field label="Chance per hop">
                    <NumberInput value={config.luckyChancePercent} max={100} step={0.5} suffix="%" onChange={(luckyChancePercent) => leap.patch({ luckyChancePercent })} />
                  </Field>
                  <Field label="Sure thing by hop" hint="0 turns the safety net off.">
                    <NumberInput value={config.luckyPityHops} max={200} onChange={(luckyPityHops) => leap.patch({ luckyPityHops })} />
                  </Field>
                  <Field label="Drops a day">
                    <NumberInput value={config.luckyDropsPerDay} max={20} onChange={(luckyDropsPerDay) => leap.patch({ luckyDropsPerDay })} />
                  </Field>
                </FieldGrid>
              </AdminCard>

              <AdminCard
                title="What can drop"
                subtitle="One is picked by weight each time a lucky hop lands."
                icon={<span className="text-[20px]">🎲</span>}
                actions={
                  <PondButton
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      leap.patch({ luckyDrops: [...config.luckyDrops, { weight: 10, rewards: [{ type: 'FLIES', amount: 10 }] }] })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add drop
                  </PondButton>
                }
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.04] p-3">
                    <div className="w-[7.5rem] shrink-0">
                      <p className="text-[13px] font-black text-primary">First hop ever</p>
                      <p className="text-[11px] font-bold text-muted-foreground">Always drops</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      {lane(config.firstHopRewards, (firstHopRewards) => leap.patch({ firstHopRewards }))}
                    </div>
                  </div>
                  {config.luckyDrops.map((drop, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-4 rounded-2xl bg-muted/45 p-3">
                      <div className="w-[7.5rem] shrink-0 space-y-1">
                        <NumberInput
                          value={drop.weight}
                          max={1000}
                          suffix="wt"
                          onChange={(weight) =>
                            leap.patch({ luckyDrops: config.luckyDrops.map((entry, i) => (i === index ? { ...entry, weight } : entry)) })
                          }
                        />
                        <p className="text-[12px] font-black tabular-nums text-primary">
                          {dropWeightTotal > 0 ? `${Math.round((Math.max(0, drop.weight) / dropWeightTotal) * 1000) / 10}%` : '0%'} of drops
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        {lane(drop.rewards, (rewards) =>
                          leap.patch({ luckyDrops: config.luckyDrops.map((entry, i) => (i === index ? { ...entry, rewards } : entry)) }),
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => leap.patch({ luckyDrops: config.luckyDrops.filter((_, i) => i !== index) })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                        aria-label="Remove drop"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </AdminCard>
            </div>
          ) : null}

          {section === 'week' ? (
            <AdminCard
              title="Weekly goals"
              subtitle="Targets are a share of the ticks a player scheduled, so every schedule is judged against itself. Each goal pays the moment it's crossed, and targets only go down once the week starts."
              icon={<span className="text-[20px]">🎯</span>}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {LEAP_MARK_IDS.map((id) => {
                  const mark = config.marks[id];
                  const copy = MARK_COPY[id];
                  return (
                    <div key={id} className="rounded-2xl bg-muted/45 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-[20px]">{copy.emoji}</span>
                        <div>
                          <p className="text-[15px] font-black">{copy.title}</p>
                          <p className="text-[12px] font-medium text-muted-foreground">{copy.blurb}</p>
                        </div>
                      </div>
                      <FieldGrid cols={2}>
                        {id === 'hold' ? (
                          <Field label="Share of scheduled">
                            <NumberInput value={mark.percent} min={1} max={100} suffix="%" onChange={(percent) => patchMark(id, { percent })} />
                          </Field>
                        ) : (
                          <Field label="Share of scheduled">
                            <button
                              type="button"
                              onClick={() => setSection('leagues')}
                              className="flex h-10 items-center rounded-xl border border-dashed border-border px-3 text-[12px] font-black text-primary"
                            >
                              Per league →
                            </button>
                          </Field>
                        )}
                        <Field label="Pays">
                          <NumberInput value={mark.flies} max={10000} suffix="flies" onChange={(flies) => patchMark(id, { flies })} />
                        </Field>
                        <Field label="At least">
                          <NumberInput value={mark.minDays} min={1} max={7} suffix="days" onChange={(minDays) => patchMark(id, { minDays })} />
                        </Field>
                        <Field label="At least">
                          <NumberInput value={mark.minScheduled} min={1} max={100} suffix="ticks" onChange={(minScheduled) => patchMark(id, { minScheduled })} />
                        </Field>
                      </FieldGrid>
                    </div>
                  );
                })}
              </div>
            </AdminCard>
          ) : null}

          {section === 'check' ? (
            <AdminCard
              title="What a perfect week pays"
              subtitle="Every scheduled habit ticked, before Plus. Gifts and lucky drops not included."
              icon={<span className="text-[20px]">🧮</span>}
              tone="sky"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {previewRows.map((row) => (
                  <div key={row.label} className="rounded-2xl bg-muted/45 p-4">
                    <p className="text-[14px] font-black">{row.label}</p>
                    <p className="mt-0.5 text-[12px] font-bold text-muted-foreground">
                      {row.stay?.available ? `Stay at ${row.stay.target}` : 'No Stay goal'} ·{' '}
                      {row.up?.available ? `Move up at ${row.up.target}` : 'No Move-up goal'}
                    </p>
                    <div className="mt-3 flex items-end gap-4">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">First league</p>
                        <p className="text-[22px] font-black tabular-nums">{row.base}🪰</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">Top league</p>
                        <p className="text-[22px] font-black tabular-nums text-primary">{row.top}🪰</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AdminCard>
          ) : null}
        </div>
      ) : null}
      <SaveBar
        dirty={leap.dirty}
        saving={leap.saving}
        onSave={() => void leap.save()}
        onDiscard={leap.discard}
        label="Leap has unsaved changes"
      />
    </ConfigShell>
  );
}
