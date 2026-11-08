import type { Rarity } from '@/lib/skins/catalog';

export const SHOP_CUBBY: Record<Rarity, string> = {
  common: 'bg-[color:var(--shop-cubby)]',
  uncommon: 'bg-[color:var(--shop-cubby)]',
  rare: 'bg-[color:var(--shop-cubby)]',
  epic: 'bg-[color:var(--shop-cubby-epic)]',
  legendary: 'closet-foil closet-foil-gold bg-[color:var(--shop-cubby-legendary)]',
};

export const SHOP_GEM: Record<Rarity, string> = {
  common: 'shop-gem-common',
  uncommon: 'shop-gem bg-emerald-500',
  rare: 'shop-gem bg-sky-500',
  epic: 'shop-gem bg-violet-500',
  legendary: 'shop-gem bg-gradient-to-br from-amber-300 to-amber-500',
};

export const SHOP_PLANK =
  'pointer-events-none absolute h-[11px] rounded-[5px] bg-[color:var(--shop-shelf)] shadow-[0_4px_0_0_var(--shop-shelf-edge)]';

export const SHOP_TAG =
  'inline-flex items-center whitespace-nowrap rounded-[8px] bg-[color:var(--shop-tag)] font-black leading-none text-foreground shadow-[0_2px_0_0_var(--shop-tag-edge)] ring-1 ring-[color:var(--shop-tag-edge)]';
