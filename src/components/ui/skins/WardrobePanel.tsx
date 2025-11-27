'use client';

import useSWR from 'swr';
import { useMemo, useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lock, Shirt, XCircle } from 'lucide-react';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import { rarityRank } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';

// Child Components
import { ItemCard } from './ItemCard';
import { FilterBar, FilterCategory } from './FilterBar';
import { SortMenu, SortOrder } from './SortMenu';
import { cn } from '@/lib/utils';

/* ---------------- Types & Data ---------------- */

type ApiData = {
  wardrobe: {
    equipped: Partial<Record<WardrobeSlot, string | null>>;
    inventory: Record<string, number>;
    flies: number;
  };
  catalog: ItemDef[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ---------------- Toast Component ---------------- */
// Simple local toast for this panel
function Notification({ 
  message, 
  type, 
  onClose 
}: { 
  message: string | null; 
  type: 'error' | 'success' | null; 
  onClose: () => void 
}) {
  useEffect(() => {
    if (message) {
      const t = setTimeout(onClose, 2000);
      return () => clearTimeout(t);
    }
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={cn(
      "absolute top-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-4 py-2 rounded-full shadow-xl text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-200",
      type === 'error' ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
    )}>
      {type === 'error' && <XCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

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
  const { data, mutate } = useSWR<ApiData>(
    open ? '/api/skins/inventory' : null,
    fetcher
  );

  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [actionId, setActionId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOrder>('rarity_desc');
  
  // Notification State
  const [notif, setNotif] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);

  // Filter Logic
  const getFilteredItems = (items: ItemDef[]) => {
    let result = items;
    
    if (activeFilter !== 'all') {
      if (activeFilter === 'costume') {
        // Costumes: Skin slot AND (Epic OR Legendary)
        result = result.filter(i => i.slot === 'skin' && (i.rarity === 'epic' || i.rarity === 'legendary'));
      } else if (activeFilter === 'body') {
        // Body: Skin slot AND NOT (Epic OR Legendary)
        result = result.filter(i => i.slot === 'skin' && i.rarity !== 'epic' && i.rarity !== 'legendary');
      } else if (activeFilter === 'held') {
         result = result.filter(i => i.slot === 'hand_item');
      } else {
        // Direct mapping for hat, scarf
        result = result.filter(i => i.slot === activeFilter);
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

  // Actions
  const toggleEquip = async (slot: WardrobeSlot, itemId: string) => {
    if (!data) return;
    const isEquipped = data.wardrobe.equipped[slot] === itemId;
    setActionId(itemId);
    const res = await fetch('/api/skins/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, itemId: isEquipped ? null : itemId }),
    });
    setActionId(null);
    if (res.ok) mutate();
  };

  const buyItem = async (item: ItemDef) => {
    const balance = data?.wardrobe?.flies ?? 0;
    const price = item.priceFlies ?? 0;

    if (balance < price) {
      setNotif({ msg: "Not enough flies!", type: 'error' });
      return;
    }

    setActionId(item.id);
    const res = await fetch('/api/skins/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    });
    setActionId(null);
    
    if (res.ok) {
      mutate();
      setNotif({ msg: `Purchased ${item.name}!`, type: 'success' });
    } else {
      setNotif({ msg: "Purchase failed.", type: 'error' });
    }
  };

  // Compute current equipped indices for the Frog preview
  const equippedIndices = useMemo(() => {
    // Default all slots to 0 to prevent Rive defaults (like Santa hat) from showing
    const indices: Record<WardrobeSlot, number> = {
      skin: 0,
      hat: 0,
      scarf: 0,
      hand_item: 0
    };

    if (!data) return indices;
    
    for (const [slot, itemId] of Object.entries(data.wardrobe.equipped)) {
      if (!itemId) continue;
      const item = data.catalog.find(i => i.id === itemId);
      if (item) indices[slot as WardrobeSlot] = item.riveIndex;
    }
    return indices;
  }, [data]);

  // Computed lists
  const inventoryItems = useMemo(() => {
    if (!data) return [];
    const ownedIds = Object.keys(data.wardrobe.inventory);
    const owned = (data.catalog || []).filter(i => ownedIds.includes(i.id));
    return getFilteredItems(owned);
  }, [data, activeFilter, sortBy]);

  const shopItems = useMemo(() => {
    if (!data) return [];
    return getFilteredItems(data.catalog || []);
  }, [data, activeFilter, sortBy]);

  const balance = data?.wardrobe?.flies ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[900px] !w-[95vw] p-0 gap-0 !bg-slate-50 !dark:bg-slate-950 max-h-[90vh] flex flex-col overflow-hidden !rounded-[36px] !border-4 !border-slate-200 !dark:border-slate-800 !shadow-2xl">
        
        {/* Notification Popup */}
        <Notification 
          message={notif?.msg ?? null} 
          type={notif?.type ?? null} 
          onClose={() => setNotif(null)} 
        />

        {/* Top Bar (Game Header) */}
        <div className="px-6 pt-5 pb-4 bg-white dark:bg-slate-900 border-b-2 border-slate-200 dark:border-slate-800 shrink-0 z-20 shadow-sm relative">
          <div className="flex items-center justify-between mb-6">
            <div>
               <DialogTitle className="text-4xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-br from-slate-800 to-slate-600 dark:from-white dark:to-slate-400 drop-shadow-sm">
                 The Wardrobe
               </DialogTitle>
               <p className="text-sm font-bold text-slate-400 dark:text-slate-500 tracking-wide mt-0.5">
                 Customize Your Companion
               </p>
            </div>
            
            {/* Currency Badge */}
            <div className="flex items-center gap-3 pl-2.5 pr-4 py-1.5 rounded-[18px] bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700 shadow-inner backdrop-blur-sm">
               <div className="relative flex items-center justify-center bg-white rounded-full shadow-sm w-9 h-9 dark:bg-slate-700 ring-1 ring-black/5">
                 <Fly size={24} y={-2} className="text-slate-600 dark:text-slate-300" />
               </div>
               <div className="flex flex-col justify-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none mb-0.5">
                    Balance
                  </span>
                  <span className="text-xl font-black leading-none text-slate-700 dark:text-slate-200 tabular-nums">
                    {balance.toLocaleString()}
                  </span>
                </div>
            </div>
          </div>

          {/* Main Navigation Tabs */}
          <div className="flex gap-4">
             <Tabs defaultValue={defaultTab} className="w-full flex flex-col h-full">
                <div className="flex items-center justify-between gap-4">
                  <TabsList className="flex-1 h-14 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-[20px] border-2 border-slate-200 dark:border-slate-700">
                    <TabsTrigger value="inventory" className="flex-1 h-full rounded-xl text-base font-black uppercase tracking-wide data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md transition-all">
                       Inventory
                    </TabsTrigger>
                    <TabsTrigger value="shop" className="flex-1 h-full rounded-xl text-base font-black uppercase tracking-wide data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md transition-all">
                       Shop
                    </TabsTrigger>
                    <TabsTrigger value="trade" className="flex-1 h-full rounded-xl text-base font-black uppercase tracking-wide opacity-50 cursor-not-allowed">
                       Trade
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Sort Button */}
                  <SortMenu value={sortBy} onChange={setSortBy} />
                </div>

                {/* Filter Bar */}
                <div className="mt-5 -mx-2">
                  <FilterBar active={activeFilter} onChange={setActiveFilter} />
                </div>

                {/* Content Area - Game Grid */}
                <div className="flex-1 min-h-[400px] relative mt-2 rounded-[24px] bg-slate-100/50 dark:bg-slate-900/50 border-2 border-slate-200/50 dark:border-slate-800/50 overflow-hidden">
                  
                  {/* Inventory Grid */}
                  <TabsContent value="inventory" className="absolute inset-0 overflow-y-auto p-4 data-[state=inactive]:hidden">
                    {inventoryItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                         <div className="w-24 h-24 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                            <Shirt className="w-10 h-10 text-slate-400" />
                         </div>
                         <p className="text-lg font-black text-slate-400">Empty</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 min-[500px]:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 pb-20">
                        {inventoryItems.map(item => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            mode="inventory"
                            equippedIndices={equippedIndices}
                            ownedCount={data?.wardrobe.inventory[item.id] ?? 0}
                            isEquipped={data?.wardrobe.equipped[item.slot] === item.id}
                            canAfford={true}
                            actionLoading={actionId === item.id}
                            onAction={() => toggleEquip(item.slot, item.id)}
                            actionLabel={null}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Shop Grid */}
                  <TabsContent value="shop" className="absolute inset-0 overflow-y-auto p-4 data-[state=inactive]:hidden">
                     <div className="grid grid-cols-3 min-[500px]:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 pb-20">
                        {shopItems.map(item => {
                          const count = data?.wardrobe.inventory[item.id] ?? 0;
                          return (
                            <ItemCard
                              key={item.id}
                              item={item}
                              mode="shop"
                              equippedIndices={equippedIndices}
                              ownedCount={count}
                              isEquipped={false}
                              canAfford={balance >= (item.priceFlies ?? 0)}
                              actionLoading={actionId === item.id}
                              onAction={() => buyItem(item)}
                              actionLabel={null}
                            />
                          );
                        })}
                     </div>
                  </TabsContent>

                  {/* Trade Placeholder */}
                  <TabsContent value="trade" className="absolute inset-0 flex items-center justify-center data-[state=inactive]:hidden">
                    <div className="text-center space-y-2 opacity-60">
                      <Lock className="w-12 h-12 mx-auto text-slate-400" />
                      <h3 className="text-xl font-black text-slate-500">Locked</h3>
                    </div>
                  </TabsContent>

                </div>
             </Tabs>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
