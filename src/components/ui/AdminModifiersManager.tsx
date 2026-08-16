'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Repeat,
  RotateCcw,
  Save,
  Sliders,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_TRADE_MODIFIERS,
  quoteTradeFuel,
  type TradeModifiers,
  type TradeRecipe,
} from '@/lib/skins/tradeModifiers';
import { RARITY_ORDER, rarityRank, type Rarity } from '@/lib/skins/catalog';

type View = 'home' | 'trade';

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
        <p className="mt-1 text-xs font-black uppercase tracking-wider text-primary">
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/trade-modifiers', {
          credentials: 'include',
        });
        const payload = await res.json();
        if (res.ok) setConfig(payload.config);
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
              ) : (
                <Sliders className="h-7 w-7" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                {view === 'trade' ? 'Trade modifiers' : 'Modifiers'}
              </h1>
              <p className="text-sm font-medium text-muted-foreground">
                {view === 'trade'
                  ? 'Recipe ratios, fuel, aim prices and the draw rules behind every trade-up.'
                  : 'The tunable rules behind the economy loops.'}
              </p>
            </div>
          </div>
          {view === 'trade' && (
            <button
              onClick={save}
              disabled={saving || !config}
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
          </div>
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
                    <tr className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
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
                        <td className="rounded-l-xl px-3 py-2 text-xs font-black uppercase tracking-wider text-foreground">
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
