import { mutateInventoryCaches, useInventory } from '@/hooks/useInventory';
import { useMemo, useState, useEffect } from 'react';
import React from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lock, Shirt, X, ShoppingBag, Repeat, ChevronDown, Sparkles, Paintbrush, Crown, Hand } from 'lucide-react';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import { rarityRank } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import { ItemCard } from './ItemCard';
import { FilterBar, FilterCategory } from './FilterBar';
import { SortMenu, SortOrder } from './SortMenu';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { motion, type DragControls } from 'framer-motion';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

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
  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      className="h-[90vh] sm:h-[90vh] sm:max-w-[95vw] lg:max-w-[1200px] select-none bg-background"
      zIndex={1100}
    >
      {({ isDesktop, dragControls, isDragging }) => (
        <WardrobeManagerContent
          open={open}
          defaultTab={defaultTab}
          embedded={false}
          onClose={() => onOpenChange(false)}
          isDesktop={isDesktop}
          isDragging={isDragging}
          dragControls={dragControls}
        />
      )}
    </BaseSheet>
  );
}

export function WardrobePageContent({
  defaultTab = 'inventory',
  onClose,
}: {
  defaultTab?: 'inventory' | 'shop' | 'trade';
  onClose: () => void;
}) {
  return (
    <div className="min-h-0 flex-1">
      <WardrobeManagerContent
        open={true}
        defaultTab={defaultTab}
        embedded={true}
        onClose={onClose}
        isDesktop={true}
        isDragging={false}
      />
    </div>
  );
}

function WardrobeManagerContent({
  open,
  onClose,
  defaultTab,
  embedded,
  isDesktop,
  isDragging,
  dragControls,
}: {
  open: boolean;
  onClose: () => void;
  defaultTab: 'inventory' | 'shop' | 'trade';
  embedded: boolean;
  isDesktop: boolean;
  isDragging: boolean;
  dragControls?: DragControls;
}) {
  const { user } = useAuth();
  const {
    data,
    mutate,
    unseenItems,
    unseenContainers,
    markItemSeen,
  } =
    useInventory(open);

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);
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
  const [inventoryHasScrolled, setInventoryHasScrolled] = useState(false);
  const [shopHasScrolled, setShopHasScrolled] = useState(false);
  const [gridInitialSize, setGridInitialSize] = useState(4);
  const [gridBatchSize, setGridBatchSize] = useState(6);

  // --- Sell Dialog Logic ---
  const [itemToSell, setItemToSell] = useState<ItemDef | null>(null);

  const overscrollDrag = useSheetOverscrollDrag();
  const inventoryScrollRef = React.useRef<HTMLDivElement | null>(null);
  const shopScrollRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!dragControls) return;
    overscrollDrag.setContext(dragControls, !embedded && !isDesktop);
  }, [dragControls, embedded, isDesktop, overscrollDrag]);

  const unseenInventorySet = useMemo(
    () => new Set(data?.wardrobe?.unseenItems ?? []),
    [data?.wardrobe?.unseenItems],
  );

  useEffect(() => {
    setInventoryHasScrolled(false);
    setShopHasScrolled(false);
  }, [activeFilter, sortBy, activeTab, open]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => {
      setGridInitialSize(query.matches ? 10 : 4);
      setGridBatchSize(query.matches ? 10 : 6);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

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
        refreshInventory();
      } else {
        throw new Error('Failed');
      }
    } catch (e) {
      setNotif({ msg: 'Sell failed.', type: 'error' });
      refreshInventory();
    } finally {
      // setActionId(null); // Removed
    }
  };

  // Handle Mark Seen on Close — call API directly since data is cleared when open→false
  const prevOpen = React.useRef(open);
  useEffect(() => {
    if (prevOpen.current && !open) {
      fetch('/api/skins/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markSeen' }),
      })
        .then(() => mutateInventoryCaches())
        .catch(() => {});
    }
    prevOpen.current = open;
  }, [open]);

  // Mark Seen on unmount (covers the dedicated /wardrobe page, where `open` stays true)
  useEffect(() => {
    return () => {
      fetch('/api/skins/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markSeen' }),
        keepalive: true,
      })
        .then(() => mutateInventoryCaches())
        .catch(() => {});
    };
  }, []);

  const refreshInventory = () => {
    mutate();
    mutateInventoryCaches();
  };

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
    refreshInventory();
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
        refreshInventory();
      } else {
        throw new Error('Failed');
      }
    } catch (e) {
      setNotif({ msg: 'Purchase failed.', type: 'error' });
      refreshInventory();
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
    return getFilteredItems(data.catalog.filter((i) => i.slot !== 'container'));
  }, [data, activeFilter, sortBy]);

  const inventoryGrid = useInfiniteScroll(inventoryItems, {
    initial: inventoryItems.length,
    batch: inventoryItems.length || 1,
    resetKey: `inv|${activeFilter}|${sortBy}|${inventoryItems.length}|${open ? 'open' : 'closed'}`,
    rootRef: inventoryScrollRef,
    enabled: false,
  });
  const shopGrid = useInfiniteScroll(shopItems, {
    initial: shopItems.length,
    batch: shopItems.length || 1,
    resetKey: `shop|${activeFilter}|${sortBy}|${shopItems.length}|${open ? 'open' : 'closed'}`,
    rootRef: shopScrollRef,
    enabled: false,
  });

  useEffect(() => {
    if (!open || gridInitialSize >= gridBatchSize) return;

    let cancelIdleLoad: (() => void) | undefined;
    const loadTimer = window.setTimeout(() => {
      const loadMore =
        activeTab === 'inventory'
          ? inventoryGrid.hasMore
            ? inventoryGrid.loadMore
            : null
          : activeTab === 'shop' && shopGrid.hasMore
            ? shopGrid.loadMore
            : null;
      if (!loadMore) return;

      if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(() => loadMore(), {
          timeout: 700,
        });
        cancelIdleLoad = () => window.cancelIdleCallback(idleId);
      } else {
        const fallbackTimer = globalThis.setTimeout(loadMore, 0);
        cancelIdleLoad = () => globalThis.clearTimeout(fallbackTimer);
      }
    }, 900);

    return () => {
      window.clearTimeout(loadTimer);
      cancelIdleLoad?.();
    };
  }, [
    activeFilter,
    activeTab,
    gridBatchSize,
    gridInitialSize,
    inventoryGrid.hasMore,
    inventoryGrid.loadMore,
    open,
    shopGrid.hasMore,
    shopGrid.loadMore,
    sortBy,
  ]);

  const isNearScrollEnd = (node: HTMLElement) =>
    node.scrollTop + node.clientHeight >= node.scrollHeight - 160;
  const shouldLoadMoreFromWheel = (node: HTMLElement, deltaY: number) =>
    deltaY > 0 && node.scrollTop + node.clientHeight >= node.scrollHeight - 160;

  const balance = data?.wardrobe?.flies ?? 0;
  const isGuest = !user;
  const canRenderItems = !!data;

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        embedded
          ? 'min-h-0 overflow-hidden bg-transparent'
          : 'overflow-hidden rounded-[32px] border border-border/50 bg-background shadow-sm',
      )}
      onClick={() => confirmingBuyId && setConfirmingBuyId(null)}
    >
      {/* --- HEADER --- */}
      {!embedded && (
        <div
          onPointerDown={(e) => !isDesktop && dragControls?.start(e)}
          className="px-4 py-4 md:px-6 shrink-0 border-b border-border/50"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                Style Studio
              </p>
              <div className="min-w-0">
                <h2 className="text-3xl font-black tracking-tight text-foreground leading-none">
                  Wardrobe
                </h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  Customize your frog and preview changes live.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onClose}
                className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground transition-all active:scale-95 bg-muted/60 hover:bg-muted"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          'flex flex-col flex-1 min-h-0',
          embedded
            ? 'bg-transparent'
            : isDesktop
              ? 'bg-background/50 backdrop-blur-2xl'
              : 'bg-transparent',
        )}
      >
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col h-full"
        >
          <div className="px-4 pt-0 space-y-3 shrink-0 md:px-6 md:pt-5 md:space-y-4">
            <div className="flex items-center justify-between gap-2 md:gap-4">
              <TabsList
                className={cn(
                  'flex-1 h-12 md:h-14 p-1 rounded-[20px] border border-border/50 shadow-sm flex items-center gap-1',
                  embedded
                    ? 'bg-card/50 backdrop-blur-xl'
                    : isDesktop
                    ? 'bg-card/80 backdrop-blur-2xl'
                    : 'bg-muted/30',
                )}
              >
                <TabsTrigger value="inventory" className="
                            flex-1 h-full rounded-2xl relative
                            flex items-center justify-center gap-2
                            text-xs md:text-sm font-bold tracking-wide uppercase
                            data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none
                            data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                          ">
                  <Shirt className="w-4 h-4" />
                  <span className="hidden xs:inline">Wardrobe</span>
                  <span className="xs:hidden">INV</span>
                </TabsTrigger>
                <TabsTrigger value="shop" className="
                            flex-1 h-full rounded-2xl relative
                            flex items-center justify-center gap-2
                            text-xs md:text-sm font-bold tracking-wide uppercase
                            data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none
                            data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                          ">
                  <ShoppingBag className="w-4 h-4" />
                  <span>Shop</span>
                </TabsTrigger>
                <TabsTrigger value="trade" className="
                            flex-1 h-full rounded-2xl relative
                            flex items-center justify-center gap-2
                            text-xs md:text-sm font-bold tracking-wide uppercase
                            data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none
                            data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground
                          ">
                  <Repeat className="w-4 h-4" />
                  <span>Trade</span>
                </TabsTrigger>
              </TabsList>

              <SortMenu value={sortBy} onChange={setSortBy} />
            </div>

            <div className="w-full min-w-0">
              <FilterBar
                active={activeFilter === 'container' && activeTab !== 'inventory' ? 'all' : activeFilter}
                onChange={handleFilterChange}
                badges={filterBadges}
                options={
                  activeTab !== 'inventory'
                    ? [
                        { id: 'all', label: 'All Items', icon: <Sparkles className="w-5 h-5" /> },
                        { id: 'skin', label: 'Skins', icon: <Paintbrush className="w-5 h-5" /> },
                        { id: 'hat', label: 'Hats', icon: <Crown className="w-5 h-5" /> },
                        { id: 'body', label: 'Body', icon: <Shirt className="w-5 h-5" /> },
                        { id: 'held', label: 'Held', icon: <Hand className="w-5 h-5" /> },
                      ]
                    : undefined
                }
              />
            </div>
          </div>

          <div
            className={cn(
              'flex-1 relative mt-4 overflow-hidden',
              embedded
                ? 'rounded-[28px] bg-transparent'
                : 'rounded-t-[32px] border-t border-border/40',
              embedded
                ? ''
                : isDesktop
                  ? 'bg-card/40 backdrop-blur-md'
                  : 'bg-card/20',
              embedded
                ? 'pb-2'
                : 'md:mx-8 md:mb-8 md:rounded-[32px] md:border md:border-border/40 md:shadow-inner',
            )}
          >
            <TabsContent
              value="inventory"
              ref={(node) => {
                inventoryScrollRef.current = node;
                overscrollDrag.bind(node);
              }}
              onScroll={(event) => {
                setInventoryHasScrolled(true);
                if (
                  inventoryGrid.hasMore &&
                  isNearScrollEnd(event.currentTarget)
                ) {
                  inventoryGrid.loadMore();
                }
              }}
              onWheel={(event) => {
                setInventoryHasScrolled(true);
                if (
                  inventoryGrid.hasMore &&
                  shouldLoadMoreFromWheel(
                    event.currentTarget,
                    event.deltaY,
                  )
                ) {
                  inventoryGrid.loadMore();
                }
              }}
              className="absolute inset-0 overflow-y-auto p-3 md:p-4 data-[state=inactive]:hidden overscroll-none"
            >
              {!canRenderItems ? (
                <WardrobeGridSkeleton />
              ) : activeTab === 'inventory' && inventoryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50">
                  <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full md:w-24 md:h-24 bg-secondary">
                    <Shirt className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-black text-muted-foreground">
                    Empty
                  </p>
                </div>
              ) : activeTab === 'inventory' ? (
                <>
                  <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-20 md:pb-4">
                    {inventoryGrid.visibleItems.map((item, index) => (
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
                        deferPreview
                        pausePreview={
                          (item.slot !== 'container' && isDragging) ||
                          (item.slot !== 'container' &&
                           data?.wardrobe?.equipped?.[item.slot] !== item.id)
                        }
                        previewDelayMs={index * 20}
                      />
                    ))}
                  </div>
                  {inventoryGrid.hasMore && (
                    <div
                      ref={inventoryGrid.sentinelRef}
                      className="h-8"
                      aria-hidden="true"
                    />
                  )}
                </>
              ) : null}
            </TabsContent>

            <TabsContent
              value="shop"
              ref={(node) => {
                shopScrollRef.current = node;
                overscrollDrag.bind(node);
              }}
              onScroll={(event) => {
                setShopHasScrolled(true);
                if (
                  shopGrid.hasMore &&
                  isNearScrollEnd(event.currentTarget)
                ) {
                  shopGrid.loadMore();
                }
              }}
              onWheel={(event) => {
                setShopHasScrolled(true);
                if (
                  shopGrid.hasMore &&
                  shouldLoadMoreFromWheel(
                    event.currentTarget,
                    event.deltaY,
                  )
                ) {
                  shopGrid.loadMore();
                }
              }}
              className="absolute inset-0 overflow-y-auto p-3 md:p-4 data-[state=inactive]:hidden overscroll-none"
            >
              {!canRenderItems ? (
                <WardrobeGridSkeleton />
              ) : activeTab === 'shop' ? (
                <>
                  <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-20 md:pb-4">
                    {shopGrid.visibleItems.map((item, index) => {
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
                            balance >= (item.priceFlies ?? 0) &&
                            !isGuest
                          }
                          actionLoading={buyingId === item.id}
                          actionLabel={
                            confirmingBuyId === item.id
                              ? 'CONFIRM'
                              : undefined
                          }
                          onAction={(e) => handleBuyItem(item, e)}
                          deferPreview
                          pausePreview={(item.slot !== 'container' && isDragging) || (item.slot !== 'container' && confirmingBuyId !== item.id)}
                          previewDelayMs={index * 20}
                        />
                      );
                    })}
                  </div>
                  {shopGrid.hasMore && (
                    <div
                      ref={shopGrid.sentinelRef}
                      className="h-8"
                      aria-hidden="true"
                    />
                  )}
                </>
              ) : null}
            </TabsContent>

            <TabsContent
              value="trade"
              className="absolute inset-0 overflow-hidden data-[state=inactive]:hidden"
            >
              {!canRenderItems ? (
                <WardrobeGridSkeleton />
              ) : activeTab === 'trade' && data?.wardrobe?.inventory && data.catalog ? (
                <TradePanel
                  inventory={data.wardrobe.inventory}
                  catalog={data.catalog}
                  unseenItems={unseenItems}
                  onTradeSuccess={refreshInventory}
                  activeFilter={
                    activeFilter === 'container' ? 'all' : activeFilter
                  }
                  sortBy={sortBy}
                  paused={isDragging}
                />
              ) : null}
            </TabsContent>

            {activeTab === 'inventory' && inventoryGrid.hasMore && (
              <ScrollMoreCue />
            )}
            {activeTab === 'shop' && shopGrid.hasMore && (
              <ScrollMoreCue />
            )}
          </div>
        </Tabs>
      </div>

      <SellConfirmationDialog
        open={!!itemToSell}
        onClose={() => setItemToSell(null)}
        onConfirm={confirmSell}
        item={itemToSell}
        ownedCount={
          itemToSell ? (data?.wardrobe?.inventory?.[itemToSell.id] ?? 0) : 0
        }
        paused={isDragging}
      />

      {openingGiftId && (
        <GiftBoxOpening
          giftBoxId={openingGiftId}
          onClose={() => setOpeningGiftId(null)}
          onWin={refreshInventory}
          paused={isDragging}
        />
      )}
    </div>
  );
}

function WardrobeGridSkeleton() {
  return (
    <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-20 md:pb-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="mx-auto flex w-full max-w-[240px] flex-col rounded-2xl border-[3px] border-border bg-card p-2.5 md:p-3.5"
        >
          <div className="mt-4 mb-2 md:mt-5 md:mb-3 aspect-[1/0.75] md:aspect-[1.2/1] rounded-xl bg-muted/50" />
          <div className="mx-auto h-3 w-2/3 rounded-full bg-muted/60" />
          <div className="mx-auto mt-3 h-7 w-3/4 rounded-lg bg-muted/50 md:h-8" />
        </div>
      ))}
    </div>
  );
}

function ScrollMoreCue() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-background/95 via-background/60 to-transparent pb-4 pt-10">
      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">
        <ChevronDown className="h-3.5 w-3.5 animate-bounce text-primary" />
        <span>Scroll for more</span>
      </div>
    </div>
  );
}
