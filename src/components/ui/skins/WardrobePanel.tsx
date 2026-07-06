import {
  beginEquipMutation,
  endEquipMutation,
  mutateInventoryCaches,
  mutateInventorySummary,
  useInventory,
} from '@/hooks/useInventory';
import { useMemo, useState, useEffect } from 'react';
import React from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Lock,
  Shirt,
  ShoppingBag,
  Repeat,
  ChevronDown,
  Sparkles,
  Paintbrush,
  Crown,
  Hand,
  Image as ImageIcon,
  Gift,
} from 'lucide-react';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import { rarityRank, byId as staticById } from '@/lib/skins/catalog';
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';
import { ItemCard } from './ItemCard';
import { PurchaseSheet, type PurchaseTarget } from './PurchaseSheet';
import { FilterBar, FilterCategory } from './FilterBar';
import { SortMenu, SortOrder } from './SortMenu';
import { cn } from '@/lib/utils';
import { motion, type DragControls } from 'framer-motion';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

import { TradePanel } from './TradePanel';
import GiftBoxOpening from '@/components/ui/gift-box/GiftBoxOpening';
import { SellConfirmationDialog } from './SellConfirmationDialog';
import { StreakFreezeShopCard } from '@/components/ui/streak/StreakFreezeShopCard';
import { DailyDealsShelf } from './DailyDealsShelf';
import { SeenOnFriendsRow } from './SeenOnFriendsRow';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { WardrobeGridSkeleton } from '@/components/ui/Skeleton';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { BackgroundCard } from './BackgroundCard';
import { mutateBackgrounds, type BackgroundItem } from '@/hooks/useBackgrounds';
import {
  useBackgroundActions,
  backgroundPreview,
} from '@/hooks/useBackgroundActions';
import { useUIStore } from '@/lib/uiStore';

type WardrobeCard =
  | {
      kind: 'item';
      id: string;
      rarity: ItemDef['rarity'];
      price: number;
      item: ItemDef;
    }
  | {
      kind: 'bg';
      id: string;
      rarity: ItemDef['rarity'];
      price: number;
      bg: BackgroundItem;
    };

function mergeWardrobeCards(
  items: ItemDef[],
  backgrounds: BackgroundItem[],
  sortBy: SortOrder,
): WardrobeCard[] {
  const itemCards: WardrobeCard[] = items.map((item) => ({
    kind: 'item',
    id: item.id,
    rarity: item.rarity,
    price: item.priceFlies ?? 0,
    item,
  }));
  const bgCards: WardrobeCard[] = backgrounds.map((bg) => ({
    kind: 'bg',
    id: bg.id,
    rarity: bg.rarity,
    price: bg.priceFlies ?? 0,
    bg,
  }));
  // 'latest' has no meaningful timestamp for backgrounds — keep items (already
  // latest-sorted) first, then backgrounds. Other modes merge and re-sort; the
  // stable sort keeps items ahead of backgrounds within an equal bucket.
  if (sortBy === 'latest') return [...itemCards, ...bgCards];
  const all = [...itemCards, ...bgCards];
  all.sort((a, b) => {
    switch (sortBy) {
      case 'rarity_asc':
        return rarityRank[a.rarity] - rarityRank[b.rarity];
      case 'rarity_desc':
        return rarityRank[b.rarity] - rarityRank[a.rarity];
      case 'price_asc':
        return a.price - b.price;
      case 'price_desc':
        return b.price - a.price;
      default:
        return 0;
    }
  });
  return all;
}

function groupCardsByRarity(cards: WardrobeCard[]) {
  const groups: { rarity: ItemDef['rarity']; cards: WardrobeCard[] }[] = [];
  for (const card of cards) {
    const last = groups[groups.length - 1];
    if (last && last.rarity === card.rarity) last.cards.push(card);
    else groups.push({ rarity: card.rarity, cards: [card] });
  }
  return groups;
}

function pinEquippedFirst(
  cards: WardrobeCard[],
  equipped: Partial<Record<WardrobeSlot, string | null>> | undefined,
  equippedBgId: string | null | undefined,
): WardrobeCard[] {
  const isEquipped = (c: WardrobeCard) =>
    c.kind === 'item'
      ? equipped?.[c.item.slot] === c.item.id
      : c.bg.id === equippedBgId;
  const equippedCards: WardrobeCard[] = [];
  const rest: WardrobeCard[] = [];
  for (const c of cards) (isEquipped(c) ? equippedCards : rest).push(c);
  return [...equippedCards, ...rest];
}

const SLOT_LABEL: Record<WardrobeSlot, string> = {
  skin: 'Skin',
  hat: 'Hat',
  body: 'Body',
  hand_item: 'Held',
  container: 'Gift',
};

/* ---------------- Types & Data ---------------- */
type ApiData = {
  wardrobe: {
    equipped: Partial<Record<WardrobeSlot, string | null>>;
    inventory: Record<string, number>;
    unseenItems?: string[];
    inventoryHistory?: Record<string, string>;
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
      {({ isDesktop, dragControls, isDragging, bindScroll }) => (
        <WardrobeManagerContent
          open={open}
          defaultTab={defaultTab}
          embedded={false}
          onClose={() => onOpenChange(false)}
          isDesktop={isDesktop}
          isDragging={isDragging}
          dragControls={dragControls}
          bindScroll={bindScroll}
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
    <div className="flex flex-col flex-1">
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
  bindScroll,
}: {
  open: boolean;
  onClose: () => void;
  defaultTab: 'inventory' | 'shop' | 'trade';
  embedded: boolean;
  isDesktop: boolean;
  isDragging: boolean;
  dragControls?: DragControls;
  bindScroll?: (el: HTMLElement | null) => void;
}) {
  const { user } = useAuth();
  const { data, mutate, unseenItems, unseenContainers, markItemSeen } =
    useInventory(open);

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);
  useEffect(() => {
    setSortBy(activeTab === 'inventory' ? 'latest' : 'rarity_asc');
  }, [activeTab]);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [visitedCategories, setVisitedCategories] = useState<
    Set<FilterCategory>
  >(new Set<FilterCategory>(['all']));
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [purchaseCard, setPurchaseCard] = useState<WardrobeCard | null>(null);
  const [purchaseDealPrice, setPurchaseDealPrice] = useState<number | null>(
    null,
  );
  const [plusOpen, setPlusOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOrder>('latest');
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

  const bg = useBackgroundActions({
    isGuest: !user,
    onNotify: (n) => setNotif(n),
    shopBalance: data?.wardrobe?.flies ?? 0,
    onSpend: () => refreshInventory(),
  });
  const showBackgrounds =
    activeFilter === 'all' || activeFilter === 'background';
  const inventoryBackgrounds = showBackgrounds
    ? bg.sortItems('inventory', sortBy)
    : [];
  const shopBackgrounds = showBackgrounds ? bg.sortItems('shop', sortBy) : [];

  const inventoryScrollRef = React.useRef<HTMLDivElement | null>(null);
  const shopScrollRef = React.useRef<HTMLDivElement | null>(null);

  const stickySentinelRef = React.useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = React.useState(false);
  const setWardrobeStuck = useUIStore((s) => s.setWardrobeStuck);
  React.useEffect(() => {
    if (!embedded) return;
    const sentinel = stickySentinelRef.current;
    if (!sentinel) return;
    const root = document.getElementById('main-scroll');
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [embedded]);
  React.useEffect(() => {
    if (!embedded) return;
    setWardrobeStuck(isStuck);
    return () => setWardrobeStuck(false);
  }, [embedded, isStuck, setWardrobeStuck]);

  const setWardrobeTab = useUIStore((s) => s.setWardrobeTab);
  React.useEffect(() => {
    if (!embedded) return;
    setWardrobeTab(activeTab);
    return () => setWardrobeTab('inventory');
  }, [embedded, activeTab, setWardrobeTab]);

  const tabTriggerClass = cn(
    'flex-1 h-full rounded-2xl relative flex items-center justify-center gap-2',
    'text-xs md:text-sm font-bold tracking-wide uppercase transition-colors',
    embedded
      ? 'data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm'
      : 'data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none',
    'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground',
  );

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

    if (currentCount < qty) return;

    // Optimistic
    mutate(
      (curr) =>
        curr?.wardrobe
          ? {
              ...curr,
              wardrobe: {
                ...curr.wardrobe,
                flies: (curr.wardrobe.flies ?? 0) + totalRefund,
                inventory: {
                  ...curr.wardrobe.inventory,
                  [item.id]: Math.max(
                    0,
                    (curr.wardrobe.inventory[item.id] ?? 0) - qty,
                  ),
                },
              },
            }
          : curr,
      { revalidate: false },
    );

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
    mutateBackgrounds();
  };

  const scrollPageToTop = () => {
    if (!embedded) return;
    document
      .getElementById('main-scroll')
      ?.scrollTo({ top: 0, behavior: 'smooth' });
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

  const canRenderItems = !!data;

  const pinSnapshotRef = React.useRef<{
    key: string;
    equipped: Partial<Record<WardrobeSlot, string | null>> | undefined;
    bgEquipped: string | null;
    unseenItems: string[];
  } | null>(null);
  const pinKey = `${activeTab}|${activeFilter}|${sortBy}|${canRenderItems}|${bg.isLoading}`;
  if (pinSnapshotRef.current?.key !== pinKey) {
    pinSnapshotRef.current = {
      key: pinKey,
      equipped: data?.wardrobe?.equipped,
      bgEquipped: bg.equipped,
      unseenItems: data?.wardrobe?.unseenItems ?? [],
    };
  }
  const pinSnapshot = pinSnapshotRef.current;

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
    if (sortBy === 'latest') {
      const history = data?.wardrobe?.inventoryHistory ?? {};
      const unseenList = pinSnapshot.unseenItems;
      const unseenOrder = new Map<string, number>();
      unseenList.forEach((id, idx) => unseenOrder.set(id, idx));
      const getTs = (id: string) => {
        const iso = history[id];
        if (iso) {
          const t = new Date(iso).getTime();
          if (Number.isFinite(t)) return t;
        }
        return -1;
      };
      return [...result].sort((a, b) => {
        const aNew = unseenOrder.has(a.id);
        const bNew = unseenOrder.has(b.id);
        if (aNew !== bNew) return aNew ? -1 : 1;
        if (aNew && bNew) {
          return unseenOrder.get(b.id)! - unseenOrder.get(a.id)!;
        }
        const aTs = getTs(a.id);
        const bTs = getTs(b.id);
        if (aTs !== bTs) return bTs - aTs;
        return rarityRank[b.rarity] - rarityRank[a.rarity];
      });
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

  const equipQueue = React.useRef<Promise<void>>(Promise.resolve());

  const haptic = (ms: number) => {
    try {
      navigator.vibrate?.(ms);
    } catch {}
  };

  const sendEquip = (slot: WardrobeSlot, itemId: string | null) => {
    beginEquipMutation();
    equipQueue.current = equipQueue.current
      .then(() =>
        fetch('/api/skins/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot, itemId }),
        }).then((res) => {
          if (!res.ok) throw new Error('Failed');
        }),
      )
      .then(
        () => {
          if (endEquipMutation() === 0) mutateInventorySummary();
        },
        () => {
          endEquipMutation();
          setNotif({ msg: 'Could not update outfit.', type: 'error' });
          refreshInventory();
        },
      );
  };

  const applyEquip = (slot: WardrobeSlot, itemId: string | null) => {
    if (!data?.wardrobe) return;
    mutate(
      (curr) =>
        curr?.wardrobe
          ? {
              ...curr,
              wardrobe: {
                ...curr.wardrobe,
                equipped: { ...curr.wardrobe.equipped, [slot]: itemId },
              },
            }
          : curr,
      { revalidate: false },
    );
    sendEquip(slot, itemId);
  };

  const toggleEquip = (slot: WardrobeSlot, itemId: string) => {
    if (!data?.wardrobe?.equipped) return;
    const isEquipped = data.wardrobe.equipped[slot] === itemId;
    haptic(isEquipped ? 8 : 14);
    applyEquip(slot, isEquipped ? null : itemId);
  };

  const equipItemDirect = async (item: ItemDef) => {
    if (!data?.wardrobe?.equipped) return;
    if (data.wardrobe.equipped[item.slot] === item.id) return;
    haptic(14);
    applyEquip(item.slot, item.id);
  };

  const equippedIndices = useMemo(() => {
    const eq = data?.wardrobe?.equipped ?? {};
    const map: Record<string, number> = {};
    for (const it of data?.catalog ?? []) map[it.id] = it.riveIndex;
    const idx = (id?: string | null) =>
      id ? (map[id] ?? staticById[id]?.riveIndex ?? 0) : 0;
    return {
      skin: idx(eq.skin),
      hat: idx(eq.hat),
      body: idx(eq.body),
      hand_item: idx(eq.hand_item),
    };
  }, [data?.wardrobe?.equipped, data?.catalog]);

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

  const performItemPurchase = async (
    item: ItemDef,
    priceOverride?: number,
  ): Promise<boolean> => {
    if (!user) {
      setNotif({ msg: 'Sign in to buy items!', type: 'error' });
      return false;
    }
    if (!data?.wardrobe || buyingId) return false;
    const balance = data.wardrobe.flies ?? 0;
    const price = priceOverride ?? item.priceFlies ?? 0;
    if (balance < price) {
      setNotif({ msg: 'Not enough flies!', type: 'error' });
      setShakeBalance(true);
      setTimeout(() => setShakeBalance(false), 500);
      return false;
    }

    setBuyingId(item.id);
    try {
      mutate(
        (curr) =>
          curr?.wardrobe
            ? {
                ...curr,
                wardrobe: {
                  ...curr.wardrobe,
                  flies: (curr.wardrobe.flies ?? 0) - price,
                  inventory: {
                    ...curr.wardrobe.inventory,
                    [item.id]: (curr.wardrobe.inventory[item.id] ?? 0) + 1,
                  },
                },
              }
            : curr,
        { revalidate: false },
      );

      const res = await fetch('/api/skins/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });

      if (!res.ok) throw new Error('Failed');
      setNotif({ msg: `Purchased ${item.name}!`, type: 'success' });
      refreshInventory();
      return true;
    } catch (e) {
      setNotif({ msg: 'Purchase failed.', type: 'error' });
      refreshInventory();
      return false;
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

  const purchaseItem = purchaseCard?.kind === 'item' ? purchaseCard.item : null;
  const purchaseBg = purchaseCard?.kind === 'bg' ? purchaseCard.bg : null;
  const purchaseTarget: PurchaseTarget | null = purchaseItem
    ? {
        id: purchaseItem.id,
        name: purchaseItem.name,
        rarity: purchaseItem.rarity,
        price: purchaseDealPrice ?? purchaseItem.priceFlies ?? 0,
        originalPrice:
          purchaseDealPrice != null ? (purchaseItem.priceFlies ?? 0) : undefined,
        slotLabel: SLOT_LABEL[purchaseItem.slot],
      }
    : purchaseBg
      ? {
          id: purchaseBg.id,
          name: purchaseBg.name,
          rarity: purchaseBg.rarity,
          price: purchaseBg.priceFlies ?? 0,
          slotLabel: 'Background',
        }
      : null;
  const purchasePreview = purchaseItem ? (
    <Frog
      className="h-[118%] w-[118%] -translate-y-[14%] object-contain"
      indices={{ ...equippedIndices, [purchaseItem.slot]: purchaseItem.riveIndex }}
      width={240}
      height={240}
    />
  ) : purchaseBg ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={backgroundPreview(purchaseBg)}
      alt={purchaseBg.name}
      className="h-full w-full object-cover"
    />
  ) : null;
  const purchaseOwnedCount = purchaseItem
    ? (data?.wardrobe?.inventory?.[purchaseItem.id] ?? 0)
    : purchaseBg
      ? (bg.inventory[purchaseBg.id] ?? 0)
      : 0;

  const openItemPurchase = (item: ItemDef, dealPrice: number | null = null) => {
    setPurchaseDealPrice(dealPrice);
    setPurchaseCard({
      kind: 'item',
      id: item.id,
      rarity: item.rarity,
      price: dealPrice ?? item.priceFlies ?? 0,
      item,
    });
  };

  const openBgPurchase = (bgItem: BackgroundItem) => {
    setPurchaseDealPrice(null);
    setPurchaseCard({
      kind: 'bg',
      id: bgItem.id,
      rarity: bgItem.rarity,
      price: bgItem.priceFlies ?? 0,
      bg: bgItem,
    });
  };

  const renderInventoryCard = (card: WardrobeCard, index: number) =>
    card.kind === 'item' ? (
      <ItemCard
        key={card.item.id}
        item={card.item}
        mode="inventory"
        ownedCount={data?.wardrobe?.inventory?.[card.item.id] ?? 0}
        isEquipped={
          data?.wardrobe?.equipped?.[card.item.slot] === card.item.id
        }
        canAfford={true}
        actionLoading={false}
        onAction={() => handleItemAction(card.item)}
        onSell={() => {
          setItemToSell(card.item);
        }}
        actionLabel={null}
        isNew={unseenInventorySet.has(card.item.id)}
        deferPreview
        giftAnimation="box_shake"
        pausePreview={
          (card.item.slot !== 'container' && isDragging) ||
          (card.item.slot !== 'container' &&
            data?.wardrobe?.equipped?.[card.item.slot] !== card.item.id)
        }
        previewDelayMs={index * 20}
      />
    ) : (
      <BackgroundCard
        key={`bg-${card.bg.id}`}
        item={card.bg}
        owned={(bg.inventory[card.bg.id] ?? 0) > 0}
        ownedCount={bg.inventory[card.bg.id] ?? 0}
        isEquipped={bg.equipped === card.bg.id}
        canAfford={bg.balance >= card.bg.priceFlies}
        mode="inventory"
        actionLoading={bg.busyId === card.bg.id}
        onAction={() => bg.handleEquip(card.bg)}
        onSell={() => bg.setSellTarget(card.bg)}
      />
    );

  const renderShopCard = (card: WardrobeCard, index: number) =>
    card.kind === 'item' ? (
      <ItemCard
        key={card.item.id}
        item={card.item}
        mode="shop"
        ownedCount={data?.wardrobe?.inventory?.[card.item.id] ?? 0}
        isEquipped={false}
        canAfford={balance >= (card.item.priceFlies ?? 0) && !isGuest}
        actionLoading={buyingId === card.item.id}
        onAction={() => openItemPurchase(card.item)}
        deferPreview
        pausePreview={card.item.slot !== 'container'}
        previewDelayMs={index * 20}
      />
    ) : (
      <BackgroundCard
        key={`bg-${card.bg.id}`}
        item={card.bg}
        owned={(bg.inventory[card.bg.id] ?? 0) > 0}
        ownedCount={bg.inventory[card.bg.id] ?? 0}
        isEquipped={bg.equipped === card.bg.id}
        canAfford={bg.balance >= card.bg.priceFlies && !isGuest}
        mode="shop"
        actionLoading={bg.busyId === card.bg.id}
        onAction={() => openBgPurchase(card.bg)}
      />
    );

  return (
    <div
      className={cn(
        'flex flex-col',
        embedded
          ? 'flex-1 bg-transparent'
          : 'h-full overflow-hidden rounded-[32px] border border-border/50 bg-background shadow-sm',
      )}
    >
      {/* --- HEADER --- */}
      {!embedded && (
        <div
          onPointerDown={(e) => !isDesktop && dragControls?.start(e)}
          className="px-4 py-4 border-b md:px-6 shrink-0 border-border/50"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                Style Studio
              </p>
              <div className="min-w-0">
                <h2 className="text-3xl font-black leading-none tracking-tight text-foreground">
                  Wardrobe
                </h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  Customize your frog and preview changes live.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          'flex flex-col',
          embedded
            ? 'flex-1 bg-transparent'
            : isDesktop
              ? 'flex-1 min-h-0 bg-background/50 backdrop-blur-2xl'
              : 'flex-1 min-h-0 bg-transparent',
        )}
      >
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className={cn('flex flex-col', embedded ? 'flex-1' : 'h-full')}
        >
          {embedded && (
            <div ref={stickySentinelRef} aria-hidden className="h-px -mb-px" />
          )}
          <div
            className={cn(
              'shrink-0',
              embedded
                ? cn(
                    'sticky top-0 z-50',
                    isStuck
                      ? '-mx-4 px-4 md:-mx-6 md:px-6 pt-[calc(env(safe-area-inset-top)+4.25rem)] md:pt-3 pb-3'
                      : 'mt-[68px] pt-2 pb-0 md:mt-0',
                  )
                : 'relative z-40 space-y-2 px-4 pt-0 md:space-y-2 md:px-6 md:pt-2',
            )}
          >
            {embedded && (
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-1/2 top-0 bottom-0 -z-10 w-screen -translate-x-1/2',
                  'border-b border-border/50 bg-background',
                  'shadow-lg shadow-black/5 dark:shadow-black/20',
                  isStuck ? 'opacity-100' : 'opacity-0',
                )}
              />
            )}
            <div
              className={cn(
                embedded
                  ? 'flex'
                  : 'relative z-10 flex items-center justify-between gap-2 md:gap-4',
              )}
            >
              <TabsList
                className={cn(
                  'p-1 rounded-[18px] border border-border/50 flex items-center gap-1',
                  embedded
                    ? cn(
                        'mx-auto w-full h-12 bg-muted',
                        'transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                        isStuck
                          ? 'translate-y-0 shadow-sm border-border/60'
                          : '-translate-y-3.5 shadow-lg md:translate-y-16',
                      )
                    : cn(
                        'h-10 md:h-11 flex-1 shadow-sm',
                        isDesktop
                          ? 'bg-card/80 backdrop-blur-2xl'
                          : 'bg-muted/30',
                      ),
                )}
              >
                <TabsTrigger
                  value="inventory"
                  className={tabTriggerClass}
                  onClick={scrollPageToTop}
                >
                  <Shirt className="w-4 h-4" />
                  <span className="hidden xs:inline">Wardrobe</span>
                  <span className="xs:hidden">INV</span>
                </TabsTrigger>
                <TabsTrigger
                  value="shop"
                  className={tabTriggerClass}
                  onClick={scrollPageToTop}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Shop</span>
                </TabsTrigger>
                <TabsTrigger
                  value="trade"
                  className={tabTriggerClass}
                  onClick={scrollPageToTop}
                >
                  <Repeat className="w-4 h-4" />
                  <span>Trade</span>
                </TabsTrigger>
              </TabsList>

              {!embedded && (
                <SortMenu
                  value={sortBy}
                  onChange={setSortBy}
                  showLatest={activeTab === 'inventory'}
                />
              )}
            </div>

            <div
              className={cn(
                'relative z-10 flex items-center',
                embedded
                  ? cn(
                      '-mx-4 px-4 md:-mx-6 md:px-6 bg-background',
                      isStuck
                        ? 'mt-2 rounded-t-none pt-0'
                        : 'mt-6 rounded-t-[24px] pt-3 md:mt-20',
                    )
                  : 'mt-2 w-full min-w-0',
              )}
            >
              <div className="flex-1 min-w-0">
                <FilterBar
                  active={
                    activeFilter === 'container' && activeTab !== 'inventory'
                      ? 'all'
                      : activeFilter
                  }
                  onChange={handleFilterChange}
                  badges={filterBadges}
                  options={
                    activeTab !== 'inventory'
                      ? [
                          {
                            id: 'all',
                            label: 'All Items',
                            icon: <Sparkles className="w-5 h-5" />,
                          },
                          {
                            id: 'skin',
                            label: 'Skins',
                            icon: <Paintbrush className="w-5 h-5" />,
                          },
                          {
                            id: 'hat',
                            label: 'Hats',
                            icon: <Crown className="w-5 h-5" />,
                          },
                          {
                            id: 'body',
                            label: 'Body',
                            icon: <Shirt className="w-5 h-5" />,
                          },
                          {
                            id: 'held',
                            label: 'Held',
                            icon: <Hand className="w-5 h-5" />,
                          },
                          {
                            id: 'background',
                            label: 'Backgrounds',
                            icon: <ImageIcon className="w-5 h-5" />,
                          },
                        ]
                      : [
                          {
                            id: 'all',
                            label: 'All Items',
                            icon: <Sparkles className="w-5 h-5" />,
                          },
                          {
                            id: 'container',
                            label: 'Gifts',
                            icon: <Gift className="w-5 h-5" />,
                          },
                          {
                            id: 'skin',
                            label: 'Skins',
                            icon: <Paintbrush className="w-5 h-5" />,
                          },
                          {
                            id: 'hat',
                            label: 'Hats',
                            icon: <Crown className="w-5 h-5" />,
                          },
                          {
                            id: 'body',
                            label: 'Body',
                            icon: <Shirt className="w-5 h-5" />,
                          },
                          {
                            id: 'held',
                            label: 'Held',
                            icon: <Hand className="w-5 h-5" />,
                          },
                          {
                            id: 'background',
                            label: 'Backgrounds',
                            icon: <ImageIcon className="w-5 h-5" />,
                          },
                        ]
                  }
                />
              </div>
              {embedded && (
                <div
                  className={cn(
                    'relative z-10 flex shrink-0 items-center self-stretch border-l border-border/40 pl-3',
                    'bg-background',
                  )}
                >
                  <SortMenu
                    value={sortBy}
                    onChange={setSortBy}
                    showLatest={activeTab === 'inventory'}
                  />
                </div>
              )}
            </div>
          </div>

          <div
            className={cn(
              embedded
                ? 'relative flex-1 -mx-4 px-4 md:-mx-6 md:px-6 bg-background pt-5 pb-2 rounded-t-[24px] md:pt-3 md:rounded-t-none'
                : 'relative mt-4 flex-1 overflow-hidden rounded-t-[24px] border-t border-border/40',
              embedded &&
                activeTab === 'trade' &&
                'lg:mx-[calc(50%-50vw)] lg:px-[calc((100vw-min(1100px,100vw-3rem))/2)]',
              embedded
                ? ''
                : isDesktop
                  ? 'bg-card/40 backdrop-blur-md'
                  : 'bg-card/20',
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
                bindScroll?.(node);
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
                  shouldLoadMoreFromWheel(event.currentTarget, event.deltaY)
                ) {
                  inventoryGrid.loadMore();
                }
              }}
              className={cn(
                embedded
                  ? 'relative'
                  : 'absolute inset-0 overflow-y-auto overscroll-none',
                'rounded-[20px] border border-border/40 bg-muted/40 p-3 md:p-4 data-[state=inactive]:hidden',
              )}
            >
              {!canRenderItems ? (
                <WardrobeGridSkeleton />
              ) : activeTab === 'inventory' &&
                inventoryItems.length === 0 &&
                inventoryBackgrounds.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh] opacity-50">
                  <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full md:w-24 md:h-24 bg-secondary">
                    <Shirt className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-black text-muted-foreground">
                    Empty
                  </p>
                </div>
              ) : activeTab === 'inventory' ? (
                <>
                  {(() => {
                    const merged = mergeWardrobeCards(
                      inventoryGrid.visibleItems,
                      inventoryBackgrounds,
                      sortBy,
                    );
                    let cardIndex = 0;
                    const section = (
                      key: string,
                      label: React.ReactNode,
                      labelClass: string,
                      cards: WardrobeCard[],
                    ) =>
                      cards.length ? (
                        <div key={key} className="pb-2 last:pb-4">
                          <p
                            className={cn(
                              'mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em]',
                              labelClass,
                            )}
                          >
                            {label}
                          </p>
                          <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                            {cards.map((card) =>
                              renderInventoryCard(card, cardIndex++),
                            )}
                          </div>
                        </div>
                      ) : null;

                    if (sortBy === 'price_asc' || sortBy === 'price_desc') {
                      const cards = pinEquippedFirst(
                        merged,
                        pinSnapshot.equipped,
                        pinSnapshot.bgEquipped,
                      );
                      return (
                        <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-4">
                          {cards.map((card, index) =>
                            renderInventoryCard(card, index),
                          )}
                        </div>
                      );
                    }

                    if (sortBy === 'rarity_asc' || sortBy === 'rarity_desc') {
                      return groupCardsByRarity(merged).map((group) =>
                        section(
                          group.rarity,
                          RARITY_CONFIG[group.rarity].label,
                          RARITY_CONFIG[group.rarity].text,
                          group.cards,
                        ),
                      );
                    }

                    const isWorn = (card: WardrobeCard) =>
                      card.kind === 'item'
                        ? pinSnapshot.equipped?.[card.item.slot] ===
                          card.item.id
                        : card.bg.id === pinSnapshot.bgEquipped;
                    const worn: WardrobeCard[] = [];
                    const fresh: WardrobeCard[] = [];
                    const rest: WardrobeCard[] = [];
                    for (const card of merged) {
                      if (isWorn(card)) worn.push(card);
                      else if (
                        card.kind === 'item' &&
                        pinSnapshot.unseenItems.includes(card.item.id)
                      )
                        fresh.push(card);
                      else rest.push(card);
                    }
                    rest.sort(
                      (a, b) => rarityRank[b.rarity] - rarityRank[a.rarity],
                    );
                    return (
                      <>
                        {section(
                          'worn',
                          'On your frog',
                          'text-emerald-600',
                          worn,
                        )}
                        {section('new', 'New', 'text-rose-500', fresh)}
                        {groupCardsByRarity(rest).map((group) =>
                          section(
                            group.rarity,
                            RARITY_CONFIG[group.rarity].label,
                            RARITY_CONFIG[group.rarity].text,
                            group.cards,
                          ),
                        )}
                      </>
                    );
                  })()}
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
                bindScroll?.(node);
              }}
              onScroll={(event) => {
                setShopHasScrolled(true);
                if (shopGrid.hasMore && isNearScrollEnd(event.currentTarget)) {
                  shopGrid.loadMore();
                }
              }}
              onWheel={(event) => {
                setShopHasScrolled(true);
                if (
                  shopGrid.hasMore &&
                  shouldLoadMoreFromWheel(event.currentTarget, event.deltaY)
                ) {
                  shopGrid.loadMore();
                }
              }}
              className={cn(
                embedded
                  ? 'relative'
                  : 'absolute inset-0 overflow-y-auto overscroll-none',
                'rounded-[20px] border border-border/40 bg-muted/40 p-3 md:p-4 data-[state=inactive]:hidden',
              )}
            >
              {!canRenderItems ? (
                <WardrobeGridSkeleton />
              ) : activeTab === 'shop' ? (
                <>
                  {activeFilter === 'all' && !!data?.dailyDeals?.length && (
                    <DailyDealsShelf
                      deals={data.dailyDeals}
                      catalog={data?.catalog ?? []}
                      isPremium={!!data.isPremium}
                      onBuy={(item, dealPrice) =>
                        openItemPurchase(item, dealPrice)
                      }
                      onUpgrade={() => setPlusOpen(true)}
                    />
                  )}
                  {activeFilter === 'all' && !isGuest && (
                    <SeenOnFriendsRow
                      enabled={activeTab === 'shop'}
                      catalog={data?.catalog ?? []}
                      backgrounds={bg.catalog}
                      ownedItems={data?.wardrobe?.inventory ?? {}}
                      ownedBackgrounds={bg.inventory}
                      onPickItem={(item) => openItemPurchase(item)}
                      onPickBackground={openBgPurchase}
                    />
                  )}
                  {activeFilter === 'all' && (
                    <div className="mb-3">
                      <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                        Boosts
                      </p>
                      <StreakFreezeShopCard />
                    </div>
                  )}
                  {(() => {
                    const cards = mergeWardrobeCards(
                      shopGrid.visibleItems,
                      shopBackgrounds,
                      sortBy,
                    );
                    if (sortBy !== 'rarity_asc' && sortBy !== 'rarity_desc') {
                      return (
                        <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-4">
                          {cards.map((card, index) =>
                            renderShopCard(card, index),
                          )}
                        </div>
                      );
                    }
                    let cardIndex = 0;
                    return groupCardsByRarity(cards).map((group) => (
                      <div key={group.rarity} className="pb-2 last:pb-4">
                        <p
                          className={cn(
                            'mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em]',
                            RARITY_CONFIG[group.rarity].text,
                          )}
                        >
                          {RARITY_CONFIG[group.rarity].label}
                        </p>
                        <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                          {group.cards.map((card) =>
                            renderShopCard(card, cardIndex++),
                          )}
                        </div>
                      </div>
                    ));
                  })()}
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
              className={cn(
                embedded ? 'relative' : 'absolute inset-0 overflow-hidden',
                'data-[state=inactive]:hidden',
              )}
            >
              {!canRenderItems ? (
                <WardrobeGridSkeleton />
              ) : activeTab === 'trade' &&
                data?.wardrobe?.inventory &&
                data.catalog ? (
                <TradePanel
                  inventory={data.wardrobe.inventory}
                  catalog={data.catalog}
                  backgrounds={bg.catalog}
                  backgroundInventory={bg.inventory}
                  unseenItems={unseenItems}
                  onTradeSuccess={refreshInventory}
                  activeFilter={
                    activeFilter === 'container' ? 'all' : activeFilter
                  }
                  sortBy={sortBy}
                  paused={isDragging}
                  pageScroll={embedded}
                />
              ) : null}
            </TabsContent>

            {activeTab === 'inventory' && inventoryGrid.hasMore && (
              <ScrollMoreCue />
            )}
            {activeTab === 'shop' && shopGrid.hasMore && <ScrollMoreCue />}
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

      <SellConfirmationDialog
        open={!!bg.sellTarget}
        onClose={() => bg.setSellTarget(null)}
        onConfirm={bg.confirmSell}
        item={
          bg.sellTarget
            ? {
                id: bg.sellTarget.id,
                name: bg.sellTarget.name,
                rarity: bg.sellTarget.rarity,
                priceFlies: bg.sellTarget.priceFlies,
              }
            : null
        }
        imageUrl={bg.sellTarget ? backgroundPreview(bg.sellTarget) : undefined}
        ownedCount={bg.sellTarget ? (bg.inventory[bg.sellTarget.id] ?? 0) : 0}
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

      <PurchaseSheet
        open={!!purchaseCard}
        onClose={() => {
          setPurchaseCard(null);
          setPurchaseDealPrice(null);
        }}
        target={purchaseTarget}
        preview={purchasePreview}
        balance={balance}
        ownedCount={purchaseOwnedCount}
        isGuest={isGuest}
        equipLabel={purchaseBg ? 'Use background' : 'Equip now'}
        onBuy={async () => {
          if (purchaseItem)
            return performItemPurchase(
              purchaseItem,
              purchaseDealPrice ?? undefined,
            );
          if (purchaseBg) return bg.buyNow(purchaseBg);
          return false;
        }}
        onEquip={async () => {
          if (purchaseItem) await equipItemDirect(purchaseItem);
          else if (purchaseBg) await bg.handleEquip(purchaseBg);
        }}
      />

      <PlusUpgradeModal open={plusOpen} onClose={() => setPlusOpen(false)} />
    </div>
  );
}

function ScrollMoreCue() {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center pt-10 pb-4 pointer-events-none bg-gradient-to-t from-background/95 via-background/60 to-transparent">
      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">
        <ChevronDown className="h-3.5 w-3.5 animate-bounce text-primary" />
        <span>Scroll for more</span>
      </div>
    </div>
  );
}
