'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Crown, Sparkles } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { backgroundPreview } from '@/hooks/useBackgroundActions';
import type { BackgroundItem } from '@/hooks/useBackgrounds';
import {
  RARITY_ORDER,
  isTradeOnlyRarity,
  type ItemDef,
  type Rarity,
  type WardrobeSlot,
} from '@/lib/skins/catalog';
import { hapticSelect, hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { FilterBar } from './FilterBar';
import { SlideSwap } from './SlideSwap';
import {
  BAR_TONE,
  BackgroundArt,
  ItemArt,
  ShelfHeader,
  TileArt,
  buildClosetEntries,
  entryId,
  entryName,
  entryRarity,
  entrySlotRank,
  isEntryEquipped,
  useShelfGrid,
  type ClosetEntry,
  type ClosetSlot,
} from './DressingRoom';

const ALBUM_FILTERS: { id: ClosetSlot; label: string; icon: ReactNode }[] = [
  { id: 'all', label: 'All', icon: <Icon name="closetAll" /> },
  { id: 'skin', label: 'Skins', icon: <Icon name="closetSkins" /> },
  { id: 'hat', label: 'Hats', icon: <Icon name="closetHats" /> },
  { id: 'body', label: 'Body', icon: <Icon name="wardrobe" /> },
  { id: 'hand_item', label: 'Held', icon: <Icon name="closetHeld" /> },
  {
    id: 'background',
    label: 'Backgrounds',
    icon: <Icon name="closetBackgrounds" />,
  },
];

function entryKey(entry: ClosetEntry) {
  return `${entry.kind}:${entryId(entry)}`;
}

const ALBUM_ORDER = ALBUM_FILTERS.map((filter) => filter.id);

const EMPTY_NOUN: Record<ClosetSlot, string> = {
  all: 'item',
  skin: 'skin',
  hat: 'hat',
  body: 'body item',
  hand_item: 'held item',
  background: 'background',
};

type Source = { label: string; icon: 'store' | 'closetGifts' | 'trade' };

const SHOP_SOURCE: Source = { label: 'Shop', icon: 'store' };
const SPECIAL_SOURCE: Source = { label: 'Special collection', icon: 'store' };
const GIFT_SOURCE: Source = { label: 'Gifts', icon: 'closetGifts' };
const TRADE_SOURCE: Source = { label: 'Trade Up', icon: 'trade' };

function entrySources(entry: ClosetEntry, everydayIds?: ReadonlySet<string>): Source[] {
  if (isTradeOnlyRarity(entryRarity(entry))) return [TRADE_SOURCE, GIFT_SOURCE];
  if (entry.price > 0) {
    const special = entry.kind === 'item' && !!everydayIds?.size && !everydayIds.has(entry.item.id);
    return [special ? SPECIAL_SOURCE : SHOP_SOURCE, GIFT_SOURCE, TRADE_SOURCE];
  }
  return [GIFT_SOURCE, TRADE_SOURCE];
}

function AlbumTile({
  entry,
  equipped,
  selected,
  onTap,
}: {
  entry: ClosetEntry;
  equipped: boolean;
  selected: boolean;
  onTap: () => void;
}) {
  const rarity = entryRarity(entry);
  const owned = entry.owned > 0;
  const name = entryName(entry);
  const faded = !owned && !selected;
  const art =
    entry.kind === 'item' ? (
      <ItemArt item={entry.item} faded={faded} />
    ) : owned ? (
      <BackgroundArt bg={entry.bg} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={backgroundPreview(entry.bg)}
        alt=""
        draggable={false}
        loading="lazy"
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-[filter,opacity] duration-300',
          faded && 'opacity-50 grayscale dark:opacity-40',
        )}
      />
    );
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}, ${RARITY_CONFIG[rarity].label}, ${owned ? 'collected' : 'not collected yet'}`}
      aria-pressed={selected}
      className="block w-full group"
    >
      <TileArt
        rarity={rarity}
        tone="closet"
        className={cn(
          'transition-transform duration-150 group-active:scale-95',
          selected
            ? 'ring-2 ring-foreground/80'
            : equipped && 'ring-2 ring-primary',
        )}
      >
        {art}
        {equipped && (
          <span className="absolute grid w-5 h-5 rounded-full shadow-sm right-1 top-1 place-items-center bg-primary text-primary-foreground">
            <Check className="w-3 h-3" strokeWidth={4} />
          </span>
        )}
      </TileArt>
    </button>
  );
}

export function ClosetAlbum({
  open,
  initialSlot,
  catalog,
  backgrounds,
  inventory,
  bgInventory,
  equipped,
  equippedBgId,
  onClose,
  onWear,
  onSeeInShop,
  onTradeUp,
  title = 'Album',
  shopActionLabel = 'See in Shop',
  everydayIds,
  buyableIds,
}: {
  open: boolean;
  initialSlot: ClosetSlot;
  catalog: ItemDef[];
  backgrounds: BackgroundItem[];
  inventory: Record<string, number>;
  bgInventory: Record<string, number>;
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  equippedBgId: string | null;
  onClose: () => void;
  onWear: (entry: ClosetEntry) => void;
  onSeeInShop: (entry: ClosetEntry) => void;
  onTradeUp: () => void;
  title?: string;
  shopActionLabel?: string;
  everydayIds?: ReadonlySet<string>;
  buyableIds?: ReadonlySet<string>;
}) {
  const { gridClass } = useShelfGrid();
  const inShopToday = (entry: ClosetEntry) =>
    entry.kind !== 'item' || !buyableIds || buyableIds.has(entry.item.id);
  const [slot, setSlot] = useState<ClosetSlot>(initialSlot);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSlot(initialSlot);
    setSelectedKey(null);
  }, [open, initialSlot]);

  const entries = useMemo(
    () =>
      buildClosetEntries(
        slot,
        catalog,
        backgrounds,
        inventory,
        bgInventory,
        new Map(),
      ),
    [slot, catalog, backgrounds, inventory, bgInventory],
  );
  const total = useMemo(() => {
    const all = buildClosetEntries(
      'all',
      catalog,
      backgrounds,
      inventory,
      bgInventory,
      new Map(),
    );
    return {
      owned: all.filter((entry) => entry.owned > 0).length,
      count: all.length,
    };
  }, [catalog, backgrounds, inventory, bgInventory]);
  const sections = useMemo(
    () =>
      (RARITY_ORDER as readonly Rarity[])
        .map((rarity) => {
          const list = entries
            .filter((entry) => entryRarity(entry) === rarity)
            .sort(
              (a, b) =>
                entrySlotRank(a) - entrySlotRank(b) ||
                entryName(a).localeCompare(entryName(b)),
            );
          return {
            rarity,
            list,
            owned: list.filter((entry) => entry.owned > 0).length,
          };
        })
        .filter(
          (section) =>
            section.list.length > 0 || section.rarity === 'legendary',
        ),
    [entries],
  );
  const selected = selectedKey
    ? (entries.find((entry) => entryKey(entry) === selectedKey) ?? null)
    : null;
  const selectedRarity = selected ? entryRarity(selected) : null;
  const selectedWorn = selected
    ? isEntryEquipped(selected, equipped, equippedBgId)
    : false;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      className="h-[88dvh] select-none sm:h-[84dvh] sm:max-w-[640px]"
      zIndex={1150}
      closeAriaLabel={`Close ${title.toLowerCase()}`}
    >
      {({ bindScroll }) => (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-5 pt-3 pb-1 shrink-0 sm:px-6 sm:pt-6">
            <div className="flex items-center gap-2 pr-12 sm:pr-14">
              <Icon name="closetAlbum" className="h-7 w-7 shrink-0" />
              <h2 className="text-xl font-black tracking-tight text-foreground">
                {title}
              </h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-black tabular-nums text-muted-foreground">
                {total.owned}/{total.count}
              </span>
            </div>
            <div className="mt-3">
              <FilterBar
                active={slot}
                onChange={(next: ClosetSlot) => {
                  if (next !== slot) hapticSelect();
                  setSlot(next);
                  setSelectedKey(null);
                }}
                options={ALBUM_FILTERS}
                compact
                centerActiveOnMount
              />
            </div>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 sm:px-6 sm:pb-6"
          >
            <SlideSwap id={slot} order={ALBUM_ORDER}>
              <div className="flex flex-col gap-5">
                {sections.map((section) => (
                  <section
                    key={section.rarity}
                    aria-label={RARITY_CONFIG[section.rarity].label}
                  >
                    <ShelfHeader
                      icon={
                        section.rarity === 'legendary' ? (
                          <Crown
                            className="h-3.5 w-3.5"
                            strokeWidth={2.5}
                            fill="currentColor"
                          />
                        ) : section.rarity === 'epic' ? (
                          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.75} />
                        ) : undefined
                      }
                      label={RARITY_CONFIG[section.rarity].label}
                      tone={RARITY_CONFIG[section.rarity].text}
                      meta={
                        <span>
                          {section.owned}
                          <span className="opacity-60">
                            /{section.list.length}
                          </span>
                        </span>
                      }
                      progress={
                        section.list.length
                          ? section.owned / section.list.length
                          : 0
                      }
                      barTone={BAR_TONE[section.rarity]}
                    />
                    <div className={gridClass}>
                      {section.list.length === 0 && (
                        <>
                          <TileArt rarity="legendary" tone="closet">
                            <span className="absolute inset-0 grid place-items-center text-amber-500/70 dark:text-amber-300/70">
                              <Crown
                                className="h-7 w-7"
                                strokeWidth={2.25}
                                fill="currentColor"
                              />
                            </span>
                          </TileArt>
                          <p
                            className="self-center pl-1 text-[13px] font-bold leading-snug text-muted-foreground"
                            style={{ gridColumn: '2 / -1' }}
                          >
                            No legendary {EMPTY_NOUN[slot]} yet
                          </p>
                        </>
                      )}
                      {section.list.map((entry) => {
                        const key = entryKey(entry);
                        return (
                          <AlbumTile
                            key={key}
                            entry={entry}
                            equipped={isEntryEquipped(
                              entry,
                              equipped,
                              equippedBgId,
                            )}
                            selected={selectedKey === key}
                            onTap={() => {
                              hapticTick();
                              setSelectedKey((prev) =>
                                prev === key ? null : key,
                              );
                            }}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </SlideSwap>
          </div>

          {selected && selectedRarity && (
            <div className="shrink-0 border-t border-border/60 bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:px-6 sm:pb-5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[16px] font-black leading-tight text-foreground">
                      {entryName(selected)}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black leading-none',
                        RARITY_CONFIG[selectedRarity].bg,
                        RARITY_CONFIG[selectedRarity].text,
                      )}
                    >
                      {RARITY_CONFIG[selectedRarity].label}
                    </span>
                  </span>
                  {selected.owned > 0 ? (
                    <span className="mt-1.5 flex items-center gap-1 text-[12.5px] font-extrabold text-primary">
                      <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                      In your closet
                    </span>
                  ) : (
                    <span className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="mr-0.5 text-[12px] font-bold text-muted-foreground">
                        Get it from
                      </span>
                      {entrySources(selected, everydayIds).map((source) => (
                        <span
                          key={source.label}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-[3px] text-[11.5px] font-extrabold leading-none text-foreground/80"
                        >
                          <Icon name={source.icon} className="h-3.5 w-3.5" />
                          {source.label}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {selected.owned > 0 ? (
                  <button
                    type="button"
                    disabled={selectedWorn}
                    onClick={() => onWear(selected)}
                    className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-[#447d3f] px-4 text-[14px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none disabled:bg-primary/10 disabled:text-primary disabled:shadow-none"
                  >
                    {selectedWorn && (
                      <Check className="w-4 h-4" strokeWidth={3.5} />
                    )}
                    {selectedWorn ? 'Wearing' : 'Wear'}
                  </button>
                ) : isTradeOnlyRarity(selectedRarity) ? (
                  <button
                    type="button"
                    onClick={onTradeUp}
                    className="flex h-11 shrink-0 items-center rounded-2xl bg-amber-400 px-4 text-[14px] font-black text-amber-950 shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
                  >
                    Trade up
                  </button>
                ) : selected.price > 0 && inShopToday(selected) ? (
                  <button
                    type="button"
                    onClick={() => onSeeInShop(selected)}
                    className="flex h-11 shrink-0 items-center rounded-2xl bg-[#447d3f] px-4 text-[14px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
                  >
                    {shopActionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </BaseSheet>
  );
}
