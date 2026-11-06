'use client';

import React from 'react';
import { Crown, Store } from 'lucide-react';
import {
  AdminCard,
  AdminPage,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  ResetLink,
  SaveBar,
  ToggleRow,
} from '@/components/admin/kit';
import { useAdminConfig, useSaveAll } from '@/components/admin/useAdminConfig';
import { useEconomy } from '@/components/admin/useEconomy';
import { RARITY_STYLE } from '@/components/admin/economy/rarity';
import { DEFAULT_SHOP_SALES, SHOP_TIERS, type ShopSalesConfig } from '@/lib/skins/shopSales';
import {
  SHOP_GIFT_FIRST_FLIES,
  SHOP_GIFT_FLOOR_FROM_BALANCE,
  SHOP_GIFT_FULL_BELOW_BALANCE,
  SHOP_GIFT_MAX_FLIES,
  SHOP_GIFT_MIN_FLIES,
} from '@/lib/economy/shopGift';
import type { Rarity } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';

export function ShopPage() {
  const shop = useAdminConfig<ShopSalesConfig>({
    url: '/api/admin/shop-sales',
    read: (payload) => payload?.config,
  });
  const economy = useEconomy();
  const all = useSaveAll([shop, economy]);
  const config = shop.config;
  const gift = economy.config?.shopGift;

  const toggleEveryday = (rarity: Rarity) =>
    shop.set((prev) => ({
      ...prev,
      everydayRarities: prev.everydayRarities.includes(rarity)
        ? prev.everydayRarities.filter((entry) => entry !== rarity)
        : [...prev.everydayRarities, rarity],
    }));

  const setAdRefreshes = (adRerolls: number) => {
    shop.patch({ adRerolls });
    economy.patchGroup('rewardedAds', { shopRerollPerDay: adRerolls });
  };

  return (
    <AdminPage
      title="Shop"
      subtitle="What is on the shelf each day, the Plus sale, refreshes, and the free daily gift."
      icon={<Store />}
      actions={
        <ResetLink
          onClick={() =>
            shop.set(() => ({ ...DEFAULT_SHOP_SALES, everydayRarities: [...DEFAULT_SHOP_SALES.everydayRarities] }))
          }
        >
          Load defaults
        </ResetLink>
      }
    >
      <ConfigShell loading={shop.loading || economy.loading} error={all.error}>
        {config ? (
          <div className="space-y-5">
            <AdminCard
              title="Today's shelf"
              subtitle={`Rolls over at ${String(config.refreshHour).padStart(2, '0')}:00 in each player's own time. The crown is the Plus sale, the heart the wishlist slot.`}
            >
              <div className="space-y-4">
                <ShelfRow label="Special · everyone" note={`${config.specialEpicPercent}% epic, the rest rare`}>
                  {Array.from({ length: config.freeSlots }).map((_, index) => {
                    const sale = index === 0;
                    const wish = config.wishlistSlot && index === 1;
                    return (
                      <SlotTile
                        key={index}
                        title={sale ? `Plus sale · ${config.saleDiscountPercent}% off for Plus` : wish ? 'Wishlist slot' : undefined}
                        className={cn(
                          'border-primary/40 bg-primary/10 text-primary',
                          sale && 'border-amber-400 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                          wish && 'border-rose-400 bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300',
                        )}
                      >
                        {sale ? <Crown className="h-4 w-4" /> : wish ? '♥' : null}
                      </SlotTile>
                    );
                  })}
                </ShelfRow>
                <ShelfRow label="Special · Plus only" note={`${config.plusEpicPercent}% epic, the rest rare`}>
                  {config.plusSlots === 0 ? (
                    <span className="text-[12px] font-bold text-muted-foreground">None</span>
                  ) : (
                    Array.from({ length: config.plusSlots }).map((_, index) => (
                      <SlotTile key={index} className="border-violet-400/60 bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
                    ))
                  )}
                </ShelfRow>
                <ShelfRow
                  label="Everyday · always on"
                  note={`${config.everydayRarities.map((rarity) => RARITY_STYLE[rarity].label).join(' + ') || 'Nothing'}${config.everydayRarePercent ? ` + ${config.everydayRarePercent}% of rares` : ''}`}
                >
                  {config.everydayRarities.map((rarity) => (
                    <span key={rarity} className={cn('rounded-full border px-2.5 py-1 text-[12px] font-black', RARITY_STYLE[rarity].chip)}>
                      {RARITY_STYLE[rarity].label}
                    </span>
                  ))}
                </ShelfRow>
              </div>
            </AdminCard>

            <div className="grid gap-5 lg:grid-cols-2">
              <AdminCard
                title="Everyday collection"
                subtitle="Always in the shop. Legendaries are trade-only."
                icon={<span className="text-[20px]">🧺</span>}
              >
                <div className="space-y-4">
                  <Field label="Rarities">
                    <div className="flex flex-wrap gap-2">
                      {SHOP_TIERS.map((rarity) => {
                        const on = config.everydayRarities.includes(rarity);
                        return (
                          <button
                            key={rarity}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleEveryday(rarity)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-[12px] font-black transition',
                              on ? RARITY_STYLE[rarity].chip : 'border-border bg-background text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {RARITY_STYLE[rarity].label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Share of rares that are always on" hint="Picked by item, so Everyday has a few pricier pieces.">
                    <NumberInput
                      value={config.everydayRarePercent}
                      max={100}
                      suffix="%"
                      onChange={(everydayRarePercent) => shop.patch({ everydayRarePercent })}
                    />
                  </Field>
                </div>
              </AdminCard>

              <AdminCard
                title="Special collection"
                subtitle="Rotates daily. Free players can buy from their slots; Plus from all of them."
                icon={<span className="text-[20px]">✨</span>}
                tone="grape"
              >
                <div className="space-y-4">
                  <FieldGrid cols={2}>
                    <Field label="Slots for everyone">
                      <NumberInput value={config.freeSlots} min={1} max={12} onChange={(freeSlots) => shop.patch({ freeSlots })} />
                    </Field>
                    <Field label="Extra Plus slots">
                      <NumberInput value={config.plusSlots} max={12} onChange={(plusSlots) => shop.patch({ plusSlots })} />
                    </Field>
                    <Field label="Epic chance · everyone">
                      <NumberInput value={config.specialEpicPercent} max={100} suffix="%" onChange={(specialEpicPercent) => shop.patch({ specialEpicPercent })} />
                    </Field>
                    <Field label="Epic chance · Plus">
                      <NumberInput value={config.plusEpicPercent} max={100} suffix="%" onChange={(plusEpicPercent) => shop.patch({ plusEpicPercent })} />
                    </Field>
                  </FieldGrid>
                  <ToggleRow
                    title="Wishlist slot"
                    description="Saves one slot for an item the player wishlisted."
                    checked={config.wishlistSlot}
                    onChange={(wishlistSlot) => shop.patch({ wishlistSlot })}
                  />
                </div>
              </AdminCard>
            </div>

            <AdminCard
              title="Plus sale and refreshes"
              subtitle="The sale item sits in the first Special slot and only Plus gets the price. Refreshes swap the Special collection early."
              icon={<span className="text-[20px]">🔁</span>}
              tone="sun"
            >
              <FieldGrid cols={4}>
                <Field label="Plus sale discount">
                  <NumberInput value={config.saleDiscountPercent} max={90} suffix="%" onChange={(saleDiscountPercent) => shop.patch({ saleDiscountPercent })} />
                </Field>
                <Field label="Free refreshes a day">
                  <NumberInput value={config.freeRerolls} max={10} onChange={(freeRerolls) => shop.patch({ freeRerolls })} />
                </Field>
                <Field label="Extra refreshes by ad" hint="Free players, after the free ones.">
                  <NumberInput value={config.adRerolls} max={10} onChange={setAdRefreshes} />
                </Field>
                <Field label="Plus refreshes a day">
                  <NumberInput value={config.plusRefreshes} max={10} onChange={(plusRefreshes) => shop.patch({ plusRefreshes })} />
                </Field>
                <Field label="Shelf rolls over at" hint="The player's local hour.">
                  <NumberInput value={config.refreshHour} max={23} suffix=":00" onChange={(refreshHour) => shop.patch({ refreshHour })} />
                </Field>
              </FieldGrid>
            </AdminCard>

            {gift ? (
              <AdminCard
                title="Daily shop gift"
                subtitle={`Free flies the first time a player opens the shop each day. ${SHOP_GIFT_MAX_FLIES} flies at ${SHOP_GIFT_FULL_BELOW_BALANCE} or fewer, sliding to ${SHOP_GIFT_MIN_FLIES} from ${SHOP_GIFT_FLOOR_FROM_BALANCE.toLocaleString()}. The very first visit pays ${SHOP_GIFT_FIRST_FLIES}.`}
                icon={<span className="text-[20px]">🎁</span>}
                tone="berry"
              >
                <div className="space-y-5">
                  <ToggleRow
                    title="Gift is on"
                    checked={gift.enabled}
                    onChange={(enabled) => economy.patchGroup('shopGift', { enabled })}
                  />
                  <div className={cn('transition', !gift.enabled && 'pointer-events-none opacity-40')}>
                    <FieldGrid cols={3}>
                      <Field label="Lucky chance">
                        <NumberInput value={gift.luckyChancePercent} max={100} suffix="%" onChange={(luckyChancePercent) => economy.patchGroup('shopGift', { luckyChancePercent })} />
                      </Field>
                      <Field label="Lucky gift pays">
                        <NumberInput value={gift.luckyMultiplier} min={1} max={5} suffix="×" onChange={(luckyMultiplier) => economy.patchGroup('shopGift', { luckyMultiplier })} />
                      </Field>
                      <Field label="Plus gift pays">
                        <NumberInput value={gift.plusMultiplier} min={1} max={5} suffix="×" onChange={(plusMultiplier) => economy.patchGroup('shopGift', { plusMultiplier })} />
                      </Field>
                    </FieldGrid>
                  </div>
                </div>
              </AdminCard>
            ) : null}
          </div>
        ) : null}
      </ConfigShell>
      <SaveBar
        dirty={all.dirty}
        saving={all.saving}
        onSave={() => void all.save()}
        onDiscard={all.discard}
        label="Shop has unsaved changes"
      />
    </AdminPage>
  );
}

function ShelfRow({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
      <div>
        <p className="text-[13px] font-black">{label}</p>
        <p className="text-[11px] font-bold text-muted-foreground">{note}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function SlotTile({ className, children, title }: { className?: string; children?: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('flex h-9 w-9 items-center justify-center rounded-xl border-2 text-[13px] font-black', className)}>
      {children}
    </span>
  );
}
