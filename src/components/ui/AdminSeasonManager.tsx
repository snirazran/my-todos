'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle,
  ChevronDown,
  Circle,
  Dices,
  ImagePlus,
  Loader2,
  Lock,
  Search,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  type QuestRewardCatalogItem,
  RewardTile,
} from '@/components/ui/QuestCards';
import {
  AMAZING_GIFT_ID,
  FANCY_GIFT_ID,
  SEASON_PASS_LIMITS,
  SEASON_SKIN_POOL_SLOTS,
  SEASON_SKIN_SLOTS,
  SIMPLE_GIFT_ID,
  type QuestSeasonTierReward,
  type SeasonPassConfig,
  type SeasonSkinIds,
  type SeasonSkinSlot,
  type SeasonSlotRarities,
} from '@/lib/quests/seasonLadder';
import {
  defaultSeasonName,
  SEASON_PLAN_AHEAD_MONTHS,
  seasonMonthKey,
  seasonMonthLabel,
  seasonMonthWindow,
  shiftSeasonMonth,
} from '@/lib/quests/seasonCalendar';
import { RARITY_ORDER, type Rarity, type WardrobeSlot } from '@/lib/skins/catalog';
import type { QuestRewards } from '@/lib/quests/types';

type SizeKey = 'mobile' | 'tablet' | 'web' | 'webLarge';
type SeasonImages = Record<SizeKey, string>;

type AdminSeason = SeasonPassConfig & {
  id: string;
  monthKey: string | null;
  name: string;
  images: SeasonImages;
  startsAt: string;
  endsAt: string;
  skinIds: SeasonSkinIds;
  tierRewards: QuestSeasonTierReward[];
  isActive: boolean;
};

type AdminTemplate = SeasonPassConfig & {
  slotRarities: SeasonSlotRarities;
  skinPool: WardrobeSlot[];
};

type SeasonStatus = 'live' | 'upcoming' | 'ended';

const DAY_MS = 86_400_000;

const SIZE_FIELDS: { key: SizeKey; label: string; hint: string }[] = [
  { key: 'mobile', label: 'Mobile', hint: '<768px' },
  { key: 'tablet', label: 'Tablet', hint: '≥768px' },
  { key: 'web', label: 'Web', hint: '≥1280px' },
  { key: 'webLarge', label: 'Web Large', hint: '≥1920px' },
];

const POOL_LABELS: Record<WardrobeSlot, string> = {
  skin: 'Frog skins',
  hat: 'Hats',
  body: 'Outfits',
  hand_item: 'Hand items',
  container: 'Gifts',
};

const RARITY_CHIP: Record<Rarity, string> = {
  common: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  uncommon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rare: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  epic: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  legendary: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

const NUMBER_FIELDS: Array<[keyof typeof SEASON_PASS_LIMITS, string, string]> = [
  ['tierCount', 'Tiers', 'Rungs on the ladder.'],
  ['tasksPerStep', 'Tasks per step', 'Completed tasks that earn one step.'],
  ['stepsPerTier', 'Steps per tier', 'Steps needed to climb one tier.'],
  ['maxStepsPerDay', 'Steps per day', 'Daily ceiling, so one huge day can’t burn the pass.'],
  ['tierSkipCost', 'Tier skip (flies)', 'Price of buying a tier. 0 turns it off.'],
  ['graceHours', 'Grace window (hours)', 'How long an unfinished pass stays open after the month.'],
];

const cardClass = 'rounded-[28px] border border-border/50 bg-card p-4 shadow-sm';

function seasonStatus(season: AdminSeason, now: number): SeasonStatus {
  if (new Date(season.startsAt).getTime() > now) return 'upcoming';
  if (new Date(season.endsAt).getTime() > now) return 'live';
  return 'ended';
}

function coverOf(images?: SeasonImages | null) {
  if (!images) return '';
  return images.web || images.webLarge || images.tablet || images.mobile || '';
}

function formatDay(iso: string | number, utc: boolean) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(utc ? { timeZone: 'UTC' } : {}),
  });
}

function dateRange(season: AdminSeason) {
  const utc = !!season.monthKey;
  const lastDay = new Date(season.endsAt).getTime() - 1;
  return `${formatDay(season.startsAt, utc)} – ${formatDay(lastDay, utc)}`;
}

function countdown(season: AdminSeason, status: SeasonStatus, now: number) {
  if (status === 'upcoming') {
    const days = Math.ceil((new Date(season.startsAt).getTime() - now) / DAY_MS);
    return `Starts in ${days} day${days === 1 ? '' : 's'}`;
  }
  if (status === 'live') {
    const days = Math.ceil((new Date(season.endsAt).getTime() - now) / DAY_MS);
    return `${days} day${days === 1 ? '' : 's'} left`;
  }
  return `Ended ${formatDay(season.endsAt, !!season.monthKey)}`;
}

function skinAt(season: AdminSeason, slot: (typeof SEASON_SKIN_SLOTS)[number]) {
  const stamped = season.skinIds[slot.key];
  if (stamped) return stamped;
  const tier = slot.finale ? season.tierCount : slot.tier;
  const entry = season.tierRewards.find((row) => row.tier === tier);
  const rewards = slot.lane === 'free' ? entry?.freeRewards : entry?.premiumRewards;
  return rewards?.find((reward) => reward.type === 'ITEM')?.itemId;
}

function readiness(season: AdminSeason) {
  const filled = SEASON_SKIN_SLOTS.filter((slot) => skinAt(season, slot)).length;
  return [
    {
      label: 'Name',
      done: !season.monthKey || season.name !== defaultSeasonName(season.monthKey),
      hint: 'Using the default name',
    },
    { label: 'Art', done: !!coverOf(season.images), hint: 'No background yet' },
    {
      label: 'Skins',
      done: filled === SEASON_SKIN_SLOTS.length,
      hint: `${filled}/${SEASON_SKIN_SLOTS.length} rolled`,
    },
  ];
}

function laneTotals(tiers: QuestSeasonTierReward[], lane: 'free' | 'plus') {
  const totals = { flies: 0, simple: 0, fancy: 0, amazing: 0, lilyPads: 0, skins: 0 };
  for (const entry of tiers) {
    const rewards: QuestRewards = lane === 'free' ? entry.freeRewards : entry.premiumRewards;
    for (const reward of rewards) {
      if (reward.type === 'FLIES') totals.flies += reward.amount ?? reward.maxAmount ?? 0;
      else if (reward.type === 'SHIELD') totals.lilyPads += reward.amount ?? 1;
      else if (reward.type === 'ITEM') totals.skins += 1;
      else if (reward.itemId === SIMPLE_GIFT_ID) totals.simple += 1;
      else if (reward.itemId === FANCY_GIFT_ID) totals.fancy += 1;
      else if (reward.itemId === AMAZING_GIFT_ID) totals.amazing += 1;
    }
  }
  return totals;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

type CalendarPayload = { seasons: AdminSeason[]; template: AdminTemplate; now: string };

export function AdminSeasonManager({
  rewardItems,
  rewardCatalog,
}: {
  rewardItems: QuestRewardCatalogItem[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
}) {
  const [seasons, setSeasons] = useState<AdminSeason[]>([]);
  const [template, setTemplate] = useState<AdminTemplate | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [pickerSlot, setPickerSlot] = useState<SeasonSkinSlot | null>(null);
  const [showLadder, setShowLadder] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesDraft, setRulesDraft] = useState<AdminTemplate | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  const applyPayload = (data: CalendarPayload) => {
    setSeasons(data.seasons);
    setTemplate(data.template);
    setRulesDraft(data.template);
    setNow(new Date(data.now).getTime());
  };

  const run = async (key: string, action: () => Promise<void>, success?: string) => {
    setBusy(key);
    setResult(null);
    try {
      await action();
      if (success) setResult({ type: 'success', message: success });
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        applyPayload(await request<CalendarPayload>('/api/admin/quests/seasons'));
      } catch (error) {
        setResult({
          type: 'error',
          message: error instanceof Error ? error.message : 'Could not load seasons',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentKey = seasonMonthKey(new Date(now));
  const months = useMemo(
    () =>
      Array.from({ length: SEASON_PLAN_AHEAD_MONTHS + 1 }, (_, index) =>
        shiftSeasonMonth(currentKey, index),
      ),
    [currentKey],
  );

  const seasonForMonth = (monthKey: string) => {
    const monthly = seasons.find((season) => season.monthKey === monthKey);
    if (monthly) return monthly;
    const { startsAt, endsAt } = seasonMonthWindow(monthKey);
    return seasons.find(
      (season) =>
        !season.monthKey &&
        season.isActive &&
        new Date(season.startsAt).getTime() < endsAt.getTime() &&
        new Date(season.endsAt).getTime() > startsAt.getTime(),
    );
  };

  const activeKey = selectedKey ?? months[1];
  const selected = seasonForMonth(activeKey);
  const selectedStatus = selected ? seasonStatus(selected, now) : null;
  const locked = selectedStatus !== 'upcoming';

  useEffect(() => {
    setNameDraft(selected?.name ?? '');
  }, [selected?.id, selected?.name]);

  const pastSeasons = seasons.filter(
    (season) =>
      seasonStatus(season, now) === 'ended' &&
      !months.some((monthKey) => seasonForMonth(monthKey)?.id === season.id),
  );

  const recentUse = useMemo(() => {
    const map = new Map<string, string>();
    for (const season of seasons) {
      if (season.id === selected?.id) continue;
      for (const itemId of Object.values(season.skinIds ?? {})) {
        if (itemId && !map.has(itemId)) {
          map.set(itemId, season.monthKey ? seasonMonthLabel(season.monthKey) : season.name);
        }
      }
    }
    return map;
  }, [seasons, selected?.id]);

  const post = (body: Record<string, unknown>) =>
    request<CalendarPayload>('/api/admin/quests/seasons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(applyPayload);

  const saveName = () =>
    selected &&
    run('name', () => post({ action: 'rename', id: selected.id, name: nameDraft }), 'Name saved');

  const reroll = (slot?: SeasonSkinSlot) =>
    selected &&
    run(
      slot ? `reroll:${slot}` : 'reroll',
      () => post({ action: 'reroll', id: selected.id, slot }),
      slot ? 'Rolled a new skin' : 'Rolled all six skins',
    );

  const setSkin = (slot: SeasonSkinSlot, itemId: string) =>
    selected &&
    run(`reroll:${slot}`, () => post({ action: 'setSkin', id: selected.id, slot, itemId }), 'Skin set');

  const planMonth = (monthKey: string) =>
    run(`plan:${monthKey}`, async () => {
      await post({ action: 'plan', monthKey });
      setSelectedKey(monthKey);
    });

  const uploadArt = (size: SizeKey | 'all', file: File) =>
    selected &&
    run(
      `art:${size}`,
      async () => {
        const form = new FormData();
        form.set('id', selected.id);
        form.set('size', size);
        form.set('file', file);
        await request('/api/admin/quests/seasons/upload', { method: 'POST', body: form });
        applyPayload(await request<CalendarPayload>('/api/admin/quests/seasons'));
      },
      size === 'all' ? 'Background uploaded for every screen size' : 'Image uploaded',
    );

  const removeArt = (size: SizeKey | 'all') =>
    selected &&
    run(`art:${size}`, async () => {
      await request('/api/admin/quests/seasons/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, size }),
      });
      applyPayload(await request<CalendarPayload>('/api/admin/quests/seasons'));
    });

  const saveRules = () =>
    rulesDraft &&
    run(
      'rules',
      async () => {
        await request('/api/admin/quests/seasons/template', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rulesDraft),
        });
        applyPayload(await request<CalendarPayload>('/api/admin/quests/seasons'));
      },
      'Pass rules saved — upcoming months updated',
    );

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading seasons…
      </div>
    );
  }

  const renderMonthCard = (monthKey: string, index: number) => {
    const season = seasonForMonth(monthKey);
    const isSelected = activeKey === monthKey;
    if (!season) {
      return (
        <div
          key={monthKey}
          className="flex min-h-[176px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 p-4 text-center"
        >
          <p className="text-[12px] font-black uppercase tracking-wide text-muted-foreground">
            {seasonMonthLabel(monthKey)}
          </p>
          <p className="text-xs text-muted-foreground">
            {index === 0 ? 'No season running this month' : 'Not planned yet'}
          </p>
          {index > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl font-black"
              disabled={busy !== null}
              onClick={() => void planMonth(monthKey)}
            >
              {busy === `plan:${monthKey}` ? 'Planning…' : 'Plan early'}
            </Button>
          )}
        </div>
      );
    }

    const status = seasonStatus(season, now);
    const checks = readiness(season);
    const cover = coverOf(season.images);
    return (
      <button
        key={monthKey}
        type="button"
        onClick={() => setSelectedKey(monthKey)}
        className={cn(
          'overflow-hidden rounded-2xl border bg-background/70 text-left transition',
          isSelected
            ? 'border-primary/60 ring-2 ring-primary/20'
            : 'border-border/50 hover:border-primary/30',
        )}
      >
        <div className="relative h-20">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[linear-gradient(135deg,#f59e0b_0%,#10b981_55%,#0f766e_100%)] opacity-60" />
          )}
          <span
            className={cn(
              'absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide backdrop-blur',
              status === 'live'
                ? 'bg-emerald-500 text-white'
                : status === 'upcoming'
                  ? 'bg-black/50 text-white'
                  : 'bg-black/30 text-white/80',
            )}
          >
            {status === 'live' ? 'Live' : status === 'upcoming' ? 'Upcoming' : 'Ended'}
          </span>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            {seasonMonthLabel(monthKey)}
          </p>
          <p className="truncate text-sm font-black text-foreground">{season.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {season.monthKey ? countdown(season, status, now) : `Custom dates · ${dateRange(season)}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {checks.map((check) => (
              <span
                key={check.label}
                title={check.done ? undefined : check.hint}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black',
                  check.done
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                )}
              >
                {check.done ? <CheckCircle className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                {check.label}
              </span>
            ))}
          </div>
        </div>
      </button>
    );
  };

  const renderSkins = (season: AdminSeason) => (
    <div className={cardClass}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-foreground">Season skins</h2>
          <p className="text-xs text-muted-foreground">
            {locked
              ? 'Locked — players are already climbing toward these.'
              : 'Rolled at random from each rung’s rarity, never repeating a recent season. Reroll or choose one yourself until the 1st.'}
          </p>
        </div>
        {locked ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-black text-muted-foreground">
            <Lock className="h-3 w-3" /> Locked
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5 rounded-xl font-black"
            disabled={busy !== null || !season.monthKey}
            onClick={() => void reroll()}
          >
            <Dices className="h-4 w-4" />
            {busy === 'reroll' ? 'Rolling…' : 'Reroll all'}
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SEASON_SKIN_SLOTS.map((slot) => {
          const itemId = skinAt(season, slot);
          const item = itemId ? rewardCatalog[itemId] : undefined;
          const rarity = template?.slotRarities[slot.key] ?? slot.rarity;
          const rolling = busy === `reroll:${slot.key}` || busy === 'reroll';
          return (
            <div key={slot.key} className="rounded-2xl border border-border/40 bg-background/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-black text-muted-foreground">
                  {slot.finale ? `Finale · T${season.tierCount}` : `Tier ${slot.tier}`}
                </span>
                <span className="flex gap-1">
                  <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-black capitalize', RARITY_CHIP[rarity])}>
                    {rarity}
                  </span>
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[10px] font-black',
                      slot.lane === 'free'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {slot.lane === 'free' ? 'Free' : 'Plus'}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className={cn('h-14 w-14 shrink-0', rolling && 'animate-pulse opacity-50')}>
                  {item ? (
                    <RewardTile
                      reward={{ type: 'ITEM', itemId }}
                      rewardCatalog={rewardCatalog}
                      isPremium={false}
                      compact
                      className="h-14 w-14 rounded-xl"
                    />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-border text-[10px] font-bold text-muted-foreground">
                      Gift
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-foreground">
                    {item?.name ?? 'Amazing Gift fallback'}
                  </p>
                  {!locked && (
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy !== null || !season.monthKey}
                        onClick={() => void reroll(slot.key)}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-black text-primary transition hover:bg-primary/20 disabled:opacity-50"
                      >
                        <Dices className="h-3 w-3" /> Reroll
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setPickerSlot(slot.key)}
                        className="rounded-lg bg-muted px-2 py-1 text-[11px] font-black text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                      >
                        Choose
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderLadder = (season: AdminSeason) => {
    const free = laneTotals(season.tierRewards, 'free');
    const plus = laneTotals(season.tierRewards, 'plus');
    const skinTiers = new Map<string, true>();
    for (const slot of SEASON_SKIN_SLOTS) {
      skinTiers.set(`${slot.finale ? season.tierCount : slot.tier}:${slot.lane}`, true);
    }
    const describe = (t: typeof free) =>
      [
        `${t.flies} flies`,
        t.simple && `${t.simple} gift${t.simple === 1 ? '' : 's'}`,
        t.fancy && `${t.fancy} rare gift${t.fancy === 1 ? '' : 's'}`,
        t.amazing && `${t.amazing} legendary gift${t.amazing === 1 ? '' : 's'}`,
        t.lilyPads && `${t.lilyPads} Lily Pad${t.lilyPads === 1 ? '' : 's'}`,
        `${t.skins} skin${t.skins === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' · ');

    return (
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => setShowLadder((open) => !open)}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-lg font-black text-foreground">Tier ladder</h2>
            <p className="text-xs text-muted-foreground">
              The standard {season.tierCount}-tier ladder, the same every month.
            </p>
          </div>
          <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 text-muted-foreground transition', showLadder && 'rotate-180')} />
        </button>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-primary/5 px-3 py-2">
            <p className="text-[11px] font-black text-primary">Free track</p>
            <p className="text-xs text-muted-foreground">{describe(free)}</p>
          </div>
          <div className="rounded-2xl bg-amber-500/10 px-3 py-2">
            <p className="text-[11px] font-black text-amber-600 dark:text-amber-400">Plus adds</p>
            <p className="text-xs text-muted-foreground">{describe(plus)}</p>
          </div>
        </div>
        {showLadder && (
          <div className="mt-3 divide-y divide-border/30 overflow-hidden rounded-2xl border border-border/40">
            <div className="grid grid-cols-[56px_1fr_1fr] gap-2 bg-muted/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              <span>Tier</span>
              <span>Free</span>
              <span>Plus</span>
            </div>
            {season.tierRewards.map((entry) => (
              <div key={entry.tier} className="grid grid-cols-[56px_1fr_1fr] items-center gap-2 px-3 py-1.5">
                <span className="text-xs font-black text-muted-foreground">
                  {entry.tier === season.tierCount ? 'Final' : `T${entry.tier}`}
                </span>
                {(['free', 'plus'] as const).map((lane) => {
                  const rewards = lane === 'free' ? entry.freeRewards : entry.premiumRewards;
                  return (
                    <div
                      key={lane}
                      className={cn(
                        'flex gap-1 rounded-xl p-0.5',
                        skinTiers.has(`${entry.tier}:${lane}`) && 'bg-violet-500/10',
                      )}
                    >
                      {rewards.map((reward, index) => (
                        <RewardTile
                          key={index}
                          reward={reward}
                          rewardCatalog={rewardCatalog}
                          isPremium={false}
                          compact
                          className="h-9 w-9 rounded-lg"
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderRules = () => {
    if (!rulesDraft) return null;
    const ladderSteps = rulesDraft.tierCount * rulesDraft.stepsPerTier;
    const fastDays = Math.ceil(ladderSteps / rulesDraft.maxStepsPerDay);
    const graceDays = rulesDraft.graceMode === 'climb' ? Math.floor(rulesDraft.graceHours / 24) : 0;
    const shortest = 28 + graceDays;
    const pacingTone =
      fastDays > shortest ? 'red' : ladderSteps > shortest ? 'amber' : 'ok';
    const setNumber = (key: keyof typeof SEASON_PASS_LIMITS, raw: string) => {
      const { min, max } = SEASON_PASS_LIMITS[key];
      const value = Math.min(max, Math.max(min, Math.floor(Number(raw) || min)));
      setRulesDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    return (
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => setRulesOpen((open) => !open)}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-lg font-black text-foreground">Pass rules</h2>
            <p className="text-xs text-muted-foreground">
              Pacing and skin rarities for every month. Saving updates months that haven’t started; the live one keeps its rules.
            </p>
          </div>
          <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 text-muted-foreground transition', rulesOpen && 'rotate-180')} />
        </button>

        {rulesOpen && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {NUMBER_FIELDS.map(([key, label, hint]) => (
                <label key={key} className="grid gap-1.5">
                  <span className="text-[13px] font-black text-muted-foreground">{label}</span>
                  <input
                    type="number"
                    min={SEASON_PASS_LIMITS[key].min}
                    max={SEASON_PASS_LIMITS[key].max}
                    value={rulesDraft[key]}
                    onChange={(event) => setNumber(key, event.target.value)}
                    className="h-11 rounded-2xl border border-border bg-background px-4 text-sm font-bold"
                  />
                  <span className="text-[10px] leading-snug text-muted-foreground">{hint}</span>
                </label>
              ))}
            </div>

            <p
              className={cn(
                'rounded-xl px-3 py-2 text-[11px] font-bold',
                pacingTone === 'red'
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                  : pacingTone === 'amber'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-muted/50 text-muted-foreground',
              )}
            >
              A steady player (one step a day) needs {ladderSteps} days; maxing every day takes {fastDays}. The shortest month gives {shortest} days
              {graceDays > 0 ? ' with grace' : ''}.
              {pacingTone === 'red'
                ? ' Nobody can finish in February.'
                : pacingTone === 'amber'
                  ? ' Only players who max some days will finish short months.'
                  : ''}
            </p>

            <div className="grid gap-2">
              <span className="text-[13px] font-black text-muted-foreground">After the month ends</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: 'climb' as const, title: 'Keep climbing', body: 'Tasks credit the old pass and the new one during the grace window.' },
                    { value: 'claim' as const, title: 'Collect only', body: 'The old ladder freezes; the window only collects tiers already reached.' },
                  ]
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRulesDraft((prev) => (prev ? { ...prev, graceMode: option.value } : prev))}
                    className={cn(
                      'rounded-2xl border p-3 text-left transition',
                      rulesDraft.graceMode === option.value
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border/40 bg-background/70 hover:border-primary/30',
                    )}
                  >
                    <p className="text-xs font-black text-foreground">{option.title}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{option.body}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-[13px] font-black text-muted-foreground">Skin rung rarities</span>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SEASON_SKIN_SLOTS.map((slot) => (
                  <label key={slot.key} className="flex items-center justify-between gap-2 rounded-2xl border border-border/40 bg-background/70 px-3 py-2">
                    <span className="text-xs font-black text-foreground">
                      {slot.finale ? 'Finale' : `Tier ${slot.tier}`} · {slot.lane === 'free' ? 'Free' : 'Plus'}
                    </span>
                    <select
                      value={rulesDraft.slotRarities[slot.key]}
                      onChange={(event) =>
                        setRulesDraft((prev) =>
                          prev
                            ? { ...prev, slotRarities: { ...prev.slotRarities, [slot.key]: event.target.value as Rarity } }
                            : prev,
                        )
                      }
                      className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold capitalize"
                    >
                      {RARITY_ORDER.map((rarity) => (
                        <option key={rarity} value={rarity}>
                          {rarity}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-[13px] font-black text-muted-foreground">Skins can come from</span>
              <div className="flex flex-wrap gap-2">
                {SEASON_SKIN_POOL_SLOTS.map((poolSlot) => {
                  const on = rulesDraft.skinPool.includes(poolSlot);
                  return (
                    <button
                      key={poolSlot}
                      type="button"
                      onClick={() =>
                        setRulesDraft((prev) => {
                          if (!prev) return prev;
                          const next = on
                            ? prev.skinPool.filter((entry) => entry !== poolSlot)
                            : [...prev.skinPool, poolSlot];
                          return next.length > 0 ? { ...prev, skinPool: next } : prev;
                        })
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-black transition',
                        on
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border/50 text-muted-foreground hover:border-primary/30',
                      )}
                    >
                      {POOL_LABELS[poolSlot]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl font-black"
                disabled={busy !== null}
                onClick={() => setRulesDraft(template)}
              >
                Discard
              </Button>
              <Button size="sm" className="rounded-xl font-black" disabled={busy !== null} onClick={() => void saveRules()}>
                {busy === 'rules' ? 'Saving…' : 'Save rules'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const pickerRarity = pickerSlot
    ? (template?.slotRarities[pickerSlot] ?? 'common')
    : 'common';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {result && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium',
            result.type === 'success'
              ? 'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/8 text-red-600 dark:text-red-400',
          )}
        >
          {result.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {result.message}
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-lg font-black text-foreground">Monthly seasons</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          A new pass starts on the 1st of every month at 00:00 UTC. Next month is drafted automatically with a name and random skins, so give it art and a name whenever you like.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {months.map(renderMonthCard)}
        </div>
      </div>

      {selected && (
        <>
          <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
            <div className="relative h-[220px] overflow-hidden">
              {coverOf(selected.images) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverOf(selected.images)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[linear-gradient(135deg,#f59e0b_0%,#10b981_55%,#0f766e_100%)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
                <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[12px] font-black text-white backdrop-blur-md">
                  {selected.monthKey ? seasonMonthLabel(selected.monthKey) : 'Custom season'} · {dateRange(selected)}
                </span>
                <span className="rounded-full bg-black/50 px-3 py-1 text-[12px] font-bold text-white/85 backdrop-blur-sm">
                  {selectedStatus && countdown(selected, selectedStatus, now)}
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 p-5">
                <input
                  value={nameDraft}
                  maxLength={60}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && nameDraft.trim() && nameDraft !== selected.name) void saveName();
                  }}
                  placeholder="Season name…"
                  className="min-w-0 flex-1 bg-transparent text-3xl font-black tracking-tight text-white placeholder-white/50 outline-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
                />
                {nameDraft.trim() && nameDraft !== selected.name && (
                  <Button size="sm" className="shrink-0 rounded-xl font-black" disabled={busy !== null} onClick={() => void saveName()}>
                    {busy === 'name' ? 'Saving…' : 'Save name'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="mb-3">
              <h2 className="text-lg font-black text-foreground">Background</h2>
              <p className="text-xs text-muted-foreground">
                Upload one wide image — mobile, tablet, web and large sizes are made from it.
              </p>
            </div>
            <ArtDropzone
              value={coverOf(selected.images)}
              busy={busy === 'art:all'}
              disabled={busy !== null}
              onPick={(file) => void uploadArt('all', file)}
              onRemove={() => void removeArt('all')}
            />
            <button
              type="button"
              onClick={() => setShowOverrides((open) => !open)}
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-muted-foreground transition hover:text-foreground"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition', showOverrides && 'rotate-180')} />
              Per-device overrides
            </button>
            {showOverrides && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {SIZE_FIELDS.map((field) => (
                  <SeasonImageUploader
                    key={field.key}
                    label={field.label}
                    hint={field.hint}
                    value={selected.images[field.key]}
                    disabled={busy !== null}
                    onPick={(file) => void uploadArt(field.key, file)}
                    onRemove={() => void removeArt(field.key)}
                  />
                ))}
              </div>
            )}
          </div>

          {renderSkins(selected)}
          {renderLadder(selected)}
        </>
      )}

      {renderRules()}

      {pastSeasons.length > 0 && (
        <div className={cardClass}>
          <button
            type="button"
            onClick={() => setPastOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <h2 className="text-lg font-black text-foreground">Past seasons</h2>
            <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition', pastOpen && 'rotate-180')} />
          </button>
          {pastOpen && (
            <div className="mt-3 divide-y divide-border/30">
              {pastSeasons.map((season) => (
                <div key={season.id} className="flex items-center gap-3 py-2">
                  <div className="h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {coverOf(season.images) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverOf(season.images)} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">{season.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {season.monthKey ? seasonMonthLabel(season.monthKey) : 'Custom dates'} · {dateRange(season)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <SkinChooserDialog
        open={pickerSlot !== null}
        onOpenChange={(open) => {
          if (!open) setPickerSlot(null);
        }}
        rarity={pickerRarity}
        pool={template?.skinPool ?? SEASON_SKIN_POOL_SLOTS}
        currentId={pickerSlot && selected ? selected.skinIds[pickerSlot] : undefined}
        takenIds={new Set(Object.values(selected?.skinIds ?? {}).filter(Boolean) as string[])}
        recentUse={recentUse}
        rewardItems={rewardItems}
        rewardCatalog={rewardCatalog}
        onPick={(itemId) => {
          if (pickerSlot) void setSkin(pickerSlot, itemId);
          setPickerSlot(null);
        }}
      />
    </div>
  );
}

function ArtDropzone({
  value,
  busy,
  disabled,
  onPick,
  onRemove,
}: {
  value: string;
  busy: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file && !disabled) onPick(file);
      }}
      className={cn(
        'flex items-center gap-4 rounded-2xl border-2 border-dashed p-3 transition',
        dragging ? 'border-primary bg-primary/5' : 'border-border/60',
      )}
    >
      <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-6 w-6 opacity-60" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Drop an image here, or pick a file. PNG, JPG, WebP or AVIF up to 10 MB; 5120px wide covers every screen.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="rounded-xl font-black"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {value ? 'Replace' : 'Upload background'}
          </Button>
          {value && (
            <Button size="sm" variant="outline" className="rounded-xl font-black" disabled={disabled} onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function SeasonImageUploader({
  label,
  hint,
  value,
  disabled,
  onPick,
  onRemove,
}: {
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-black text-muted-foreground">{label}</span>
        <span className="text-[10px] font-medium text-muted-foreground/70">{hint}</span>
      </div>
      <div className="flex items-stretch gap-2">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-[10px] text-muted-foreground">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="opacity-60">empty</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="h-9 w-full rounded-xl bg-primary/10 px-3 text-xs font-black text-primary transition hover:bg-primary/20 disabled:opacity-60"
          >
            {value ? 'Replace' : 'Upload image'}
          </button>
          {value && (
            <button
              type="button"
              disabled={disabled}
              onClick={onRemove}
              className="h-7 w-full rounded-lg bg-red-500/10 text-[11px] font-bold text-red-600 transition hover:bg-red-500/20 disabled:opacity-60 dark:text-red-400"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function SkinChooserDialog({
  open,
  onOpenChange,
  rarity,
  pool,
  currentId,
  takenIds,
  recentUse,
  rewardItems,
  rewardCatalog,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rarity: Rarity;
  pool: WardrobeSlot[];
  currentId?: string;
  takenIds: Set<string>;
  recentUse: Map<string, string>;
  rewardItems: QuestRewardCatalogItem[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onPick: (itemId: string) => void;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const options = rewardItems.filter(
    (item) =>
      item.rarity === rarity &&
      pool.includes(item.slot as WardrobeSlot) &&
      item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a {rarity} skin</DialogTitle>
          <DialogDescription>
            Only {rarity} items from the allowed slots fit this rung.
          </DialogDescription>
        </DialogHeader>
        <label className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="mt-3 grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {options.map((item) => {
            const taken = takenIds.has(item.id) && item.id !== currentId;
            const usedIn = recentUse.get(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={taken}
                onClick={() => onPick(item.id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl border p-2 text-center transition disabled:opacity-40',
                  item.id === currentId
                    ? 'border-primary bg-primary/5'
                    : 'border-border/40 hover:border-primary/40',
                )}
              >
                <RewardTile
                  reward={{ type: 'ITEM', itemId: item.id }}
                  rewardCatalog={rewardCatalog}
                  isPremium={false}
                  compact
                  className="h-14 w-14 rounded-xl"
                />
                <span className="line-clamp-1 text-[11px] font-black text-foreground">{item.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {taken ? 'In this season' : usedIn ? `Used: ${usedIn}` : POOL_LABELS[item.slot as WardrobeSlot]}
                </span>
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No matches.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
