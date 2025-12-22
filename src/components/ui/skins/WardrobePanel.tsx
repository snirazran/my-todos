import { useInventory } from '@/hooks/useInventory';
import { useMemo, useState, useEffect } from 'react';
import React from 'react';
import { useSession } from 'next-auth/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { motion, AnimatePresence } from 'framer-motion';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

import { TradePanel } from './TradePanel';
import GiftBoxOpening from '@/components/ui/gift-box/GiftBoxOpening';

/* ---------------- Types & Data ---------------- */
// Remove ApiData and fetcher as they are in useInventory now (or types are imported/inferred)
// But ApiData is used locally? Typescript might infer.
// Let's keep ApiData type definition if it's used elsewhere, but useInventory returns typed data.
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
  const { data: session } = useSession();
  const { data, mutate, unseenItems, markItemSeen, markAllSeen } = useInventory(); // Always active

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [visitedCategories, setVisitedCategories] = useState<Set<FilterCategory>>(
    new Set<FilterCategory>(['all'])
  );
  const [actionId, setActionId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOrder>('rarity_desc');
  const [notif, setNotif] = useState<{
    msg: string;
    type: 'error' | 'success';
  } | null>(null);
  const [shakeBalance, setShakeBalance] = useState(false);
  const [openingGiftId, setOpeningGiftId] = useState<string | null>(null);

  // Handle Mark Seen on Close
  const prevOpen = React.useRef(open);
  useEffect(() => {
    if (prevOpen.current && !open) {
      markAllSeen();
    }
    prevOpen.current = open;
  }, [open, markAllSeen]);

  // Handle Mark Seen on Tab Change (Leaving Inventory)
  const prevTab = React.useRef(activeTab);
  useEffect(() => {
    if (prevTab.current === 'inventory' && activeTab !== 'inventory') {
      markAllSeen();
    }
    prevTab.current = activeTab;
  }, [activeTab, markAllSeen]);

  // Filter change handler to mark category as visited
  const handleFilterChange = (cat: FilterCategory) => {
    setActiveFilter(cat);
    setVisitedCategories((prev) => new Set(prev).add(cat));
  };

  // Compute Badges
  const filterBadges = useMemo(() => {
    if (!data || !unseenItems.length) return {};
    const counts: Partial<Record<FilterCategory, number>> = {};
    
    unseenItems.forEach((id) => {
      const item = data.catalog.find((i) => i.id === id);
      if (!item) return;

      let cat: FilterCategory | null = null;
      if (item.slot === 'container') cat = 'container';
      else if (item.slot === 'hat') cat = 'hat';
      else if (item.slot === 'scarf') cat = 'scarf';
      else if (item.slot === 'hand_item') cat = 'held';
      else if (item.slot === 'skin') {
        if (item.rarity === 'epic' || item.rarity === 'legendary') cat = 'costume';
        else cat = 'body';
      }

      if (cat) {
        // Only count if not visited (except 'all', which aggregates everything)
        // Actually, user wants dot removal on click.
        // So if cat is in visitedCategories, count is 0 (or hidden).
        if (!visitedCategories.has(cat)) {
          counts[cat] = (counts[cat] ?? 0) + 1;
        }
      }
      // 'all' badge logic: maybe strictly sum of visible badges? 
      // Or just total unseen? Usually 'all' shows total unseen.
      // If we want 'all' dot to clear when clicked, we check visitedCategories.has('all')
      if (!visitedCategories.has('all')) {
        counts['all'] = (counts['all'] ?? 0) + 1;
      }
    });
    return counts;
  }, [data, unseenItems, visitedCategories]);

  // --- Logic (Identical to previous) ---
  const getFilteredItems = (items: ItemDef[]) => {
    // ... (logic remains same)
    let result = items;
    if (activeFilter !== 'all') {
      if (activeFilter === 'costume') {
        result = result.filter(
          (i) =>
            i.slot === 'skin' &&
            (i.rarity === 'epic' || i.rarity === 'legendary')
        );
      } else if (activeFilter === 'body') {
        result = result.filter(
          (i) =>
            i.slot === 'skin' && i.rarity !== 'epic' && i.rarity !== 'legendary'
        );
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
    setActionId(itemId);
    await fetch('/api/skins/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, itemId: isEquipped ? null : itemId }),
    });
    setActionId(null);
    mutate();
  };

  const handleItemAction = (item: ItemDef) => {
    if (!session) {
      setNotif({ msg: 'Sign in to equip items!', type: 'error' });
      return;
    }

    // Mark as seen immediately when interacting (equipping or opening)
    if (unseenItems.includes(item.id)) {
      markItemSeen(item.id);
    }

    if (item.slot === 'container') {
      setOpeningGiftId(item.id);
    } else {
      toggleEquip(item.slot, item.id);
    }
  };

  const buyItem = async (item: ItemDef, e?: React.MouseEvent) => {
    if (!session) {
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

    // Optimistic Update
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
        // Optimistically add to unseen items? User said "remove the new from the items ive seen" if I go to shop.
        // Actually, logic is simpler: let the API handle the addition to unseen. 
        // We re-fetch or rely on API response.
        // But for smoothness, we might want to manually add it to unseen here if we want immediate feedback?
        // Let's rely on mutate() below which fetches real data.
      },
    };
    mutate(newData, false);
    
    // Trigger confetti for instant gratification
    const origin = e ? {
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight
    } : { y: 0.6 };

    confetti({
      particleCount: 40,
      spread: 70,
      origin,
      zIndex: 9999,
      colors: ['#a78bfa', '#4ade80', '#facc15'], // Purple, Green, Yellow
    });

    setActionId(item.id);
    try {
      const res = await fetch('/api/skins/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });

      if (res.ok) {
        setNotif({ msg: `Purchased ${item.name}!`, type: 'success' });
        // Trigger a real fetch to confirm
        mutate();
      } else {
        throw new Error('Failed');
      }
    } catch (e) {
      // Revert on error
      setNotif({ msg: 'Purchase failed.', type: 'error' });
      mutate(); // re-fetch true data
    } finally {
      setActionId(null);
    }
  };

  const inventoryItems = useMemo(() => {
    if (!data?.wardrobe?.inventory) return [];
    const ownedIds = Object.keys(data.wardrobe.inventory).filter(
      (id) => (data.wardrobe.inventory[id] ?? 0) > 0
    );
    const owned = (data.catalog || []).filter((i) => ownedIds.includes(i.id));
    return getFilteredItems(owned);
  }, [data, activeFilter, sortBy]);

  const shopItems = useMemo(() => {
    if (!data?.catalog) return [];
    return getFilteredItems(data.catalog);
  }, [data, activeFilter, sortBy]);

  const balance = data?.wardrobe?.flies ?? 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
          // ... (keep existing classes)
          'fixed z-50 flex flex-col gap-0 bg-background p-0 sm:p-0 shadow-none outline-none overflow-hidden',
          'top-0 left-0 translate-x-0 translate-y-0',
          'w-full h-[100dvh] max-w-none',
          'inset-0 border-none rounded-none',
          'data-[state=open]:slide-in-from-bottom-full data-[state=open]:slide-in-from-top-0',

          // LARGE DESKTOP (>=1024px) AND TALL (>=800px): Floating Modal Look
          'lg:[@media(min-height:800px)]:top-[50%] lg:[@media(min-height:800px)]:left-[50%] lg:[@media(min-height:800px)]:-translate-x-1/2 lg:[@media(min-height:800px)]:-translate-y-1/2',
          'lg:[@media(min-height:800px)]:w-[95vw] lg:[@media(min-height:800px)]:max-w-[1200px] lg:[@media(min-height:800px)]:h-[90vh] lg:[@media(min-height:800px)]:max-h-[95vh]',
          'lg:[@media(min-height:800px)]:border-4 lg:[@media(min-height:800px)]:border-border lg:[@media(min-height:800px)]:rounded-[36px] lg:[@media(min-height:800px)]:shadow-2xl',
        )}
      >
        {/* --- HEADER --- */}
        <div className="relative z-20 px-4 py-3 bg-card border-b shrink-0 md:px-6 md:pt-5 md:pb-4 border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile Back Button Look */}
              <button
                onClick={() => onOpenChange(false)}
                className="flex items-center justify-center w-8 h-8 rounded-full md:hidden bg-secondary text-muted-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div>
                <DialogTitle className="text-lg font-black tracking-tighter uppercase md:text-4xl text-foreground">
                  The Wardrobe
                </DialogTitle>
                <p className="hidden md:block text-sm font-bold text-muted-foreground tracking-wide mt-0.5">
                  Customize Your Companion
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Balance Badge */}
              <motion.div
                animate={shakeBalance ? { x: [-5, 5, -5, 5, 0] } : {}}
                transition={{ duration: 0.4 }}
                className={cn(
                  'flex items-center gap-2 py-1 pl-1 pr-3 border rounded-full transition-colors duration-300',
                  shakeBalance
                    ? 'bg-red-100 border-red-300 dark:bg-red-900/30 dark:border-red-800'
                    : 'bg-secondary border-border'
                )}
              >
                <div className="flex items-center justify-center bg-background rounded-full shadow-sm w-7 h-7 md:w-9 md:h-9">
                  <Fly
                    size={16}
                    className="text-muted-foreground md:w-6 md:h-6"
                  />
                </div>
                <AnimatedNumber
                  value={balance}
                  className="text-sm font-black leading-none md:text-xl text-foreground tabular-nums"
                />
              </motion.div>

              {/* Desktop Close Button */}
              <button
                onClick={() => onOpenChange(false)}
                className="items-center justify-center hidden w-10 h-10 transition-colors border rounded-full md:flex bg-secondary hover:bg-secondary/80 border-border"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* --- MAIN CONTENT WRAPPER --- */}
        <div className="flex flex-col flex-1 min-h-0 bg-background">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            {/* Controls Area (Tabs + Filter) */}
            <div className="px-4 pt-4 space-y-4 shrink-0 md:px-6 md:pt-5">
              <div className="flex items-center justify-between gap-2 md:gap-4">
                <TabsList className="flex-1 h-11 md:h-14 bg-muted p-1 rounded-xl md:rounded-[20px] border border-border">
                  <TabsTrigger
                    value="inventory"
                    className="flex-1 h-full rounded-lg md:rounded-xl text-[10px] md:text-sm font-black uppercase tracking-wide transition-all relative flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
                  >
                    <Shirt className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden xs:inline">Inventory</span>
                    <span className="xs:hidden">Inv</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="shop"
                    className="flex-1 h-full rounded-lg md:rounded-xl text-[10px] md:text-sm font-black uppercase tracking-wide transition-all flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span>Shop</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="trade"
                    className="flex-1 h-full rounded-lg md:rounded-xl text-[10px] md:text-sm font-black uppercase tracking-wide transition-all flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
                  >
                    <Repeat className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span>Trade</span>
                  </TabsTrigger>
                </TabsList>
                <SortMenu value={sortBy} onChange={setSortBy} />
              </div>

              {/* UPDATED WRAPPER: Just a plain container, FilterBar handles the bleeding */}
              {activeTab !== 'trade' && (
                <div className="w-full min-w-0">
                  <FilterBar 
                    active={activeFilter} 
                    onChange={handleFilterChange}
                    badges={filterBadges} // NEW
                  />
                </div>
              )}
            </div>

            {/* Content Area (Grid) 
                Mobile: Expands to edges, no margin, no border radius
                Desktop: Has margins, rounded corners
            */}
            <div
              className="
              flex-1 relative mt-4 overflow-hidden bg-muted/30
              /* Mobile Styles */
              border-t border-border rounded-none
              /* Desktop Styles */
              md:mx-6 md:mb-6 md:rounded-[24px] md:border-2 md:border-border
            "
            >
              <TabsContent
                value="inventory"
                className="absolute inset-0 overflow-y-auto p-3 md:p-4 data-[state=inactive]:hidden"
              >
                {inventoryItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-50">
                    <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full md:w-24 md:h-24 bg-secondary">
                      <Shirt className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-black text-muted-foreground">Empty</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 pb-20 md:pb-4">
                    {inventoryItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        mode="inventory"
                        ownedCount={data?.wardrobe?.inventory?.[item.id] ?? 0}
                        isEquipped={
                          data?.wardrobe?.equipped?.[item.slot] === item.id
                        }
                        canAfford={true}
                        actionLoading={actionId === item.id}
                        onAction={() => handleItemAction(item)}
                        actionLabel={null}
                        isNew={unseenItems.includes(item.id)} // NEW
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent
                value="shop"
                className="absolute inset-0 overflow-y-auto p-3 md:p-4 data-[state=inactive]:hidden"
              >
                <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 pb-20 md:pb-4">
                  {shopItems.map((item) => {
                    const count = data?.wardrobe?.inventory?.[item.id] ?? 0;
                    return (
                      <ItemCard
                        key={item.id}
                        item={item}
                        mode="shop"
                        ownedCount={count}
                        isEquipped={false}
                        canAfford={balance >= (item.priceFlies ?? 0)}
                        actionLoading={actionId === item.id}
                        onAction={(e) => buyItem(item, e)}
                        actionLabel={null}
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
                    activeFilter={activeFilter}
                    sortBy={sortBy}
                  />
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>

    {/* --- Gift Opening Overlay --- */}
    {openingGiftId && (
      <GiftBoxOpening
        giftBoxId={openingGiftId}
        onClose={() => {
          setOpeningGiftId(null);
          mutate(); // Refresh inventory to show prize
        }}
        onWin={(item) => {
          setNotif({ msg: `You won: ${item.name}!`, type: 'success' });
          // Note: Inventory refresh happens in onClose
        }}
      />
    )}
    </>
  );
}
