'use client';

import React from 'react';
import { ArrowRight, Repeat } from 'lucide-react';
import {
  AdminCard,
  AdminPage,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  ResetLink,
  SaveBar,
} from '@/components/admin/kit';
import { useAdminConfig } from '@/components/admin/useAdminConfig';
import { RARITY_STYLE } from '@/components/admin/economy/rarity';
import { DEFAULT_TRADE_MODIFIERS, type TradeModifiers, type TradeRecipe } from '@/lib/skins/tradeModifiers';
import { cn } from '@/lib/utils';

export function TradePage() {
  const trade = useAdminConfig<TradeModifiers>({
    url: '/api/admin/trade-modifiers',
    read: (payload) => payload?.config,
  });
  const config = trade.config;

  const patchRecipe = (from: TradeRecipe['from'], itemCount: number) =>
    trade.set((prev) => ({
      ...prev,
      recipes: prev.recipes.map((recipe) => (recipe.from === from ? { ...recipe, itemCount } : recipe)),
    }));

  return (
    <AdminPage
      title="Trade-ups"
      subtitle="Spare items in, one item of the next rarity out. Always something the player doesn't own yet."
      icon={<Repeat />}
      actions={<ResetLink onClick={() => trade.set(() => DEFAULT_TRADE_MODIFIERS)}>Load defaults</ResetLink>}
    >
      <ConfigShell loading={trade.loading} error={trade.error}>
        {config ? (
          <div className="space-y-5">
            <AdminCard
              title="The ladder"
              subtitle="How many items of one rarity a trade takes. Legendaries only come from trades."
              icon={<span className="text-[20px]">🪜</span>}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {config.recipes.map((recipe) => (
                  <div key={recipe.from} className="flex items-center gap-3 rounded-2xl bg-muted/45 p-3">
                    <div className="w-[88px] shrink-0">
                      <NumberInput
                        value={recipe.itemCount}
                        min={2}
                        max={12}
                        suffix="×"
                        onChange={(next) => patchRecipe(recipe.from, next)}
                      />
                    </div>
                    <span className={cn('rounded-full border px-2.5 py-1 text-[12px] font-black', RARITY_STYLE[recipe.from].chip)}>
                      {RARITY_STYLE[recipe.from].label}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className={cn('rounded-full border px-2.5 py-1 text-[12px] font-black', RARITY_STYLE[recipe.to].chip)}>
                      1 {RARITY_STYLE[recipe.to].label}
                    </span>
                  </div>
                ))}
              </div>
            </AdminCard>

            <div className="grid gap-5 lg:grid-cols-2">
              <AdminCard
                title="Golden trades"
                subtitle="Now and then a trade pays out more than one item."
                icon={<span className="text-[20px]">🌟</span>}
                tone="sun"
              >
                <FieldGrid cols={2}>
                  <Field label="Chance">
                    <NumberInput
                      value={config.goldenTradeChancePercent}
                      max={100}
                      suffix="%"
                      onChange={(goldenTradeChancePercent) => trade.patch({ goldenTradeChancePercent })}
                    />
                  </Field>
                  <Field label="Items it pays">
                    <NumberInput
                      value={config.goldenTradeRewardCount}
                      min={1}
                      max={5}
                      onChange={(goldenTradeRewardCount) => trade.patch({ goldenTradeRewardCount })}
                    />
                  </Field>
                </FieldGrid>
              </AdminCard>

              <AdminCard
                title="Wishlist"
                subtitle="Hearted items a trade aims for. 100% makes a wishlisted item a sure thing."
                icon={<span className="text-[20px]">💗</span>}
                tone="berry"
              >
                <FieldGrid cols={3}>
                  <Field label="Aim for wishlist">
                    <NumberInput
                      value={config.wishlistRedirectPercent}
                      max={100}
                      suffix="%"
                      onChange={(wishlistRedirectPercent) => trade.patch({ wishlistRedirectPercent })}
                    />
                  </Field>
                  <Field label="Slots · free">
                    <NumberInput
                      value={config.wishlistSlotsFree}
                      min={1}
                      max={50}
                      onChange={(wishlistSlotsFree) => trade.patch({ wishlistSlotsFree })}
                    />
                  </Field>
                  <Field label="Slots · Plus">
                    <NumberInput
                      value={config.wishlistSlotsPlus}
                      min={1}
                      max={50}
                      onChange={(wishlistSlotsPlus) => trade.patch({ wishlistSlotsPlus })}
                    />
                  </Field>
                </FieldGrid>
              </AdminCard>
            </div>
          </div>
        ) : null}
      </ConfigShell>
      <SaveBar
        dirty={trade.dirty}
        saving={trade.saving}
        onSave={() => void trade.save()}
        onDiscard={trade.discard}
        label="Trade-ups have unsaved changes"
      />
    </AdminPage>
  );
}
