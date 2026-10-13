import {
  beginEquipMutation,
  endEquipMutation,
  mutateInventoryCaches,
  mutateInventorySummary,
  useInventory,
} from '@/hooks/useInventory';
import { hapticTick, hapticImpact, hapticSelect } from '@/lib/haptics';
import { useMemo, useState, useEffect } from 'react';
import React from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Shirt,
  Check,
  Sparkles,
  Paintbrush,
  Crown,
  Hand,
  Image as ImageIcon,
  Gift,
} from 'lucide-react';
import type { ItemDef, Rarity, WardrobeSlot } from '@/lib/skins/catalog';
import {
  rarityRank,
  byId as staticById,
  isTradeOnlyRarity,
} from '@/lib/skins/catalog';
import { useTradeReadiness } from '@/hooks/useReadyTrades';
import Frog from '@/components/ui/frog';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { useIntros } from '@/hooks/useIntros';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { GiftOddsButton } from './ItemCard';
import { PurchaseSheet, type PurchaseTarget } from './PurchaseSheet';
import { FilterBar, FilterCategory } from './FilterBar';
import { SortMenu, SortOrder } from './SortMenu';
import { cn } from '@/lib/utils';
import { type DragControls } from 'framer-motion';
import { BaseSheet } from '@/components/ui/BaseSheet';

import { TradePanel } from './TradePanel';
import GiftBoxOpening from '@/components/ui/gift-box/GiftBoxOpening';
import { DailyDealsShelf } from './DailyDealsShelf';
import { ShopGiftPopup } from '@/components/ui/shop/ShopGiftPopup';
import { GiftBadge } from '@/components/ui/GiftBadge';
import { WishlistButton } from './WishlistButton';
import { WishlistShelf } from './WishlistShelf';
import { WishlistSheet } from './WishlistSheet';
import { SeenOnFriendsRow } from './SeenOnFriendsRow';
import { SavedLooksButton } from './LooksRow';
import { backgroundFadeMaskStyle } from '@/lib/backgrounds/fadeMask';
import { WardrobeEmptyState } from './WardrobeEmptyState';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { WardrobeGridSkeleton } from '@/components/ui/Skeleton';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { mutateBackgrounds, type BackgroundItem } from '@/hooks/useBackgrounds';
import {
  useBackgroundActions,
  backgroundPreview,
} from '@/hooks/useBackgroundActions';
import { useUIStore } from '@/lib/uiStore';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useWishlist } from '@/hooks/useWishlist';
import {
  buildWishlistEntries,
  wishlistBucket,
  type WishlistEntry,
} from '@/lib/skins/wishlist';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { celebratePurchase } from '@/lib/purchaseCelebration';
import {
  rewardedAdsAvailable,
  rewardedAdFailureMessage,
  showRewardedAd,
  takePlusOfferAfterAd,
} from '@/lib/ads';
import { useRewardedAdPreload } from '@/hooks/useRewardedAdPreload';
import {
  CollectionBook,
  DealTileRow,
  RarityRail,
  TryOnBar,
  YoursCard,
  summarizeCloset,
  type ClosetSlot,
} from './DressingRoom';
import {
  useWardrobeTryOn,
  WARDROBE_EQUIPPED_EVENT,
} from '@/lib/wardrobeTryOnStore';

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

const SLOT_LABEL: Record<WardrobeSlot, string> = {
  skin: 'Skin',
  hat: 'Hat',
  body: 'Body',
  hand_item: 'Held',
  container: 'Gift',
};

/* ---------------- Main Panel ---------------- */
const normalizeTab = (tab: string) => (tab === 'shop' ? 'inventory' : tab);

/** The badge is one number for several tiers, so its tooltip names them. */
function tradeReadyTitle(
  trades: number,
  byRarity: Partial<Record<string, number>>,
) {
  const label = `${trades} trade${trades === 1 ? '' : 's'} ready`;
  const parts = Object.entries(byRarity)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([rarity, count]) => `${count}× ${rarity}`);
  return parts.length > 0 ? `${label} — ${parts.join(', ')}` : label;
}

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
  focusItemId = null,
  focusItemKind = 'item',
  stage,
  stageBackground,
  onClose,
}: {
  defaultTab?: 'inventory' | 'shop' | 'trade';
  focusItemId?: string | null;
  focusItemKind?: 'item' | 'background';
  stage?: React.ReactNode;
  stageBackground?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col flex-1">
      <WardrobeManagerContent
        open={true}
        defaultTab={defaultTab}
        focusItemId={focusItemId}
        focusItemKind={focusItemKind}
        stage={stage}
        stageBackground={stageBackground}
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
  focusItemId = null,
  focusItemKind = 'item',
  stage,
  stageBackground,
  embedded,
  isDesktop,
  isDragging,
  dragControls,
  bindScroll,
}: {
  open: boolean;
  onClose: () => void;
  defaultTab: 'inventory' | 'shop' | 'trade';
  focusItemId?: string | null;
  focusItemKind?: 'item' | 'background';
  stage?: React.ReactNode;
  stageBackground?: React.ReactNode;
  embedded: boolean;
  isDesktop: boolean;
  isDragging: boolean;
  dragControls?: DragControls;
  bindScroll?: (el: HTMLElement | null) => void;
}) {
  const { user } = useAuth();
  const { data, mutate, unseenItems, unseenContainers, markItemSeen } =
    useInventory(open);

  const tradeReadiness = useTradeReadiness(!!user);
  const readyTrades = tradeReadiness.trades;

  const [activeTab, setActiveTab] = useState<string>(normalizeTab(defaultTab));
  useEffect(() => {
    setActiveTab(normalizeTab(defaultTab));
  }, [defaultTab]);
  useEffect(() => {
    setSortBy(
      activeTab === 'inventory'
        ? 'latest'
        : activeTab === 'shop'
          ? 'featured'
          : 'rarity_asc',
    );
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
  const [plusPlacement, setPlusPlacement] = useState('premium_daily_deal');
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const pendingDealRerollRef = React.useRef(false);
  const openPlus = (placement: string) => {
    pendingDealRerollRef.current = false;
    setPlusPlacement(placement);
    setPlusOpen(true);
  };
  const [sortBy, setSortBy] = useState<SortOrder>('latest');
  const { showNotification } = useNotification();
  const setNotif = React.useCallback(
    (n: { msg: string; type: 'error' | 'success' } | null) => {
      if (n) showNotification(n.msg);
    },
    [showNotification],
  );
  const [openingGiftId, setOpeningGiftId] = useState<string | null>(null);

  const bg = useBackgroundActions({
    isGuest: !user,
    onNotify: (n) => setNotif(n),
    shopBalance: data?.wardrobe?.flies ?? 0,
    onSpend: () => refreshInventory(),
  });
  const setWardrobeTab = useUIStore((s) => s.setWardrobeTab);
  const setLastWardrobeTab = useUIStore((s) => s.setLastWardrobeTab);
  const openFlyShop = useUIStore((s) => s.openFlyShop);
  React.useEffect(() => {
    if (!embedded) return;
    setWardrobeTab(activeTab);
    setLastWardrobeTab(activeTab);
    return () => setWardrobeTab('inventory');
  }, [embedded, activeTab, setWardrobeTab, setLastWardrobeTab]);

  const shopGiftReady = activeTab !== 'shop' && !!data?.shopGift?.available;
  const tradeTabBadge = activeTab === 'trade' ? 0 : readyTrades;

  const tabTriggerClass = cn(
    'flex-1 min-w-0 h-full rounded-2xl relative flex items-center justify-center gap-1.5 whitespace-nowrap',
    '[@media(max-width:340px)]:text-[12px]',
    'text-[13px] md:text-sm font-bold tracking-wide transition-colors',
    embedded
      ? 'data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm'
      : 'data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none',
    'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground',
  );

  const unseenInventorySet = useMemo(
    () => new Set(data?.wardrobe?.unseenItems ?? []),
    [data?.wardrobe?.unseenItems],
  );

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

  const [rerolling, setRerolling] = useState(false);

  useRewardedAdPreload('shop_reroll', !data?.isPremium);

  const rerollDeals = async (asPlus = false) => {
    if (rerolling) return;
    const isPlus = asPlus || !!data?.isPremium;
    if (!isPlus && !rewardedAdsAvailable()) {
      openPlus('shop_reroll');
      pendingDealRerollRef.current = true;
      return;
    }
    setRerolling(true);
    hapticImpact();
    try {
      if (!isPlus) {
        const adResult = await showRewardedAd('shop_reroll');
        if (adResult !== 'rewarded') {
          if (adResult === 'failed') {
            setNotif({
              msg: rewardedAdFailureMessage(),
              type: 'error',
            });
          }
          return;
        }
      }
      const res = await fetch('/api/skins/deals/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          viaAd: !isPlus,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotif({
          msg: payload?.error ?? 'Could not reroll deals.',
          type: 'error',
        });
        refreshInventory();
        return;
      }
      mutate(
        (curr) =>
          curr
            ? {
                ...curr,
                dailyDeals: payload.dailyDeals,
                dealRerollsLeft: payload.rerollsLeft,
                dealRerollsAllowed: payload.rerollsAllowed,
              }
            : curr,
        { revalidate: false },
      );
      mutateInventoryCaches();
      if (!isPlus && takePlusOfferAfterAd()) {
        setTimeout(() => openPlus('premium_daily_deal'), 1200);
      }
    } catch {
      setNotif({ msg: 'Could not reroll deals.', type: 'error' });
    } finally {
      setRerolling(false);
    }
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

  const equipQueue = React.useRef<Promise<void>>(Promise.resolve());

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
    hapticSelect();
    applyEquip(slot, isEquipped ? null : itemId);
  };

  const equipItemDirect = async (item: ItemDef) => {
    if (!data?.wardrobe?.equipped) return;
    if (data.wardrobe.equipped[item.slot] === item.id) return;
    hapticSelect();
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

  const { seenIntros, markIntroSeen } = useIntros(!!user);
  const neverWorn = !Object.values(data?.wardrobe?.equipped ?? {}).some(Boolean);
  const showTapToWear =
    !!user && seenIntros !== undefined && !seenIntros.tapToWear && neverWorn;

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
      if (showTapToWear) markIntroSeen('tapToWear');
      toggleEquip(item.slot, item.id);
    }
  };

  const setStageTryOn = useWardrobeTryOn((st) => st.setTryOn);
  const [tryTarget, setTryTarget] = useState<
    | { kind: 'item'; item: ItemDef; dealPrice: number | null }
    | { kind: 'bg'; bg: BackgroundItem }
    | null
  >(null);
  const clearTryOn = React.useCallback(() => {
    setTryTarget(null);
    setStageTryOn(null);
  }, [setStageTryOn]);
  useEffect(() => clearTryOn, [clearTryOn]);
  useEffect(() => {
    clearTryOn();
  }, [activeTab, clearTryOn]);

  const announceEquip = () =>
    window.dispatchEvent(new Event(WARDROBE_EQUIPPED_EVENT));

  const [tryBuying, setTryBuying] = useState(false);
  const [justBought, setJustBought] = useState<
    | { kind: 'item'; item: ItemDef }
    | { kind: 'bg'; bg: BackgroundItem }
    | null
  >(null);
  const clearJustBought = React.useCallback(() => setJustBought(null), []);
  const stageAnchor = () =>
    document.querySelector<HTMLElement>('[data-fly-hero-frog]');
  const buyTriedOn = async () => {
    if (!tryTarget || tryBuying) return;
    setTryBuying(true);
    try {
      if (tryTarget.kind === 'item') {
        const ok = await performItemPurchase(
          tryTarget.item,
          tryTarget.dealPrice ?? undefined,
        );
        if (ok) {
          clearTryOn();
          applyEquip(tryTarget.item.slot, tryTarget.item.id);
          announceEquip();
          setJustBought({ kind: 'item', item: tryTarget.item });
          celebratePurchase(
            {
              id: tryTarget.item.id,
              name: tryTarget.item.name,
              rarity: tryTarget.item.rarity,
            },
            stageAnchor(),
          );
        }
      } else {
        const ok = await bg.buyNow(tryTarget.bg);
        if (ok) {
          clearTryOn();
          await bg.handleEquip(tryTarget.bg);
          announceEquip();
          setJustBought({ kind: 'bg', bg: tryTarget.bg });
          celebratePurchase(
            {
              id: tryTarget.bg.id,
              name: tryTarget.bg.name,
              rarity: tryTarget.bg.rarity as Rarity,
            },
            stageAnchor(),
          );
        }
      }
    } finally {
      setTryBuying(false);
    }
  };

  const tapClosetItem = (item: ItemDef, dealPrice: number | null) => {
    if (unseenInventorySet.has(item.id)) markItemSeen(item.id);
    const owned = (data?.wardrobe?.inventory?.[item.id] ?? 0) > 0;
    if (owned) {
      if (!user) {
        setNotif({ msg: 'Sign in to equip items!', type: 'error' });
        return;
      }
      clearTryOn();
      const wearing = data?.wardrobe?.equipped?.[item.slot] === item.id;
      toggleEquip(item.slot, item.id);
      if (!wearing) announceEquip();
      return;
    }
    if (tryTarget?.kind === 'item' && tryTarget.item.id === item.id) {
      hapticTick();
      clearTryOn();
      return;
    }
    hapticSelect();
    setTryTarget({ kind: 'item', item, dealPrice });
    setStageTryOn({
      kind: 'item',
      id: item.id,
      slot: item.slot,
      riveIndex: item.riveIndex,
      rarity: item.rarity,
    });
  };

  const tapClosetBackground = (bgItem: BackgroundItem) => {
    const owned = (bg.inventory[bgItem.id] ?? 0) > 0;
    if (owned) {
      clearTryOn();
      if (bg.equipped !== bgItem.id) announceEquip();
      void bg.handleEquip(bgItem);
      return;
    }
    if (tryTarget?.kind === 'bg' && tryTarget.bg.id === bgItem.id) {
      hapticTick();
      clearTryOn();
      return;
    }
    hapticSelect();
    setTryTarget({ kind: 'bg', bg: bgItem });
    setStageTryOn({
      kind: 'bg',
      id: bgItem.id,
      images: bgItem.images,
      rarity: bgItem.rarity as Rarity,
    });
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
    if (isTradeOnlyRarity(item.rarity)) {
      setNotif({ msg: 'This one is trade-only.', type: 'error' });
      return false;
    }
    const balance = data.wardrobe.flies ?? 0;
    const price = priceOverride ?? item.priceFlies ?? 0;
    if (balance < price) {
      setNotif({ msg: 'Not enough flies!', type: 'error' });
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
                    [item.id]: (curr.wardrobe.inventory?.[item.id] ?? 0) + 1,
                  },
                },
              }
            : curr,
        { revalidate: false },
      );

      const res = await fetch('/api/skins/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!res.ok) throw new Error('Failed');
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

  const closetSlot: ClosetSlot =
    activeFilter === 'held'
      ? 'hand_item'
      : activeFilter === 'skin' ||
          activeFilter === 'hat' ||
          activeFilter === 'body' ||
          activeFilter === 'background'
        ? activeFilter
        : 'all';
  const raritySummary = useMemo(
    () =>
      summarizeCloset(
        closetSlot,
        data?.catalog ?? [],
        bg.catalog,
        data?.wardrobe?.inventory ?? {},
        bg.inventory,
      ),
    [closetSlot, data?.catalog, bg.catalog, data?.wardrobe?.inventory, bg.inventory],
  );
  const [activeShelf, setActiveShelf] = useState<Rarity | null>(null);
  const stickyBottom = () => {
    const group = document.querySelector<HTMLElement>('[data-wardrobe-sticky]');
    if (!group) return 0;
    const rect = group.getBoundingClientRect();
    const stuckTop = window.matchMedia('(min-width: 768px)').matches ? -96 : -90;
    return rect.top <= stuckTop + 1 ? rect.bottom : group.offsetHeight + stuckTop;
  };
  useEffect(() => {
    if (!embedded || activeTab !== 'inventory') return;
    const root = document.getElementById('main-scroll');
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = stickyBottom() + 24;
      let current: Rarity | null = null;
      document
        .querySelectorAll<HTMLElement>('[data-shelf]')
        .forEach((shelf) => {
          if (shelf.getBoundingClientRect().top <= line)
            current = shelf.dataset.shelf as Rarity;
        });
      setActiveShelf((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [embedded, activeTab, activeFilter]);
  const jumpToShelf = (rarity: Rarity) => {
    const root = document.getElementById('main-scroll');
    const shelf = document.querySelector<HTMLElement>(`[data-shelf="${rarity}"]`);
    if (!root || !shelf) return;
    hapticTick();
    const top =
      root.scrollTop +
      shelf.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      stickyBottom() -
      10;
    root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const dealPrices = useMemo(
    () =>
      new Map(
        (data?.dailyDeals ?? [])
          .filter((deal) => deal.onSale)
          .map((deal) => [deal.itemId, deal.dealPrice] as const),
      ),
    [data?.dailyDeals],
  );
  const ownedGiftCards = useMemo<WardrobeCard[]>(
    () =>
      (data?.catalog ?? [])
        .filter(
          (item) =>
            item.slot === 'container' &&
            (data?.wardrobe?.inventory?.[item.id] ?? 0) > 0,
        )
        .sort((a, b) => rarityRank[b.rarity] - rarityRank[a.rarity])
        .map((item) => ({
          kind: 'item' as const,
          id: item.id,
          rarity: item.rarity,
          price: item.priceFlies ?? 0,
          item,
        })),
    [data?.catalog, data?.wardrobe?.inventory],
  );
  const newOwnedCards = useMemo<WardrobeCard[]>(
    () =>
      (data?.catalog ?? [])
        .filter(
          (item) =>
            item.slot !== 'container' &&
            unseenInventorySet.has(item.id) &&
            (data?.wardrobe?.inventory?.[item.id] ?? 0) > 0,
        )
        .map((item) => ({
          kind: 'item' as const,
          id: item.id,
          rarity: item.rarity,
          price: item.priceFlies ?? 0,
          item,
        })),
    [data?.catalog, data?.wardrobe?.inventory, unseenInventorySet],
  );

  const balance = data?.wardrobe?.flies ?? 0;
  const isGuest = !user;

  const { remove: removeFromWishlist, busy: wishlistBusy } = useWishlist(false);
  const wishlistEntries = useMemo(
    () => buildWishlistEntries(data?.wishlistItems, data?.dailyDeals, balance),
    [data?.wishlistItems, data?.dailyDeals, balance],
  );
  const wishlistSlots = data?.wishlistSlots ?? {
    used: wishlistEntries.length,
    max: 0,
  };
  const wishlistedItemIds = useMemo(
    () =>
      new Set(
        (data?.wishlistItems ?? [])
          .filter((entry) => entry.kind === 'item')
          .map((entry) => entry.itemId),
      ),
    [data?.wishlistItems],
  );
  const wishlistReadyCount = wishlistEntries.filter((entry) => {
    const bucket = wishlistBucket(entry);
    return bucket === 'ready' || bucket === 'deal';
  }).length;
  const dealsVisible = activeFilter === 'all' && !!data?.dailyDeals?.length;
  const shelfWishlistEntries = wishlistEntries.filter(
    (entry) => !(dealsVisible && entry.onDeal),
  );

  const openWishlist = () => {
    setWishlistOpen(true);
    trackAnalyticsEvent('wishlist_opened', {
      tab: activeTab,
      count: wishlistEntries.length,
      ready: wishlistReadyCount,
    });
  };
  const openWishlistEntry = (entry: WishlistEntry) => {
    if (entry.view.kind === 'background') {
      const bgItem = bg.catalog.find(
        (candidate) => candidate.id === entry.view.itemId,
      );
      if (bgItem) openBgPurchase(bgItem);
      return;
    }
    const item = data?.catalog?.find(
      (candidate) => candidate.id === entry.view.itemId,
    );
    if (item) openItemPurchase(item, entry.onDeal ? entry.price : null);
  };

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
        kind: 'item',
      }
    : purchaseBg
      ? {
          id: purchaseBg.id,
          name: purchaseBg.name,
          rarity: purchaseBg.rarity,
          price: purchaseBg.priceFlies ?? 0,
          slotLabel: 'Background',
          kind: 'background',
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
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={backgroundPreview(purchaseBg)}
        alt={purchaseBg.name}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <Frog
          width={200}
          height={186}
          indices={equippedIndices}
          visualOffsetY={-8}
        />
      </div>
    </div>
  ) : null;
  const purchaseOwnedCount = purchaseItem
    ? (data?.wardrobe?.inventory?.[purchaseItem.id] ?? 0)
    : purchaseBg
      ? (bg.inventory[purchaseBg.id] ?? 0)
      : 0;

  const openItemPurchase = (item: ItemDef, dealPrice: number | null = null) => {
    hapticSelect();
    // Sale prices apply everywhere, not just on the shelf — resolve today's
    // price here so a card opened from the main grid quotes what the server
    // will actually charge. A slot sitting at its standing price is not a deal,
    // so it must not hand the sheet a "was" figure to strike through.
    const today = data?.dailyDeals?.find((d) => d.itemId === item.id);
    const resolved = dealPrice ?? (today?.onSale ? today.dealPrice : null);
    setPurchaseDealPrice(resolved);
    setPurchaseCard({
      kind: 'item',
      id: item.id,
      rarity: item.rarity,
      price: resolved ?? item.priceFlies ?? 0,
      item,
    });
  };

  const openBgPurchase = (bgItem: BackgroundItem) => {
    hapticSelect();
    setPurchaseDealPrice(null);
    setPurchaseCard({
      kind: 'bg',
      id: bgItem.id,
      rarity: bgItem.rarity,
      price: bgItem.priceFlies ?? 0,
      bg: bgItem,
    });
  };

  // Deep link (?item=…): open that item's purchase sheet once its catalog has
  // loaded. Fires once per id so closing the sheet doesn't immediately reopen.
  //
  // Deliberately waits for the grid behind it to lay out and paint first. The
  // sheet locks body scroll while it's open, and opening it in the same frame
  // the shop first mounts left the grid behind it blank until a scroll forced
  // a repaint (mobile only).
  const focusHandledRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!focusItemId || focusHandledRef.current === focusItemId) return;

    let open: (() => void) | null = null;
    if (focusItemKind === 'background') {
      const bgItem = bg.catalog.find((entry) => entry.id === focusItemId);
      if (!bgItem) return;
      open = () => openBgPurchase(bgItem);
    } else {
      const item = data?.catalog?.find((entry) => entry.id === focusItemId);
      if (!item) return;
      open = () => openItemPurchase(item);
    }

    focusHandledRef.current = focusItemId;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => open?.());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [
    focusItemId,
    focusItemKind,
    data?.catalog,
    data?.dailyDeals,
    data?.isPremium,
    bg.catalog,
  ]);

  const renderCollection = (slot: ClosetSlot) =>
    data ? (
      <CollectionBook
        slot={slot}
        catalog={data.catalog ?? []}
        backgrounds={bg.catalog}
        inventory={data.wardrobe?.inventory ?? {}}
        bgInventory={bg.inventory}
        equipped={data.wardrobe?.equipped ?? {}}
        equippedBgId={bg.equipped}
        dealPrices={dealPrices}
        tryOnId={
          tryTarget?.kind === 'item'
            ? tryTarget.item.id
            : tryTarget?.kind === 'bg'
              ? tryTarget.bg.id
              : null
        }
        unseen={unseenInventorySet}
        onTapItem={tapClosetItem}
        onTapBackground={tapClosetBackground}
      />
    ) : null;

  const renderWornRowCard = (card: WardrobeCard) =>
    card.kind === 'item' ? (
      <WardrobeRowCard
        key={card.item.id}
        rarity={card.rarity}
        sublabel={SLOT_LABEL[card.item.slot]}
        equipped={data?.wardrobe?.equipped?.[card.item.slot] === card.item.id}
        rarityBadge
        cta={showTapToWear ? 'Tap to wear' : undefined}
        onClick={() => handleItemAction(card.item)}
      >
        <FrogSnapshot
          className="h-[125%] w-[125%] object-contain"
          indices={{ [card.item.slot]: card.item.riveIndex }}
          width={120}
          height={120}
        />
      </WardrobeRowCard>
    ) : (
      <WardrobeRowCard
        key={`bg-${card.bg.id}`}
        rarity={card.rarity}
        sublabel="Background"
        equipped={bg.equipped === card.bg.id}
        rarityBadge
        onClick={() => bg.handleEquip(card.bg)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backgroundPreview(card.bg)}
          alt={card.bg.name}
          className="h-full w-full object-cover"
        />
      </WardrobeRowCard>
    );

  const renderGiftRowCard = (card: WardrobeCard) =>
    card.kind === 'item' ? (
      <WardrobeRowCard
        key={card.item.id}
        rarity={card.rarity}
        sublabel={SLOT_LABEL[card.item.slot]}
        count={data?.wardrobe?.inventory?.[card.item.id] ?? 0}
        isNew={unseenInventorySet.has(card.item.id)}
        rarityBadge
        cta="Open"
        corner={
          <GiftOddsButton giftId={card.item.id} name={card.item.name} />
        }
        onClick={() => handleItemAction(card.item)}
      >
        <div className="h-[115%] w-[115%]">
          <GiftRive
            color={card.item.riveIndex}
            animation="box_shake"
            paused={isDragging}
          />
        </div>
      </WardrobeRowCard>
    ) : null;

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
              <p className="text-[13px] font-black text-muted-foreground">
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
          {embedded && !isGuest && activeTab === 'inventory' && data && (
            <div className="relative z-50 h-0 shrink-0">
              <div className="absolute right-0 top-[calc(80px+env(safe-area-inset-top))] md:top-6">
                <SavedLooksButton
                  enabled={open}
                  equipped={data.wardrobe?.equipped}
                  equippedBackgroundId={bg.equipped}
                  onNotify={setNotif}
                  onUpgrade={() => openPlus('wardrobe_looks')}
                />
              </div>
            </div>
          )}
          <div
            data-wardrobe-sticky
            className={cn(
              'shrink-0',
              embedded
                ? cn(
                    'z-40 -mx-4 px-4 md:-mx-6 md:px-6',
                    activeTab === 'trade'
                      ? 'relative'
                      : 'sticky top-[-90px] md:top-[-96px]',
                  )
                : 'relative z-40 space-y-2 px-4 pt-0 md:space-y-2 md:px-6 md:pt-2',
            )}
          >
            {embedded && (
              <>
                <div
                  aria-hidden
                  data-fly-page-bg
                  style={backgroundFadeMaskStyle}
                  className="pointer-events-none absolute left-[calc(50%-50vw)] top-0 bottom-0 z-0 w-screen overflow-hidden"
                >
                  {stageBackground}
                </div>
                <div className="relative z-20">{stage}</div>
              </>
            )}
            <div
              className={cn(
                embedded
                  ? 'relative z-10 flex pt-[60px] md:pt-2'
                  : 'relative z-10 flex items-center justify-between gap-2 md:gap-4',
              )}
            >
              <TabsList
                className={cn(
                  'p-1 rounded-[18px] border border-border/50 flex items-center gap-1',
                  embedded
                    ? 'mx-auto h-12 w-full bg-muted shadow-lg md:translate-y-16'
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
                  data-hint="wardrobe-inventory-tab"
                >
                  <AppIcon
                    name="wardrobe"
                    className="w-5 h-5 shrink-0 [@media(max-width:400px)]:hidden"
                  />
                  <span>Dress up</span>
                  {shopGiftReady && (
                    <GiftBadge className="-my-1 h-[22px] w-[22px] shrink-0" />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="trade"
                  className={tabTriggerClass}
                  onClick={scrollPageToTop}
                  data-hint="wardrobe-trade-tab"
                >
                  <AppIcon
                    name="trade"
                    className="w-5 h-5 shrink-0 [@media(max-width:400px)]:hidden"
                  />
                  <span>Trade Up</span>
                  {tradeTabBadge > 0 && (
                    <span
                      title={tradeReadyTitle(readyTrades, tradeReadiness.byRarity)}
                      className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black leading-none text-white shadow-sm"
                    >
                      {readyTrades > 9 ? '9+' : readyTrades}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {!embedded && (
                <div className="flex items-center gap-2">
                  {!isGuest && data && (
                    <SavedLooksButton
                      enabled={open}
                      equipped={data.wardrobe?.equipped}
                      equippedBackgroundId={bg.equipped}
                      onNotify={setNotif}
                      onUpgrade={() => openPlus('wardrobe_looks')}
                    />
                  )}
                  {!isGuest && (
                    <WishlistButton
                      count={wishlistEntries.length}
                      readyCount={wishlistReadyCount}
                      onClick={openWishlist}
                    />
                  )}
                  <SortMenu
                    value={sortBy}
                    onChange={setSortBy}
                    showLatest={false}
                    showFeatured={false}
                  />
                </div>
              )}
            </div>

            <div
              className={cn(
                'relative z-10',
                embedded
                  ? '-mx-4 mt-3 rounded-t-[24px] border-b border-border/60 bg-background px-4 pb-1.5 pt-3 md:-mx-6 md:mt-20 md:px-6'
                  : 'mt-2 w-full min-w-0',
              )}
            >
              <div className="flex items-center">
              <div className="flex-1 min-w-0">
                <FilterBar
                  active={activeFilter}
                  onChange={handleFilterChange}
                  badges={filterBadges}
                  options={
                    activeTab === 'trade'
                      ? [
                          { id: 'all', label: 'All', icon: <Sparkles className="w-5 h-5" /> },
                          { id: 'skin', label: 'Skins', icon: <Paintbrush className="w-5 h-5" /> },
                          { id: 'hat', label: 'Hats', icon: <Crown className="w-5 h-5" /> },
                          { id: 'body', label: 'Body', icon: <Shirt className="w-5 h-5" /> },
                          { id: 'held', label: 'Held', icon: <Hand className="w-5 h-5" /> },
                          { id: 'background', label: 'Backgrounds', icon: <ImageIcon className="w-5 h-5" /> },
                        ]
                      : [
                          {
                            id: 'all',
                            label: 'All',
                            icon: <Sparkles className="w-5 h-5" />,
                            hint: 'wardrobe-shop-tab',
                          },
                          { id: 'skin', label: 'Skins', icon: <Paintbrush className="w-5 h-5" /> },
                          { id: 'hat', label: 'Hats', icon: <Crown className="w-5 h-5" /> },
                          { id: 'body', label: 'Body', icon: <Shirt className="w-5 h-5" /> },
                          { id: 'held', label: 'Held', icon: <Hand className="w-5 h-5" /> },
                          { id: 'background', label: 'Backgrounds', icon: <ImageIcon className="w-5 h-5" /> },
                          { id: 'container', label: 'Gifts', icon: <Gift className="w-5 h-5" /> },
                        ]
                  }
                />
              </div>
              {embedded && activeTab === 'trade' && (
                <div className="relative z-10 flex shrink-0 items-center gap-1.5 self-stretch border-l border-border/40 pl-2.5 md:border-l-0 md:pl-1">
                  <SortMenu
                    value={sortBy}
                    onChange={setSortBy}
                    showLatest={false}
                    showFeatured={false}
                  />
                </div>
              )}
              </div>
              {embedded &&
                activeTab === 'inventory' &&
                activeFilter !== 'container' &&
                canRenderItems && (
                  <RarityRail
                    rows={raritySummary}
                    active={activeShelf}
                    onJump={jumpToShelf}
                  />
                )}
            </div>
          </div>

          <div
            className={cn(
              embedded
                ? // No rounded top here: the filter-bar strip above is already
                  // the sheet's rounded edge, and a second one reads as a notch
                  // cut under the category chips on every tab.
                  'relative flex-1 -mx-4 px-4 md:-mx-6 md:px-6 bg-background pt-2 pb-2 md:pt-3'
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
              ref={(node) => bindScroll?.(node)}
              className={cn(
                embedded
                  ? 'relative'
                  : 'absolute inset-0 overflow-y-auto overscroll-none p-3',
                'data-[state=inactive]:hidden',
              )}
            >
              {!canRenderItems || !data ? (
                <WardrobeGridSkeleton />
              ) : activeFilter === 'all' ? (
                <div className="flex flex-col gap-1 pb-4">
                  {ownedGiftCards.length > 0 && (
                    <div className="pb-2">
                      <p className="mb-2 px-1 text-[13px] font-black text-foreground">
                        Gifts to open
                      </p>
                      <DragScrollRow>{ownedGiftCards.map(renderGiftRowCard)}</DragScrollRow>
                    </div>
                  )}
                  {!!data.dailyDeals?.length && (
                    <DailyDealsShelf
                      deals={data.dailyDeals}
                      catalog={data.catalog ?? []}
                      isPremium={!!data.isPremium}
                      rerollsLeft={data.dealRerollsLeft ?? 0}
                      rerolling={rerolling}
                      wishlistedIds={wishlistedItemIds}
                      onBuy={(item, dealPrice) => tapClosetItem(item, dealPrice)}
                      onReroll={() => void rerollDeals()}
                      onUpgrade={() => void rerollDeals()}
                      renderEntries={(entries) => (
                        <DealTileRow
                          deals={entries.map(({ deal, item }) => ({
                            item,
                            dealPrice: deal.dealPrice,
                            onSale: deal.onSale,
                          }))}
                          inventory={data.wardrobe?.inventory ?? {}}
                          equipped={data.wardrobe?.equipped ?? {}}
                          tryOnId={tryTarget?.kind === 'item' ? tryTarget.item.id : null}
                          onTapItem={tapClosetItem}
                        />
                      )}
                    />
                  )}
                  {newOwnedCards.length > 0 && (
                    <div className="pb-2">
                      <p className="mb-2 px-1 text-[13px] font-black text-rose-500">
                        New in your closet
                      </p>
                      <DragScrollRow>{newOwnedCards.map(renderWornRowCard)}</DragScrollRow>
                    </div>
                  )}
                  {renderCollection('all')}
                  {!isGuest && (
                    <WishlistShelf
                      entries={shelfWishlistEntries}
                      slots={wishlistSlots}
                      removing={wishlistBusy}
                      onOpen={openWishlistEntry}
                      onRemove={(entry) =>
                        void removeFromWishlist(entry.view.itemId, entry.view.kind)
                      }
                      onSeeAll={openWishlist}
                    />
                  )}
                  {!isGuest && (
                    <SeenOnFriendsRow
                      enabled={activeTab === 'inventory' && activeFilter === 'all'}
                      catalog={data.catalog ?? []}
                      backgrounds={bg.catalog}
                      ownedItems={data.wardrobe?.inventory ?? {}}
                      ownedBackgrounds={bg.inventory}
                      onPickItem={(item) => tapClosetItem(item, null)}
                      onPickBackground={tapClosetBackground}
                    />
                  )}
                </div>
              ) : activeFilter === 'container' ? (
                ownedGiftCards.length === 0 ? (
                  <WardrobeEmptyState
                    icon={<Gift className="h-8 w-8" />}
                    title="No gifts to open"
                    description="Finish quests and keep your streak to earn gifts. Every one can hold something rare."
                  />
                ) : (
                  <div className="flex flex-wrap gap-2 pb-4">
                    {ownedGiftCards.map(renderGiftRowCard)}
                  </div>
                )
              ) : (
                renderCollection(closetSlot)
              )}
            </TabsContent>

            <TabsContent
              value="trade"
              className={cn(
                embedded ? 'relative' : 'absolute inset-0 overflow-hidden',
                'data-[state=inactive]:hidden',
              )}
            >
              {!canRenderItems ? (
                <WardrobeGridSkeleton showAction />
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
                  isPremium={!!data.isPremium}
                  balance={balance}
                  onGetFlies={(shortBy) => openFlyShop(shortBy)}
                  onUpgrade={() => openPlus('trade_perks')}
                  onGoToShop={() => {
                    setActiveTab('shop');
                    scrollPageToTop();
                  }}
                />
              ) : null}
            </TabsContent>

          </div>
        </Tabs>
      </div>

      {openingGiftId && (
        <GiftBoxOpening
          giftBoxId={openingGiftId}
          onClose={() => setOpeningGiftId(null)}
          onWin={refreshInventory}
          paused={isDragging}
        />
      )}

      <ShopGiftPopup
        active={open && activeTab === 'inventory' && activeFilter === 'all' && !isGuest}
        gift={data?.shopGift}
      />

      <PurchaseSheet
        open={!!purchaseCard}
        onClose={() => {
          const boughtTried =
            (purchaseItem &&
              tryTarget?.kind === 'item' &&
              tryTarget.item.id === purchaseItem.id &&
              (data?.wardrobe?.inventory?.[purchaseItem.id] ?? 0) > 0) ||
            (purchaseBg &&
              tryTarget?.kind === 'bg' &&
              tryTarget.bg.id === purchaseBg.id &&
              (bg.inventory[purchaseBg.id] ?? 0) > 0);
          if (boughtTried) clearTryOn();
          setPurchaseCard(null);
          setPurchaseDealPrice(null);
        }}
        target={purchaseTarget}
        preview={purchasePreview}
        previewWide={!!purchaseBg}
        balance={balance}
        ownedCount={purchaseOwnedCount}
        isGuest={isGuest}
        isPremium={!!data?.isPremium}
        onUpgrade={() => openPlus('wishlist_slots')}
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
          clearTryOn();
          if (purchaseItem) await equipItemDirect(purchaseItem);
          else if (purchaseBg) await bg.handleEquip(purchaseBg);
          announceEquip();
          setActiveTab('inventory');
          scrollPageToTop();
        }}
        onGoToTrade={() => {
          setActiveTab('trade');
          scrollPageToTop();
        }}
      />

      {justBought && !tryTarget && !purchaseCard && activeTab === 'inventory' && (() => {
        const rarity = (
          justBought.kind === 'item' ? justBought.item.rarity : justBought.bg.rarity
        ) as Rarity;
        const collected =
          summarizeCloset(
            'all',
            data?.catalog ?? [],
            bg.catalog,
            data?.wardrobe?.inventory ?? {},
            bg.inventory,
          ).find((row) => row.rarity === rarity) ?? null;
        return (
          <YoursCard
            key={justBought.kind === 'item' ? justBought.item.id : justBought.bg.id}
            name={justBought.kind === 'item' ? justBought.item.name : justBought.bg.name}
            rarity={rarity}
            collected={collected}
            onDone={clearJustBought}
            thumb={
              justBought.kind === 'item' ? (
                <FrogSnapshot
                  className="pointer-events-none shrink-0"
                  indices={{ [justBought.item.slot as WardrobeSlot]: justBought.item.riveIndex }}
                  width="124%"
                  height="124%"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={backgroundPreview(justBought.bg)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )
            }
          />
        );
      })()}

      {tryTarget && !purchaseCard && activeTab === 'inventory' && (() => {
        const isItem = tryTarget.kind === 'item';
        const rarity = (isItem ? tryTarget.item.rarity : tryTarget.bg.rarity) as Rarity;
        const basePrice = isItem
          ? (tryTarget.item.priceFlies ?? 0)
          : tryTarget.bg.priceFlies ?? 0;
        const price = isItem ? (tryTarget.dealPrice ?? basePrice) : basePrice;
        return (
          <TryOnBar
            key={isItem ? tryTarget.item.id : tryTarget.bg.id}
            name={isItem ? tryTarget.item.name : tryTarget.bg.name}
            rarity={rarity}
            price={price}
            originalPrice={isItem && tryTarget.dealPrice != null ? basePrice : null}
            locked={isTradeOnlyRarity(rarity) || !(basePrice > 0)}
            balance={balance}
            busy={tryBuying}
            onBuy={() => void buyTriedOn()}
            onGetFlies={(short) => openFlyShop(short)}
            onTradeUp={() => {
              clearTryOn();
              setActiveTab('trade');
              setActiveFilter('all');
              scrollPageToTop();
            }}
            onClose={clearTryOn}
          />
        );
      })()}

      <WishlistSheet
        open={wishlistOpen}
        onClose={() => setWishlistOpen(false)}
        entries={wishlistEntries}
        slots={wishlistSlots}
        balance={balance}
        removing={wishlistBusy}
        isPremium={!!data?.isPremium}
        onUpgrade={() => openPlus('wishlist_slots')}
        onOpen={openWishlistEntry}
        onRemove={(entry) =>
          void removeFromWishlist(entry.view.itemId, entry.view.kind)
        }
        onGoToShop={() => {
          setWishlistOpen(false);
          setActiveTab('shop');
          scrollPageToTop();
        }}
        onGoToTrade={() => {
          setWishlistOpen(false);
          setActiveTab('trade');
          scrollPageToTop();
        }}
      />

      <PlusUpgradeModal
        open={plusOpen}
        placement={plusPlacement}
        onStartTrial={async () => {
          if (!pendingDealRerollRef.current) return;
          pendingDealRerollRef.current = false;
          await rerollDeals(true);
        }}
        onClose={() => {
          setPlusOpen(false);
          mutateInventoryCaches();
        }}
      />
    </div>
  );
}

function WardrobeRowCard({
  rarity,
  name,
  sublabel,
  sublabelClass,
  count,
  isNew,
  equipped,
  rarityBadge,
  corner,
  cta,
  onClick,
  children,
}: {
  rarity: ItemDef['rarity'];
  name?: string;
  sublabel: string;
  sublabelClass?: string;
  count?: number;
  isNew?: boolean;
  equipped?: boolean;
  rarityBadge?: boolean;
  corner?: React.ReactNode;
  cta?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const config = RARITY_CONFIG[rarity];
  return (
    <div className="relative w-[132px] shrink-0">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative flex w-full flex-col items-stretch overflow-hidden rounded-xl border-2 bg-card p-2 text-left shadow-sm transition-transform active:scale-[0.97]',
          config.border,
        )}
      >
        {rarityBadge && (
          <span className="absolute left-0 top-0 z-20 overflow-hidden rounded-br-2xl bg-background">
            <span
              className={cn(
                'block rounded-br-2xl border-b border-r px-2 py-1 text-[10px] font-black',
                config.bg,
                config.text,
                config.border,
              )}
            >
              {config.label}
            </span>
          </span>
        )}
        <div className="relative flex h-20 items-end justify-center overflow-hidden rounded-lg bg-muted/40">
          {children}
          {isNew && (
            <span
              className={cn(
                'absolute left-1 z-20 animate-pulse rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm',
                rarityBadge ? 'bottom-1' : 'top-1',
              )}
            >
              New
            </span>
          )}
          {(count ?? 0) > 1 && (
            <span className="absolute right-1 top-1 z-20 rounded-md border border-white/10 bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
              x{count}
            </span>
          )}
          {equipped && (
            <span className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-[#447d3f] p-0.5 text-white shadow-md">
              <Check className="h-3 w-3 stroke-[4]" />
            </span>
          )}
        </div>
        {name && (
          <p
            className={cn(
              'mt-1.5 truncate text-xs font-black text-foreground',
              corner && 'pr-7',
            )}
          >
            {name}
          </p>
        )}
        {cta ? (
          <span
            className={cn(
              'mt-1.5 flex h-6 items-center justify-center rounded-lg bg-primary text-[11px] font-black text-primary-foreground shadow-sm',
              corner && 'mr-7',
            )}
          >
            {cta}
          </span>
        ) : (
          <p
            className={cn(
              'truncate text-[10px] font-semibold',
              !name && 'mt-1.5',
              corner && 'pr-7',
              sublabelClass ?? 'text-muted-foreground',
            )}
          >
            {sublabel}
          </p>
        )}
      </button>
      {corner && (
        <div className="absolute bottom-2 right-2 z-30">{corner}</div>
      )}
    </div>
  );
}
