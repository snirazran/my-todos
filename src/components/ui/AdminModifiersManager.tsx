'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  ListChecks,
  Loader2,
  Plus,
  Repeat,
  RotateCcw,
  Save,
  Sliders,
  Store,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_TRADE_MODIFIERS,
  quoteTradeFuel,
  type TradeModifiers,
  type TradeRecipe,
} from '@/lib/skins/tradeModifiers';
import { RARITY_ORDER, rarityRank, type Rarity } from '@/lib/skins/catalog';
import {
  DEFAULT_SHOP_SALES,
  SHOP_TIERS,
  type ShopSalesConfig,
} from '@/lib/skins/shopSales';
import {
  FLY_ECONOMY_DEFAULTS,
  type FlyEconomyConfig,
} from '@/lib/economy/defaults';
import {
  checklistMarkerIndexes,
  type ChecklistTier,
} from '@/lib/checklist';

type View = 'home' | 'trade' | 'shop' | 'streak' | 'checklist' | 'social';
type TaskStreakConfig = FlyEconomyConfig['taskStreak'];
type ChecklistConfig = FlyEconomyConfig['checklist'];

const inputClass =
  'h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:border-primary';

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={inputClass}
        />
        {suffix && (
          <span className="text-xs font-black text-muted-foreground">{suffix}</span>
        )}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function CategoryCard({
  icon,
  accent,
  title,
  description,
  stat,
  onClick,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  description: string;
  stat: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card/60 p-5 text-left transition-colors hover:border-primary/40 hover:bg-card"
    >
      <div className={cn('rounded-2xl p-3', accent)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-black text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="mt-1 text-[13px] font-black text-primary">
          {stat}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export function AdminModifiersManager() {
  const [view, setView] = useState<View>('home');
  const [config, setConfig] = useState<TradeModifiers | null>(null);
  const [economy, setEconomy] = useState<FlyEconomyConfig | null>(null);
  const [shop, setShop] = useState<ShopSalesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [tradeRes, economyRes, shopRes] = await Promise.all([
          fetch('/api/admin/trade-modifiers', { credentials: 'include' }),
          fetch('/api/admin/economy', { credentials: 'include' }),
          fetch('/api/admin/shop-sales', { credentials: 'include' }),
        ]);
        const tradePayload = await tradeRes.json();
        if (tradeRes.ok) setConfig(tradePayload.config);
        const economyPayload = await economyRes.json().catch(() => null);
        if (economyRes.ok && economyPayload) setEconomy(economyPayload.economy);
        const shopPayload = await shopRes.json().catch(() => null);
        if (shopRes.ok && shopPayload) setShop(shopPayload.config);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patch = (next: Partial<TradeModifiers>) =>
    setConfig((prev) => (prev ? { ...prev, ...next } : prev));

  const patchRecipe = (from: TradeRecipe['from'], next: Partial<TradeRecipe>) =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            recipes: prev.recipes.map((recipe) =>
              recipe.from === from ? { ...recipe, ...next } : recipe,
            ),
          }
        : prev,
    );

  const streak = economy?.taskStreak ?? null;

  const patchStreak = (next: Partial<TaskStreakConfig>) =>
    setEconomy((prev) =>
      prev ? { ...prev, taskStreak: { ...prev.taskStreak, ...next } } : prev,
    );

  const patchChecklist = (next: Partial<ChecklistConfig>) =>
    setEconomy((prev) =>
      prev ? { ...prev, checklist: { ...prev.checklist, ...next } } : prev,
    );

  const patchBuddy = (next: Partial<FlyEconomyConfig['buddy']>) =>
    setEconomy((prev) =>
      prev ? { ...prev, buddy: { ...prev.buddy, ...next } } : prev,
    );

  const patchPond = (next: Partial<FlyEconomyConfig['friendsPond']>) =>
    setEconomy((prev) =>
      prev ? { ...prev, friendsPond: { ...prev.friendsPond, ...next } } : prev,
    );

  const patchShop = (next: Partial<ShopSalesConfig>) =>
    setShop((prev) => (prev ? { ...prev, ...next } : prev));

  const saveShop = async () => {
    if (!shop) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/shop-sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(shop),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save');
      setShop(payload.config);
      setMessage({ type: 'success', text: 'Saved' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not save',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  const saveStreak = async () => {
    if (!economy) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/economy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ economy }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save');
      setEconomy(payload.economy);
      setMessage({ type: 'success', text: 'Saved' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not save',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/trade-modifiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save');
      setConfig(payload.config);
      setMessage({ type: 'success', text: 'Saved' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not save',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  const deepestRecipe = config?.recipes.find((recipe) => recipe.fuelRarity) ?? null;
  const maxWaiverQuote =
    config &&
    quoteTradeFuel({
      modifiers: config,
      recipe: deepestRecipe,
      allSpares: true,
      isPlus: true,
    });

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {view === 'home' ? (
              <Link
                href="/admin"
                className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <button
                onClick={() => setView('home')}
                className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div className="rounded-2xl bg-indigo-500/10 p-3 text-indigo-600 dark:text-indigo-400">
              {view === 'trade' ? (
                <Repeat className="h-7 w-7" />
              ) : view === 'shop' ? (
                <Store className="h-7 w-7" />
              ) : view === 'streak' ? (
                <Flame className="h-7 w-7" />
              ) : view === 'checklist' ? (
                <ListChecks className="h-7 w-7" />
              ) : view === 'social' ? (
                <Users className="h-7 w-7" />
              ) : (
                <Sliders className="h-7 w-7" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                {view === 'trade'
                  ? 'Trade modifiers'
                  : view === 'shop'
                    ? 'Shop sales'
                    : view === 'streak'
                    ? 'Task streaks'
                    : view === 'checklist'
                      ? 'Checklist rewards'
                      : view === 'social'
                        ? 'Social rewards'
                        : 'Modifiers'}
              </h1>
              <p className="text-sm font-medium text-muted-foreground">
                {view === 'trade'
                  ? 'Recipe ratios, fuel, aim prices and the draw rules behind every trade-up.'
                  : view === 'shop'
                    ? 'How the daily shelf is composed, which slots get marked down, and who can reroll it.'
                  : view === 'streak'
                    ? 'The per-completion rate, the one-time milestones and the mercy that keeps a long habit alive.'
                    : view === 'checklist'
                      ? 'How much a checklist pays for its length, and where inside the list the flies are pinned.'
                      : view === 'social'
                        ? 'Buddy payouts and the friends\' pond — capped per pair, per friend and per day.'
                        : 'The tunable rules behind the economy loops.'}
              </p>
            </div>
          </div>
          {view !== 'home' && (
            <button
              onClick={
                view === 'trade' ? save : view === 'shop' ? saveShop : saveStreak
              }
              disabled={
                saving ||
                (view === 'trade' ? !config : view === 'shop' ? !shop : !economy)
              }
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
          )}
        </div>

        {message && (
          <div
            className={cn(
              'rounded-xl px-4 py-3 text-sm font-bold',
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !config ? (
          <div className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-400">
            Could not load the modifier config.
          </div>
        ) : view === 'home' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryCard
              icon={<Repeat className="h-5 w-5" />}
              accent="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
              title="Trade modifiers"
              description="Ratios and fuel per tier, spares and Plus waivers, aim prices, golden trades, draw weighting and wishlist slots."
              stat={`${config.recipes.length} recipes · golden ${config.goldenTradeChancePercent}%`}
              onClick={() => setView('trade')}
            />
            <CategoryCard
              icon={<Store className="h-5 w-5" />}
              accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              title="Shop sales"
              description="The daily rotation: how many slots and of which tiers, the reserved wishlist slot, per-tier discounts and how often each tier goes on sale, the weekend special, and rerolls."
              stat={
                shop
                  ? `${shop.slots} slots · ${shop.discountedSlots} on sale · rolls at ${String(shop.refreshHour).padStart(2, '0')}:00`
                  : 'Unavailable'
              }
              onClick={() => setView('shop')}
            />
            <CategoryCard
              icon={<Flame className="h-5 w-5" />}
              accent="bg-orange-500/10 text-orange-600 dark:text-orange-400"
              title="Task streaks"
              description="Per-completion rates that replace the base fly, one-time milestone payouts with gifts and Lily Pads, and the free missed day."
              stat={
                streak
                  ? `${streak.tiers.length} tiers · ${streak.milestones.length} milestones · ${streak.milestonesPerDay}/day`
                  : 'Unavailable'
              }
              onClick={() => setView('streak')}
            />
            <CategoryCard
              icon={<ListChecks className="h-5 w-5" />}
              accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              title="Task checklist rewards"
              description="What a checklist pays for its length, and the marker positions inside the list where those flies are handed over."
              stat={
                economy
                  ? `${economy.checklist.tiers.length} length bands`
                  : 'Unavailable'
              }
              onClick={() => setView('checklist')}
            />
            <CategoryCard
              icon={<Users className="h-5 w-5" />}
              accent="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              title="Social rewards"
              description="Buddy payouts and Duo Week, plus the friends' pond: generation rate, claim gate, per-friend and daily caps, expiry and the weekly bonus."
              stat={
                economy
                  ? `buddy ${economy.buddy.bonusFlies}×${economy.buddy.dailyPayouts}/day · pond ${economy.friendsPond.dailyCapFree}/${economy.friendsPond.dailyCapPlus}`
                  : 'Unavailable'
              }
              onClick={() => setView('social')}
            />
          </div>
        ) : view === 'shop' ? (
          <ShopSalesEditor shop={shop} patch={patchShop} />
        ) : view === 'streak' ? (
          <StreakEditor streak={streak} patch={patchStreak} />
        ) : view === 'checklist' ? (
          <ChecklistRewardsEditor
            checklist={economy?.checklist ?? null}
            patch={patchChecklist}
          />
        ) : view === 'social' ? (
          <SocialRewardsEditor
            economy={economy}
            patchBuddy={patchBuddy}
            patchPond={patchPond}
          />
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-foreground">Recipes</p>
                  <p className="text-sm text-muted-foreground">
                    Same-tier items in, plus optional fuel from a lower tier.
                    Trading costs items only — the aim price is the one thing a
                    trade can charge flies for.
                  </p>
                </div>
                <button
                  onClick={() =>
                    patch({ recipes: DEFAULT_TRADE_MODIFIERS.recipes })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Defaults
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-[12px] font-black text-muted-foreground">
                      <th className="px-2">Recipe</th>
                      <th className="px-2">Items in</th>
                      <th className="px-2">Fuel tier</th>
                      <th className="px-2">Fuel count</th>
                      <th className="px-2">Aim price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.recipes.map((recipe) => (
                      <tr key={recipe.from} className="bg-muted/40">
                        <td className="rounded-l-xl px-3 py-2 text-[13px] font-black text-foreground">
                          {recipe.from} → {recipe.to}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={2}
                            max={12}
                            value={recipe.itemCount}
                            onChange={(event) =>
                              patchRecipe(recipe.from, {
                                itemCount: Number(event.target.value),
                              })
                            }
                            className={cn(inputClass, 'max-w-[90px]')}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={recipe.fuelRarity ?? ''}
                            onChange={(event) => {
                              const value = event.target.value;
                              patchRecipe(recipe.from, {
                                fuelRarity: value ? (value as Rarity) : null,
                                fuelCount: value
                                  ? recipe.fuelCount || 1
                                  : 0,
                              });
                            }}
                            className={cn(inputClass, 'max-w-[130px]')}
                          >
                            <option value="">None</option>
                            {RARITY_ORDER.filter(
                              (rarity) =>
                                rarityRank[rarity] < rarityRank[recipe.from],
                            ).map((rarity) => (
                              <option key={rarity} value={rarity}>
                                {rarity}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            max={12}
                            disabled={!recipe.fuelRarity}
                            value={recipe.fuelCount}
                            onChange={(event) =>
                              patchRecipe(recipe.from, {
                                fuelCount: Number(event.target.value),
                              })
                            }
                            className={cn(
                              inputClass,
                              'max-w-[90px]',
                              !recipe.fuelRarity && 'opacity-40',
                            )}
                          />
                        </td>
                        <td className="rounded-r-xl px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100000}
                            value={recipe.aimPriceFlies}
                            onChange={(event) =>
                              patchRecipe(recipe.from, {
                                aimPriceFlies: Number(event.target.value),
                              })
                            }
                            className={cn(inputClass, 'max-w-[120px]')}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
              <p className="text-lg font-black text-foreground">Fuel waivers</p>
              <p className="text-sm text-muted-foreground">
                Both stack, then the cap trims the total. Waivers only apply to
                recipes that ask for fuel.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <NumberField
                  label="All-spares waiver"
                  hint="Applies when every main input is an item the player owns 2+ of."
                  min={0}
                  max={12}
                  suffix="items"
                  value={config.allSparesFuelWaived}
                  onChange={(allSparesFuelWaived) => patch({ allSparesFuelWaived })}
                />
                <NumberField
                  label="Plus waiver"
                  hint="For active Plus accounts."
                  min={0}
                  max={12}
                  suffix="items"
                  value={config.plusFuelWaived}
                  onChange={(plusFuelWaived) => patch({ plusFuelWaived })}
                />
                <NumberField
                  label="Combined cap"
                  hint={
                    maxWaiverQuote && deepestRecipe
                      ? `${deepestRecipe.from} → ${deepestRecipe.to} bottoms out at ${maxWaiverQuote.count} fuel.`
                      : undefined
                  }
                  min={0}
                  max={12}
                  suffix="items"
                  value={config.maxFuelWaived}
                  onChange={(maxFuelWaived) => patch({ maxFuelWaived })}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
              <p className="text-lg font-black text-foreground">Aim</p>
              <p className="text-sm text-muted-foreground">
                The optional pre-trade payment that guarantees the reward is a
                wishlisted item. Per-tier prices live in the recipe table.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Plus discount"
                  hint="Cut off the aim price for active Plus accounts."
                  min={0}
                  max={100}
                  suffix="%"
                  value={config.aimPlusDiscountPercent}
                  onChange={(aimPlusDiscountPercent) =>
                    patch({ aimPlusDiscountPercent })
                  }
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
              <p className="text-lg font-black text-foreground">Output rules</p>
              <p className="text-sm text-muted-foreground">
                The tier is always guaranteed one step up — these only steer which
                item comes out, and how often two do.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Golden trade chance"
                  hint="Chance the trade returns extra items instead of one."
                  min={0}
                  max={100}
                  suffix="%"
                  value={config.goldenTradeChancePercent}
                  onChange={(goldenTradeChancePercent) =>
                    patch({ goldenTradeChancePercent })
                  }
                />
                <NumberField
                  label="Golden trade items"
                  hint="How many items a golden trade returns."
                  min={1}
                  max={5}
                  value={config.goldenTradeRewardCount}
                  onChange={(goldenTradeRewardCount) =>
                    patch({ goldenTradeRewardCount })
                  }
                />
                <NumberField
                  label="New-first weighting"
                  hint="How much an un-owned item outweighs an owned one in the draw."
                  min={1}
                  max={20}
                  suffix="×"
                  value={config.newFirstWeight}
                  onChange={(newFirstWeight) => patch({ newFirstWeight })}
                />
                <NumberField
                  label="All-spares weighting"
                  hint="New-first weighting used when every input is a spare."
                  min={1}
                  max={20}
                  suffix="×"
                  value={config.allSparesNewFirstWeight}
                  onChange={(allSparesNewFirstWeight) =>
                    patch({ allSparesNewFirstWeight })
                  }
                />
                <NumberField
                  label="Wishlist redirect"
                  hint="Chance the reward is drawn from the player's un-owned wishlisted items of that rarity."
                  min={0}
                  max={100}
                  suffix="%"
                  value={config.wishlistRedirectPercent}
                  onChange={(wishlistRedirectPercent) =>
                    patch({ wishlistRedirectPercent })
                  }
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
              <p className="text-lg font-black text-foreground">Wishlist slots</p>
              <p className="text-sm text-muted-foreground">
                How many items a player can hold on the list the redirect draws
                from.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Free accounts"
                  min={1}
                  max={50}
                  value={config.wishlistSlotsFree}
                  onChange={(wishlistSlotsFree) => patch({ wishlistSlotsFree })}
                />
                <NumberField
                  label="Plus accounts"
                  min={1}
                  max={50}
                  value={config.wishlistSlotsPlus}
                  onChange={(wishlistSlotsPlus) => patch({ wishlistSlotsPlus })}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function ShopSalesEditor({
  shop,
  patch,
}: {
  shop: ShopSalesConfig | null;
  patch: (next: Partial<ShopSalesConfig>) => void;
}) {
  if (!shop) {
    return (
      <div className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-400">
        Could not load the shop sales config.
      </div>
    );
  }

  const patchMap = (
    key: 'rarityDiscountPercent' | 'raritySaleDaysPercent',
    rarity: Rarity,
    value: number,
  ) => patch({ [key]: { ...shop[key], [rarity]: value } } as Partial<ShopSalesConfig>);

  const planned = shop.affordableSlots + shop.rareSlots + shop.epicSlots;
  const commonShare = Math.round(
    (shop.affordableSlots * shop.commonWeightPercent) / 100,
  );

  const stale = (
    [
      'discountedSlots',
      'weekendDiscountedSlots',
      'wishlistDealChancePercent',
    ] as const
  ).filter((key) => shop[key] !== DEFAULT_SHOP_SALES[key]).length;

  const resetAll = () =>
    patch({
      ...DEFAULT_SHOP_SALES,
      rarityDiscountPercent: { ...DEFAULT_SHOP_SALES.rarityDiscountPercent },
      raritySaleDaysPercent: { ...DEFAULT_SHOP_SALES.raritySaleDaysPercent },
    });

  return (
    <div className="space-y-4">
      {/* Saved values win over code defaults forever — that is what keeps an
          admin edit from being wiped on deploy, but it also means a config
          written under older defaults keeps serving them until reset here. */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-muted/30 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">
          These values are stored, not read from the code — a shelf saved under
          older settings keeps them until you reset.
          {stale > 0 && (
            <span className="font-black text-amber-600 dark:text-amber-400">
              {' '}
              {stale} setting{stale === 1 ? '' : 's'} still differ from the
              current defaults.
            </span>
          )}
        </p>
        <button
          onClick={resetAll}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset all
        </button>
      </div>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Rotation</p>
            <p className="text-sm text-muted-foreground">
              The shelf is composed by tier so there is always something buyable
              today and something to save toward. Items the player already owns
              never appear, and legendaries never do — they are trade-only.
            </p>
          </div>
          <button
            onClick={() =>
              patch({
                slots: DEFAULT_SHOP_SALES.slots,
                refreshHour: DEFAULT_SHOP_SALES.refreshHour,
                affordableSlots: DEFAULT_SHOP_SALES.affordableSlots,
                commonWeightPercent: DEFAULT_SHOP_SALES.commonWeightPercent,
                rareSlots: DEFAULT_SHOP_SALES.rareSlots,
                epicSlots: DEFAULT_SHOP_SALES.epicSlots,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Slots"
            hint={
              planned === shop.slots
                ? 'Tier counts add up.'
                : `Tier counts add up to ${planned} — the rest fills from the cheap tiers.`
            }
            min={1}
            max={12}
            value={shop.slots}
            onChange={(slots) => patch({ slots })}
          />
          <NumberField
            label="Refresh hour"
            hint="Local hour the shelf rolls over. Later than midnight, so someone still up at 1am isn't cut off mid-decision."
            min={0}
            max={23}
            suffix=":00"
            value={shop.refreshHour}
            onChange={(refreshHour) => patch({ refreshHour })}
          />
          <NumberField
            label="Affordable slots"
            hint={`Common or uncommon — about ${commonShare} common per day.`}
            min={0}
            max={12}
            value={shop.affordableSlots}
            onChange={(affordableSlots) => patch({ affordableSlots })}
          />
          <NumberField
            label="Common share"
            hint="Split inside the affordable slots — the rest go to uncommon."
            min={0}
            max={100}
            suffix="%"
            value={shop.commonWeightPercent}
            onChange={(commonWeightPercent) => patch({ commonWeightPercent })}
          />
          <NumberField
            label="Rare slots"
            hint="The week-long save."
            min={0}
            max={12}
            value={shop.rareSlots}
            onChange={(rareSlots) => patch({ rareSlots })}
          />
          <NumberField
            label="Epic slots"
            hint="The aspiration slot."
            min={0}
            max={12}
            value={shop.epicSlots}
            onChange={(epicSlots) => patch({ epicSlots })}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Wishlist slot</p>
        <p className="text-sm text-muted-foreground">
          One slot reserved for something the player already pinned and
          doesn&apos;t own — the highest-converting slot there is. Players with
          nothing pinned lose nothing: the slot goes back to the normal tier
          draw, so the shelf is always six deep.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-foreground">
              Reserve a slot
            </span>
            <select
              value={shop.wishlistSlot ? 'on' : 'off'}
              onChange={(event) =>
                patch({ wishlistSlot: event.target.value === 'on' })
              }
              className={inputClass}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
            <span className="text-[11px] text-muted-foreground">
              Skipped when the player has no un-owned pins.
            </span>
          </label>
          <NumberField
            label="Discounted on"
            hint="Share of days the reserved slot is one of the day's sales."
            min={0}
            max={100}
            suffix="% of days"
            value={shop.wishlistDealChancePercent}
            onChange={(wishlistDealChancePercent) =>
              patch({ wishlistDealChancePercent })
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Discounts</p>
            <p className="text-sm text-muted-foreground">
              Every slot carries a discount; what changes is how deep. Rarer
              tiers cut deeper, so the epic markdown is still the one worth
              coming back for. The ceiling is the trade-up guard: let a discount
              go deeper and buying the exact item undercuts the trade.
            </p>
          </div>
          <button
            onClick={() =>
              patch({
                rarityDiscountPercent: {
                  ...DEFAULT_SHOP_SALES.rarityDiscountPercent,
                },
                raritySaleDaysPercent: {
                  ...DEFAULT_SHOP_SALES.raritySaleDaysPercent,
                },
                discountedSlots: DEFAULT_SHOP_SALES.discountedSlots,
                maxDiscountPercent: DEFAULT_SHOP_SALES.maxDiscountPercent,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[12px] font-black text-muted-foreground">
                <th className="px-2">Tier</th>
                <th className="px-2">Discount</th>
                <th className="px-2">Sale days</th>
                <th className="px-2">How often</th>
              </tr>
            </thead>
            <tbody>
              {SHOP_TIERS.map((rarity) => {
                const days = shop.raritySaleDaysPercent[rarity] ?? 0;
                return (
                  <tr key={rarity} className="bg-muted/40">
                    <td className="rounded-l-xl px-3 py-2 text-[13px] font-black text-foreground">
                      {rarity}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={shop.rarityDiscountPercent[rarity] ?? 0}
                        onChange={(event) =>
                          patchMap(
                            'rarityDiscountPercent',
                            rarity,
                            Number(event.target.value),
                          )
                        }
                        className={cn(inputClass, 'max-w-[90px]')}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={days}
                        onChange={(event) =>
                          patchMap(
                            'raritySaleDaysPercent',
                            rarity,
                            Number(event.target.value),
                          )
                        }
                        className={cn(inputClass, 'max-w-[90px]')}
                      />
                    </td>
                    <td className="rounded-r-xl px-3 py-2 text-xs font-medium text-muted-foreground">
                      {days >= 100
                        ? 'Every day this tier is on the shelf'
                        : days <= 0
                          ? 'Never on sale'
                          : `~${Math.round((days / 100) * 5)} day${Math.round((days / 100) * 5) === 1 ? '' : 's'} in 5`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Discounted slots"
            hint={
              shop.discountedSlots >= shop.slots
                ? 'The whole shelf, on a normal day.'
                : 'On a normal day. The rest of the shelf sits at its standing price, and the sale-days column decides which tiers get picked.'
            }
            min={0}
            max={shop.slots}
            value={shop.discountedSlots}
            onChange={(discountedSlots) => patch({ discountedSlots })}
          />
          <NumberField
            label="Discount ceiling"
            hint="Clamps every discount, weekend included."
            min={0}
            max={90}
            suffix="%"
            value={shop.maxDiscountPercent}
            onChange={(maxDiscountPercent) => patch({ maxDiscountPercent })}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Weekend special</p>
        <p className="text-sm text-muted-foreground">
          One day a week every discount deepens to a single flat rate, overriding
          the per-tier cuts above — this is the day worth showing up for.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-foreground">Day</span>
            <select
              value={shop.weekendDay}
              onChange={(event) =>
                patch({ weekendDay: Number(event.target.value) })
              }
              className={inputClass}
            >
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Discounted slots"
            min={0}
            max={shop.slots}
            value={shop.weekendDiscountedSlots}
            onChange={(weekendDiscountedSlots) =>
              patch({ weekendDiscountedSlots })
            }
          />
          <NumberField
            label="Discount"
            hint="Flat across every discounted slot that day, then clamped by the ceiling."
            min={0}
            max={90}
            suffix="%"
            value={shop.weekendDiscountPercent}
            onChange={(weekendDiscountPercent) =>
              patch({ weekendDiscountPercent })
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Rerolls</p>
        <p className="text-sm text-muted-foreground">
          A reroll swaps the whole shelf. Every roll carries at least one
          discount and nothing the player owns, so a reroll can never land worse
          than what it replaced.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Plus rerolls"
            hint="Free, per day."
            min={0}
            max={10}
            suffix="/ day"
            value={shop.plusRerolls}
            onChange={(plusRerolls) => patch({ plusRerolls })}
          />
          <NumberField
            label="Free rerolls"
            hint="Each one costs a rewarded ad."
            min={0}
            max={10}
            suffix="/ day"
            value={shop.adRerolls}
            onChange={(adRerolls) => patch({ adRerolls })}
          />
        </div>
      </section>
    </div>
  );
}

function StreakEditor({
  streak,
  patch,
}: {
  streak: TaskStreakConfig | null;
  patch: (next: Partial<TaskStreakConfig>) => void;
}) {
  if (!streak) {
    return (
      <div className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-400">
        Could not load the fly economy config.
      </div>
    );
  }

  const patchTier = (index: number, next: Partial<TaskStreakConfig['tiers'][number]>) =>
    patch({
      tiers: streak.tiers.map((tier, i) =>
        i === index ? { ...tier, ...next } : tier,
      ),
    });

  const patchMilestone = (
    index: number,
    next: Partial<TaskStreakConfig['milestones'][number]>,
  ) =>
    patch({
      milestones: streak.milestones.map((milestone, i) =>
        i === index ? { ...milestone, ...next } : milestone,
      ),
    });

  const lastTier = streak.tiers[streak.tiers.length - 1];
  const lastMilestone = streak.milestones[streak.milestones.length - 1];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Per completion</p>
            <p className="text-sm text-muted-foreground">
              What one tick pays at a given streak length. This REPLACES the
              base fly rather than stacking with it, and it stops climbing at
              the last tier — an ever-growing per-tick figure is the exploit
              surface. The prestige is the number, not the payout.
            </p>
          </div>
          <button
            onClick={() => patch({ tiers: [...FLY_ECONOMY_DEFAULTS.taskStreak.tiers] })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {streak.tiers.map((tier, index) => (
            <div
              key={`${tier.minDays}-${index}`}
              className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2"
            >
              <span className="w-24 shrink-0 text-[12px] font-black text-muted-foreground">
                From day
              </span>
              <input
                type="number"
                min={1}
                value={tier.minDays}
                onChange={(event) =>
                  patchTier(index, { minDays: Number(event.target.value) })
                }
                className={cn(inputClass, 'max-w-[90px]')}
              />
              <span className="text-[12px] font-black text-muted-foreground">
                pays
              </span>
              <input
                type="number"
                min={0}
                value={tier.flies}
                onChange={(event) =>
                  patchTier(index, { flies: Number(event.target.value) })
                }
                className={cn(inputClass, 'max-w-[90px]')}
              />
              <span className="text-xs font-bold text-muted-foreground">
                flies
              </span>
              <button
                onClick={() =>
                  patch({ tiers: streak.tiers.filter((_, i) => i !== index) })
                }
                disabled={streak.tiers.length <= 1}
                className="ml-auto rounded-lg p-2 text-muted-foreground transition-colors hover:text-red-500 disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              patch({
                tiers: [
                  ...streak.tiers,
                  {
                    minDays: (lastTier?.minDays ?? 0) + 7,
                    flies: (lastTier?.flies ?? 1) + 1,
                  },
                ],
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add tier
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Milestones</p>
            <p className="text-sm text-muted-foreground">
              One-time payouts per task. Only one lands a day across every task
              — the rest queue for tomorrow, which is the anti-farm guard and is
              invisible to anyone keeping a normal number of habits.
            </p>
          </div>
          <button
            onClick={() =>
              patch({ milestones: [...FLY_ECONOMY_DEFAULTS.taskStreak.milestones] })
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[12px] font-black text-muted-foreground">
                <th className="px-2">At day</th>
                <th className="px-2">Flies</th>
                <th className="px-2">Gift item id</th>
                <th className="px-2">Lily Pads</th>
                <th className="px-2" />
              </tr>
            </thead>
            <tbody>
              {streak.milestones.map((milestone, index) => (
                <tr key={`${milestone.atDays}-${index}`} className="bg-muted/40">
                  <td className="rounded-l-xl px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      value={milestone.atDays}
                      onChange={(event) =>
                        patchMilestone(index, {
                          atDays: Number(event.target.value),
                        })
                      }
                      className={cn(inputClass, 'max-w-[90px]')}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      value={milestone.flies}
                      onChange={(event) =>
                        patchMilestone(index, {
                          flies: Number(event.target.value),
                        })
                      }
                      className={cn(inputClass, 'max-w-[90px]')}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={milestone.giftItemId ?? ''}
                      placeholder="none"
                      onChange={(event) =>
                        patchMilestone(index, {
                          giftItemId: event.target.value,
                        })
                      }
                      className={cn(inputClass, 'max-w-[180px]')}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={milestone.shields ?? 0}
                      onChange={(event) =>
                        patchMilestone(index, {
                          shields: Number(event.target.value),
                        })
                      }
                      className={cn(inputClass, 'max-w-[90px]')}
                    />
                  </td>
                  <td className="rounded-r-xl px-2 py-2 text-right">
                    <button
                      onClick={() =>
                        patch({
                          milestones: streak.milestones.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() =>
            patch({
              milestones: [
                ...streak.milestones,
                {
                  atDays: (lastMilestone?.atDays ?? 0) + 30,
                  flies: lastMilestone?.flies ?? 30,
                },
              ],
            })
          }
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add milestone
        </button>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">
          After the last milestone
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          What every further cycle pays, so a habit kept for years still has
          something ahead of it.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="Repeat every"
            suffix="days"
            min={0}
            max={365}
            value={streak.repeatEveryDays}
            onChange={(repeatEveryDays) => patch({ repeatEveryDays })}
          />
          <NumberField
            label="Flies"
            min={0}
            max={1000}
            value={streak.repeatFlies}
            onChange={(repeatFlies) => patch({ repeatFlies })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-foreground">
              Gift item id
            </span>
            <input
              value={streak.repeatGiftItemId}
              onChange={(event) =>
                patch({ repeatGiftItemId: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <NumberField
            label="Lily Pads"
            min={0}
            max={5}
            value={streak.repeatShields}
            onChange={(repeatShields) => patch({ repeatShields })}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Guards</p>
        <p className="mb-4 text-sm text-muted-foreground">
          The queue and the mercy. A single missed Tuesday should never cost a
          60-day habit, and no shield is spent on it.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Milestone payouts"
            suffix="per day"
            hint="Across all tasks; extras queue to tomorrow."
            min={0}
            max={20}
            value={streak.milestonesPerDay}
            onChange={(milestonesPerDay) => patch({ milestonesPerDay })}
          />
          <NumberField
            label="Free missed day"
            suffix="every N days"
            hint="One missed day per window is bridged automatically, with no prompt."
            min={1}
            max={365}
            value={streak.freeSlipEveryDays}
            onChange={(freeSlipEveryDays) => patch({ freeSlipEveryDays })}
          />
        </div>
      </section>
    </div>
  );
}

function ChecklistRewardsEditor({
  checklist,
  patch,
}: {
  checklist: ChecklistConfig | null;
  patch: (next: Partial<ChecklistConfig>) => void;
}) {
  if (!checklist) {
    return (
      <div className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-400">
        Could not load the fly economy config.
      </div>
    );
  }

  const tiers = checklist.tiers;
  const patchTier = (index: number, next: Partial<ChecklistTier>) =>
    patch({
      tiers: tiers.map((tier, i) => (i === index ? { ...tier, ...next } : tier)),
    });

  const bandLabel = (index: number) => {
    const from = tiers[index].minItems;
    const next = tiers[index + 1]?.minItems;
    if (!next) return `${from}+ items`;
    if (next - from === 1) return `${from} item${from === 1 ? '' : 's'}`;
    return `${from}–${next - 1} items`;
  };

  const previewLengths = [2, 3, 5, 7, 8, 12, 20];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Length bands</p>
            <p className="text-sm text-muted-foreground">
              Each marker pays one fly the moment it is passed, and partial
              credit is kept — pass a marker, keep the fly even if the list is
              never finished. Write a marker as <code>final</code>, a percentage
              like <code>50%</code>, or a plain item number like <code>3</code>.
              Payout is deliberately sub-linear: a 20-item checklist must never
              pay 20 flies, or every task becomes a checklist.
            </p>
          </div>
          <button
            onClick={() =>
              patch({
                tiers: FLY_ECONOMY_DEFAULTS.checklist.tiers.map((tier) => ({
                  ...tier,
                  markers: [...tier.markers],
                })),
              })
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[12px] font-black text-muted-foreground">
                <th className="px-2">Band</th>
                <th className="px-2">From items</th>
                <th className="px-2">Marker positions</th>
                <th className="px-2 text-right">Bonus flies</th>
                <th className="px-2" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, index) => (
                <tr key={`${tier.minItems}-${index}`} className="bg-muted/40">
                  <td className="rounded-l-xl px-3 py-2 text-[13px] font-black text-foreground">
                    {bandLabel(index)}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      value={tier.minItems}
                      onChange={(event) =>
                        patchTier(index, {
                          minItems: Number(event.target.value),
                        })
                      }
                      className={cn(inputClass, 'max-w-[90px]')}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={tier.markers.join(', ')}
                      placeholder="none"
                      onChange={(event) =>
                        patchTier(index, {
                          markers: event.target.value
                            .split(',')
                            .map((marker) => marker.trim())
                            .filter(Boolean),
                        })
                      }
                      className={cn(inputClass, 'min-w-[220px]')}
                    />
                  </td>
                  <td className="px-2 py-2 text-right text-sm font-black tabular-nums text-foreground">
                    +{tier.markers.length}
                  </td>
                  <td className="rounded-r-xl px-2 py-2 text-right">
                    <button
                      onClick={() =>
                        patch({ tiers: tiers.filter((_, i) => i !== index) })
                      }
                      disabled={tiers.length <= 1}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() =>
            patch({
              tiers: [
                ...tiers,
                {
                  minItems: (tiers[tiers.length - 1]?.minItems ?? 0) + 4,
                  markers: ['50%', 'final'],
                },
              ],
            })
          }
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add band
        </button>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Preview</p>
        <p className="mb-4 text-sm text-muted-foreground">
          Which boxes actually pay, at a few list lengths. The max task total
          adds the task&apos;s own fly on top.
        </p>
        <div className="space-y-2">
          {previewLengths.map((length) => {
            const indexes = checklistMarkerIndexes(length, tiers);
            return (
              <div
                key={length}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/40 px-3 py-2"
              >
                <span className="w-20 shrink-0 text-[13px] font-black text-muted-foreground">
                  {length} items
                </span>
                <span className="flex flex-wrap gap-1">
                  {Array.from({ length }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'grid h-6 w-6 place-items-center rounded-md text-[10px] font-black tabular-nums',
                        indexes.includes(i)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                  ))}
                </span>
                <span className="ml-auto text-xs font-black tabular-nums text-foreground">
                  +{indexes.length} flies · max task total {1 + indexes.length}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SocialRewardsEditor({
  economy,
  patchBuddy,
  patchPond,
}: {
  economy: FlyEconomyConfig | null;
  patchBuddy: (next: Partial<FlyEconomyConfig['buddy']>) => void;
  patchPond: (next: Partial<FlyEconomyConfig['friendsPond']>) => void;
}) {
  if (!economy) {
    return (
      <div className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-400">
        Could not load the fly economy config.
      </div>
    );
  }

  const { buddy, friendsPond: pond } = economy;
  const buddyDailyFlies = buddy.bonusFlies * buddy.dailyPayouts;
  const friendsToMax =
    pond.perFriendDailyCap > 0
      ? Math.ceil(pond.dailyCapFree / pond.perFriendDailyCap)
      : 0;
  const perFriendTask =
    pond.tasksPerGeneration > 0
      ? (pond.fliesPerGeneration / pond.tasksPerGeneration).toFixed(2)
      : '0';

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Buddy tasks</p>
            <p className="text-sm text-muted-foreground">
              Paid to both sides on the second completion of a shared day. Caps
              count PAYOUTS, not flies, so raising the bonus never quietly
              raises how many collusions a day is worth. Task-derived flies are
              never doubled by Plus.
            </p>
          </div>
          <button
            onClick={() => patchBuddy({ ...FLY_ECONOMY_DEFAULTS.buddy })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Bonus each"
            suffix="flies"
            min={0}
            max={100}
            value={buddy.bonusFlies}
            onChange={(bonusFlies) => patchBuddy({ bonusFlies })}
          />
          <NumberField
            label="Payouts per day"
            hint={`${buddyDailyFlies} flies a day at this bonus.`}
            min={0}
            max={50}
            value={buddy.dailyPayouts}
            onChange={(dailyPayouts) => patchBuddy({ dailyPayouts })}
          />
          <NumberField
            label="Per pair, per day"
            suffix="payouts"
            hint="Blocks the two-account farm."
            min={0}
            max={20}
            value={buddy.perPairDailyPayouts}
            onChange={(perPairDailyPayouts) =>
              patchBuddy({ perPairDailyPayouts })
            }
          />
          <NumberField
            label="Duo Week at"
            suffix="shared tasks"
            hint="With the SAME buddy, inside one week."
            min={0}
            max={50}
            value={buddy.duoWeekTasks}
            onChange={(duoWeekTasks) => patchBuddy({ duoWeekTasks })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-foreground">
              Duo Week gift item id
            </span>
            <input
              value={buddy.duoWeekGiftItemId}
              onChange={(event) =>
                patchBuddy({ duoWeekGiftItemId: event.target.value })
              }
              className={inputClass}
            />
            <span className="text-[11px] text-muted-foreground">
              Granted to both sides. 0 gifts a week disables it.
            </span>
          </label>
          <NumberField
            label="Duo Week gifts"
            suffix="per week"
            hint="Per user, across every pair."
            min={0}
            max={10}
            value={buddy.duoWeekPerWeek}
            onChange={(duoWeekPerWeek) => patchBuddy({ duoWeekPerWeek })}
          />
          <label className="flex items-start gap-3 rounded-xl border border-border/40 bg-background/60 p-3 sm:col-span-2 lg:col-span-3">
            <input
              type="checkbox"
              checked={buddy.countsTowardTaskIncome}
              onChange={(event) =>
                patchBuddy({ countsTowardTaskIncome: event.target.checked })
              }
              className="mt-1 h-4 w-4"
            />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-foreground">
                Count buddy flies inside the daily task-income cap
              </span>
              <span className="block text-[11px] text-muted-foreground">
                On: base, streak uplift, checklist markers and buddy bonuses
                share one {economy.taskIncome.dailyCapFree}/day wall. Off
                (default): buddy flies sit outside it with only their own
                payout caps.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">
              The friends&apos; pond
            </p>
            <p className="text-sm text-muted-foreground">
              Your friends&apos; work generates flies you can claim. Not a
              transfer — they lose nothing — so it never creates a reason to
              resent a productive friend. Generation is driven by their task
              count, so their streak and Plus status stay out of your wallet.
            </p>
          </div>
          <button
            onClick={() => patchPond({ ...FLY_ECONOMY_DEFAULTS.friendsPond })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Every N friend tasks"
            hint={`${perFriendTask} flies per friend-task.`}
            min={1}
            max={100}
            value={pond.tasksPerGeneration}
            onChange={(tasksPerGeneration) =>
              patchPond({ tasksPerGeneration })
            }
          />
          <NumberField
            label="...generates"
            suffix="flies"
            min={0}
            max={100}
            value={pond.fliesPerGeneration}
            onChange={(fliesPerGeneration) => patchPond({ fliesPerGeneration })}
          />
          <NumberField
            label="Claim gate"
            suffix="own tasks"
            hint="Turns a social pull into self-activation. 0 opens the pond always."
            min={0}
            max={50}
            value={pond.claimGateTasks}
            onChange={(claimGateTasks) => patchPond({ claimGateTasks })}
          />
          <NumberField
            label="Per friend, per day"
            suffix="flies"
            hint={
              friendsToMax
                ? `Forces breadth: ${friendsToMax}+ active friends to max out.`
                : undefined
            }
            min={0}
            max={100}
            value={pond.perFriendDailyCap}
            onChange={(perFriendDailyCap) => patchPond({ perFriendDailyCap })}
          />
          <NumberField
            label="Daily cap — free"
            suffix="flies"
            min={0}
            max={500}
            value={pond.dailyCapFree}
            onChange={(dailyCapFree) => patchPond({ dailyCapFree })}
          />
          <NumberField
            label="Daily cap — Plus"
            suffix="flies"
            min={0}
            max={500}
            value={pond.dailyCapPlus}
            onChange={(dailyCapPlus) => patchPond({ dailyCapPlus })}
          />
          <NumberField
            label="Expiry"
            suffix="hours"
            hint="Unclaimed flies vanish; prevents hoarding a month into one purchase."
            min={1}
            max={336}
            value={pond.expiryHours}
            onChange={(expiryHours) => patchPond({ expiryHours })}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">
          Weekly social bonus
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Rewards a real friend list over one alt account: claim from several
          different friends, on several different days.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Different friends"
            min={0}
            max={50}
            value={pond.weeklyBonusFriends}
            onChange={(weeklyBonusFriends) => patchPond({ weeklyBonusFriends })}
          />
          <NumberField
            label="Different days"
            hint="0 days disables the bonus."
            min={0}
            max={7}
            value={pond.weeklyBonusDays}
            onChange={(weeklyBonusDays) => patchPond({ weeklyBonusDays })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-foreground">
              Gift item id
            </span>
            <input
              value={pond.weeklyBonusGiftItemId}
              onChange={(event) =>
                patchPond({ weeklyBonusGiftItemId: event.target.value })
              }
              className={inputClass}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
