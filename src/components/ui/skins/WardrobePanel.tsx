import { useInventory } from '@/hooks/useInventory';
import { useMemo, useState, useEffect } from 'react';
import React from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lock, Shirt, X, ArrowLeft, ShoppingBag, Repeat } from 'lucide-react';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import { rarityRank } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import { ItemCard } from './ItemCard';
import { FilterBar, FilterCategory } from './FilterBar';
import { SortMenu, SortOrder } from './SortMenu';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { BaseSheet } from '@/components/ui/BaseSheet';

import { TradePanel } from './TradePanel';
import GiftBoxOpening from '@/components/ui/gift-box/GiftBoxOpening';
import { SellConfirmationDialog } from './SellConfirmationDialog';

/* ---------------- Types & Data ---------------- */
type ApiData = {
  wardrobe: {
    equipped: Partial<Record<WardrobeSlot, string | null>>;
    inventory: Record<string, number>;
    unseenItems?: string[];
    flies: number;
  };
  catalog: ItemDef[];
};

/* ---------------- Main Panel ---------------- */
export function WardrobePanel({
  open,
  onOpenChange,
  defaultTab = 'inventory',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTab?: 'inventory' | 'shop' | 'trade';
}) {
  const { user } = useAuth();
  const {
    data,
    mutate,
    unseenItems,
    unseenContainers,
    markItemSeen,
    markAllSeen,
  } =
    useInventory(); // Always active

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [visitedCategories, setVisitedCategories] = useState<
    Set<FilterCategory>
  >(new Set<FilterCategory>(['all']));
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [confirmingBuyId, setConfirmingBuyId] = useState<string | null>(null);
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOrder>('rarity_desc');
  const [notif, setNotif] = useState<{
    msg: string;
    type: 'error' | 'success';
  } | null>(null);
  const [shakeBalance, setShakeBalance] = useState(false);
  const [openingGiftId, setOpeningGiftId] = useState<string | null>(null);

  // --- Sell Dialog Logic ---
  const [itemToSell, setItemToSell] = useState<ItemDef | null>(null);

  const unseenInventorySet = useMemo(
    () => new Set(data?.wardrobe?.unseenItems ?? []),
    [data?.wardrobe?.unseenItems],
  );

  const confirmSell = (amount: number) => {
    if (itemToSell) {
      sellItem(itemToSell, amount);
      setItemToSell(null);
    }
  };

  // Re-added sellItem
  const sellItem = async (item: ItemDef, qty: number = 1) => {
    if (!user || !data?.wardrobe) return;

    const currentCount = data.wardrobe.inventory[item.id] ?? 0;
    const refund = Math.floor((item.priceFlies ?? 0) / 2);
    // Refund for this batch
    const totalRefund = refund * qty;

    const newBalance = (data.wardrobe.flies ?? 0) + totalRefund;

    if (currentCount < qty) return;

    // Optimistic
    const newData: ApiData = {
      ...data,
      wardrobe: {
        ...data.wardrobe,
        flies: newBalance,
        inventory: {
          ...data.wardrobe.inventory,
          [item.id]: Math.max(0, currentCount - qty),
        },
      },
    };
    mutate(newData, false);

    // setActionId(item.id); // Removed
    try {
      const res = await fetch('/api/skins/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, amount: qty }),
      });

      if (res.ok) {
        setNotif({ msg: `Sold ${qty}x ${item.name}!`, type: 'success' });
        mutate();
      } else {
        throw new Error('Failed');
      }
    } catch (e) {
      setNotif({ msg: 'Sell failed.', type: 'error' });
      mutate();
    } finally {
      // setActionId(null); // Removed
    }
  };

  // Handle Mark Seen on Close
  const prevOpen = React.useRef(open);
  useEffect(() => {
    if (prevOpen.current && !open) {
      markAllSeen();
    }
    prevOpen.current = open;
  }, [open, markAllSeen]);

  // Removed Handle Mark Seen on Tab Change to improve performance when switching away from inventory

  // Filter change handler to mark category as visited
  const handleFilterChange = (cat: FilterCategory) => {
    setActiveFilter(cat);
    setVisitedCategories((prev) => new Set(prev).add(cat));
  };

  // Compute Badges
  const filterBadges = useMemo(() => {
    const unseenCatalogIds = [...unseenItems, ...unseenContainers];
    if (!data || !unseenCatalogIds.length) return {};
    const counts: Partial<Record<FilterCategory, number>> = {};

    unseenCatalogIds.forEach((id) => {
      const item = data.catalog.find((i) => i.id === id);
      if (!item) return;

      let cat: FilterCategory | null = null;
      if (item.slot === 'container') cat = 'container';
      else if (item.slot === 'skin') cat = 'skin';
      else if (item.slot === 'hat') cat = 'hat';
      else if (item.slot === 'body') cat = 'body';
      else if (item.slot === 'hand_item') cat = 'held';

      if (cat) {
        if (!visitedCategories.has(cat)) {
          counts[cat] = (counts[cat] ?? 0) + 1;
        }
      }
      if (!visitedCategories.has('all')) {
        counts['all'] = (counts['all'] ?? 0) + 1;
      }
    });
    return counts;
  }, [data, unseenItems, unseenContainers, visitedCategories]);

  // --- Logic ---
  const getFilteredItems = (items: ItemDef[]) => {
    let result = items;
    if (activeFilter !== 'all') {
      if (activeFilter === 'skin') {
        result = result.filter((i) => i.slot === 'skin');
      } else if (activeFilter === 'held') {
        result = result.filter((i) => i.slot === 'hand_item');
      } else {
        result = result.filter((i) => i.slot === activeFilter);
      }
    }
    return result.sort((a, b) => {
      switch (sortBy) {
        case 'rarity_asc':
          return rarityRank[a.rarity] - rarityRank[b.rarity];
        case 'rarity_desc':
          return rarityRank[b.rarity] - rarityRank[a.rarity];
        case 'price_asc':
          return (a.priceFlies ?? 0) - (b.priceFlies ?? 0);
        case 'price_desc':
          return (b.priceFlies ?? 0) - (a.priceFlies ?? 0);
        default:
          return 0;
      }
    });
  };

  const toggleEquip = async (slot: WardrobeSlot, itemId: string) => {
    if (!data?.wardrobe?.equipped) return;
    const isEquipped = data.wardrobe.equipped[slot] === itemId;
    setEquippingId(itemId);
    await fetch('/api/skins/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, itemId: isEquipped ? null : itemId }),
    });
    setEquippingId(null);
    mutate();
  };

  const handleItemAction = (item: ItemDef) => {
    if (!user) {
      setNotif({ msg: 'Sign in to equip items!', type: 'error' });
      return;
    }

    if (unseenInventorySet.has(item.id)) {
      markItemSeen(item.id);
    }

    if (item.slot === 'container') {
      setOpeningGiftId(item.id);
    } else {
      toggleEquip(item.slot, item.id);
    }
  };

  const handleBuyItem = async (item: ItemDef, e?: React.MouseEvent) => {
    if (!user || buyingId) {
      setNotif({ msg: 'Sign in to buy items!', type: 'error' });
      return;
    }

    if (!data?.wardrobe) return;
    const balance = data.wardrobe.flies ?? 0;
    const price = item.priceFlies ?? 0;
    if (balance < price) {
      setNotif({ msg: 'Not enough flies!', type: 'error' });
      setShakeBalance(true);
      setTimeout(() => setShakeBalance(false), 500);
      return;
    }

    // Confirmation Step
    if (confirmingBuyId !== item.id) {
      setConfirmingBuyId(item.id);
      return;
    }

    setBuyingId(item.id);
    setConfirmingBuyId(null); // Clear confirmation for this item
    try {
      const currentCount = data.wardrobe.inventory[item.id] ?? 0;
      const newData: ApiData = {
        ...data,
        wardrobe: {
          ...data.wardrobe,
          flies: balance - price,
          inventory: {
            ...data.wardrobe.inventory,
            [item.id]: currentCount + 1,
          },
        },
      };
      mutate(newData, false);

      const origin = e
        ? {
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight,
          }
        : { y: 0.6 };

      confetti({
        particleCount: 40,
        spread: 70,
        origin,
        zIndex: 9999,
        colors: ['#a78bfa', '#4ade80', '#facc15'],
      });

      const res = await fetch('/api/skins/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });

      if (res.ok) {
        setNotif({ msg: `Purchased ${item.name}!`, type: 'success' });
        mutate();
      } else {
        throw new Error('Failed');
      }
    } catch (e) {
      setNotif({ msg: 'Purchase failed.', type: 'error' });
      mutate();
    } finally {
      setBuyingId(null);
    }
  };

  const inventoryItems = useMemo(() => {
    if (!data?.wardrobe?.inventory) return [];
    const ownedIds = Object.keys(data.wardrobe.inventory).filter(
      (id) => (data.wardrobe.inventory[id] ?? 0) > 0,
    );
    const owned = (data.catalog || []).filter((i) => ownedIds.includes(i.id));
    return getFilteredItems(owned);
  }, [data, activeFilter, sortBy]);

  const shopItems = useMemo(() => {
    if (!data?.catalog) return [];
    return getFilteredItems(data.catalog);
  }, [data, activeFilter, sortBy]);

  const balance = data?.wardrobe?.flies ?? 0;
  const isGuest = !user;

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={onOpenChange}
        className="h-[90vh] sm:h-[90vh] sm:max-w-[95vw] lg:max-w-[1200px] select-none bg-background"
        zIndex={999}
      >
        {({ isDesktop }) => (
          <div
            className="flex flex-col h-full"
            onClick={() => confirmingBuyId && setConfirmingBuyId(null)}
          >
            {/* --- HEADER --- */}
            <div
              className={cn(
                'relative z-20 px-4 py-4 md:px-8 md:py-6 shrink-0 border-b border-border/40',
                isDesktop
                  ? 'bg-background/50 backdrop-blur-xl'
                  : 'bg-transparent',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-2xl md:text-5xl font-bold tracking-tight text-foreground">
                      Inventory
                    </h2>
                    <p className="hidden md:block text-base font-medium text-muted-foreground mt-1">
                      Customize Your Companion
                    </p>
                  </div>

                  {/* Balance Badge */}
                  <motion.div
                    animate={shakeBalance ? { x: [-5, 5, -5, 5, 0] } : {}}
                    transition={{ duration: 0.4 }}
                    className={cn(
                      'flex items-center gap-2 py-1 pl-1 pr-3 border rounded-full transition-colors duration-300',
                      shakeBalance
                        ? 'bg-red-100 border-red-300 dark:bg-red-900/30 dark:border-red-800'
                        : 'bg-secondary border-border dark:bg-slate-800/50 dark:border-slate-700',
                    )}
                  >
                    <div className="flex items-center justify-center bg-background rounded-full shadow-sm w-9 h-9 ring-1 ring-black/5 shrink-0 dark:bg-slate-900">
                      <Fly
                        size={24}
                        className="text-muted-foreground"
                        y={-2}
                      />
                    </div>
                    <AnimatedNumber
                      value={balance}
                      className="text-sm font-black leading-none md:text-xl text-foreground tabular-nums"
                    />
                  </motion.div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Mobile Close Button (X) */}
                  <button
                    onClick={() => onOpenChange(false)}
                    className="flex items-center justify-center w-10 h-10 rounded-full md:hidden bg-secondary/80 text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Desktop Close Button */}
                  <button
                    onClick={() => onOpenChange(false)}
                    className="items-center justify-center hidden w-10 h-10 transition-colors border rounded-full md:flex bg-secondary hover:bg-secondary/80 border-border dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* --- MAIN CONTENT WRAPPER --- */}
            <div
              className={cn(
                'flex flex-col flex-1 min-h-0',
                isDesktop
                  ? 'bg-background/50 backdrop-blur-2xl'
                  : 'bg-transparent',
              )}
            >
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex flex-col h-full"
              >
                {/* Controls Area (Tabs + Filter) */}
                <div className="px-4 pt-4 space-y-4 shrink-0 md:px-6 md:pt-5">
                  <div className="flex items-center justify-between gap-2 md:gap-4">
                    <TabsList
                      className={cn(
                        'flex-1 h-12 md:h-14 p-1 rounded-[20px] border border-border/50 shadow-sm flex items-center gap-1',
                        isDesktop
                          ? 'bg-card/80 backdrop-blur-2xl'
                          : 'bg-muted/30',
                      )}
                    >
                      <TabsTrigger
                        value="inventory"
                        className="
                          flex-1 h-full rounded-2xl relative
                          flex items-center justify-center gap-2
                          text-xs md:text-sm font-bold tracking-wide uppercase
                          data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none
                          data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                        "
                      >
                        <Shirt className="w-4 h-4" />
                        <span className="hidden xs:inline">Inventory</span>
                        <span className="xs:hidden">Inv</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="shop"
                        className="
                          flex-1 h-full rounded-2xl relative
                          flex items-center justify-center gap-2
                          text-xs md:text-sm font-bold tracking-wide uppercase
                          data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none
                          data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                        "
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span>Shop</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="trade"
                        className="
                          flex-1 h-full rounded-2xl relative
                          flex items-center justify-center gap-2
                          text-xs md:text-sm font-bold tracking-wide uppercase
                          data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none
                          data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                        "
                      >
                        <Repeat className="w-4 h-4" />
                        <span>Trade</span>
                      </TabsTrigger>
                    </TabsList>

                    <SortMenu value={sortBy} onChange={setSortBy} />
                  </div>

                  {activeTab !== 'trade' && (
                    <div className="w-full min-w-0">
                      <FilterBar
                        active={activeFilter}
                        onChange={handleFilterChange}
                        badges={filterBadges}
                      />
                    </div>
                  )}
                </div>

                {/* Content Area (Grid) */}
                <div
                  className={cn(
                    'flex-1 relative mt-4 overflow-hidden',
                    'rounded-t-[32px] border-t border-border/40',
                    isDesktop
                      ? 'bg-card/40 backdrop-blur-md'
                      : 'bg-card/20',
                    'md:mx-8 md:mb-8 md:rounded-[32px] md:border md:border-border/40 md:shadow-inner',
                  )}
                >
                  <TabsContent
                    value="inventory"
                    forceMount
                    className="absolute inset-0 overflow-y-auto p-3 md:p-4 data-[state=inactive]:hidden"
                  >
                    {inventoryItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full opacity-50">
                        <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full md:w-24 md:h-24 bg-secondary">
                          <Shirt className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground" />
                        </div>
                        <p className="text-lg font-black text-muted-foreground">
                          Empty
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 pb-20 md:pb-4">
                        {inventoryItems.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            mode="inventory"
                            ownedCount={
                              data?.wardrobe?.inventory?.[item.id] ?? 0
                            }
                            isEquipped={
                              data?.wardrobe?.equipped?.[item.slot] ===
                              item.id
                            }
                            canAfford={true}
                            actionLoading={equippingId === item.id}
                            onAction={() => handleItemAction(item)}
                            onSell={() => {
                              setItemToSell(item);
                            }}
                            actionLabel={null}
                            isNew={unseenInventorySet.has(item.id)}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent
                    value="shop"
                    forceMount
                    className="absolute inset-0 overflow-y-auto p-3 md:p-4 data-[state=inactive]:hidden"
                  >
                    <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 pb-20 md:pb-4">
                      {shopItems.map((item) => {
                        const count =
                          data?.wardrobe?.inventory?.[item.id] ?? 0;
                        return (
                          <ItemCard
                            key={item.id}
                            item={item}
                            mode="shop"
                            ownedCount={count}
                            isEquipped={false}
                            canAfford={
                              balance >= (item.priceFlies ?? 0) && !isGuest
                            }
                            actionLoading={buyingId === item.id}
                            actionLabel={
                              confirmingBuyId === item.id
                                ? 'CONFIRM'
                                : undefined
                            }
                            onAction={(e) => handleBuyItem(item, e)}
                          />
                        );
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="trade"
                    className="absolute inset-0 overflow-hidden data-[state=inactive]:hidden"
                  >
                    {data?.wardrobe?.inventory && data.catalog && (
                      <TradePanel
                        inventory={data.wardrobe.inventory}
                        catalog={data.catalog}
                        unseenItems={unseenItems}
                        onTradeSuccess={() => mutate()}
                        activeFilter={
                          activeFilter === 'container' ? 'all' : activeFilter
                        }
                        sortBy={sortBy}
                      />
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        )}
      </BaseSheet>

      <SellConfirmationDialog
        open={!!itemToSell}
        onClose={() => setItemToSell(null)}
        onConfirm={confirmSell}
        item={itemToSell}
        ownedCount={
          itemToSell ? (data?.wardrobe?.inventory?.[itemToSell.id] ?? 0) : 0
        }
      />

      {openingGiftId && (
        <GiftBoxOpening
          giftBoxId={openingGiftId}
          onClose={() => setOpeningGiftId(null)}
          onWin={() => mutate()}
        />
      )}
    </>
  );
}
