'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import Fly from '@/components/ui/fly';
import { Icon } from '@/components/ui/Icon';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { useAuth } from '@/components/auth/AuthContext';
import { useInventory } from '@/hooks/useInventory';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { byId as staticById, TRADE_ITEM_COUNT } from '@/lib/skins/catalog';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export type WardrobeTab = 'inventory' | 'shop' | 'trade';

export function useWardrobeBadges() {
  const { user } = useAuth();
  const { unseenCount, unseenContainerCount, data } = useInventory(
    !!user,
    true,
  );
  const inventoryBadge = unseenCount + unseenContainerCount;
  const flyBalance = data?.wardrobe?.flies;
  const dealEndsAt = data?.dailyDeals?.[0]?.endsAt ?? null;

  const { tradeSpares, ownedCount } = useMemo(() => {
    const inv = data?.wardrobe?.inventory ?? {};
    const catalogById: Record<string, { slot?: string }> = {};
    for (const item of data?.catalog ?? []) catalogById[item.id] = item;
    let spares = 0;
    let owned = 0;
    for (const [id, count] of Object.entries(inv)) {
      if ((count ?? 0) <= 0) continue;
      const def = catalogById[id] ?? staticById[id];
      if (def?.slot === 'container') continue;
      owned += 1;
      if ((count ?? 0) > 1) spares += count - 1;
    }
    return { tradeSpares: spares, ownedCount: owned };
  }, [data]);

  return { inventoryBadge, flyBalance, tradeSpares, ownedCount, dealEndsAt };
}

const SHEET_ENTER = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 38,
  mass: 0.9,
};
const SHEET_EXIT = {
  duration: 0.22,
  ease: [0.4, 0, 1, 1] as [number, number, number, number],
};

/**
 * One card shape for all three destinations — they're peers, and the old
 * wide-row-plus-two-tiles layout implied a hierarchy that doesn't exist.
 * Colour is reserved for live state (a running deal, spares ready to trade),
 * so it reads as information rather than decoration.
 */
function DestinationCard({
  icon,
  label,
  detail,
  detailTone = 'muted',
  detailIcon,
  badge = 0,
  badgeTone = 'rose',
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  detailTone?: 'muted' | 'amber';
  detailIcon?: React.ReactNode;
  badge?: number;
  badgeTone?: 'rose' | 'amber';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-border/50 bg-card px-1.5 pb-2.5 pt-3.5 shadow-sm transition-transform active:scale-[0.97]"
    >
      {badge > 0 && (
        <span
          className={cn(
            'absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black text-white shadow-sm',
            badgeTone === 'rose' ? 'bg-rose-500' : 'bg-amber-500',
          )}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="w-full truncate text-center text-[13px] font-black leading-none text-foreground">
        {label}
      </span>
      <span
        className={cn(
          'flex w-full items-center justify-center gap-0.5 truncate text-[10px] font-bold leading-none tabular-nums',
          detailTone === 'amber'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground',
        )}
      >
        {detailIcon}
        {detail}
      </span>
    </button>
  );
}

export function WardrobePopup({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (tab: WardrobeTab) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { user } = useAuth();
  const { indices } = useWardrobeIndices(!!user);
  const { inventoryBadge, flyBalance, tradeSpares, ownedCount, dealEndsAt } =
    useWardrobeBadges();
  const dealCountdown = useCountdown(
    open && dealEndsAt ? dealEndsAt : undefined,
  );
  useRegisterOpenSheet(open);
  if (!mounted) return null;

  const tradeReady = tradeSpares >= TRADE_ITEM_COUNT;

  const pick = (tab: WardrobeTab) => {
    hapticTick();
    onSelect(tab);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="fixed inset-0 z-[98] bg-black/60 backdrop-blur-[2px] md:hidden"
          />

          <motion.div
            initial={{ y: '112%' }}
            animate={{ y: 0 }}
            exit={{ y: '112%', transition: SHEET_EXIT }}
            transition={SHEET_ENTER}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
            className="fixed left-0 right-0 z-[99] md:hidden"
            style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
          >
            <div className="rounded-t-[28px] border-t border-border/60 bg-background pb-4 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
              <div className="flex justify-center pb-2 pt-3">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>

              {/* Your actual frog leads — this is the one thing that makes it
                  this app's wardrobe rather than a generic action sheet. */}
              <div className="flex items-center gap-3 px-5 pb-4">
                <div className="flex h-12 w-12 shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-primary/10">
                  <span className="shrink-0">
                    <FrogSnapshot
                      indices={indices}
                      width={60}
                      height={60}
                      visualOffsetY={0}
                    />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase leading-none tracking-[0.18em] text-muted-foreground">
                    Dress your frog
                  </p>
                  <h2 className="mt-1 text-xl font-black leading-none text-foreground">
                    Wardrobe
                  </h2>
                </div>
                {typeof flyBalance === 'number' && (
                  <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-card py-1 pl-1.5 pr-2.5 shadow-sm">
                    <Fly size={24} paused y={-4} />
                    <span className="text-[13px] font-black tabular-nums text-foreground">
                      {flyBalance.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Three peers, one shape. Icons match the tabs they open, so the
                  glyph you tap is the glyph you land on. */}
              <div className="grid grid-cols-3 gap-2.5 px-4">
                <DestinationCard
                  icon={<Icon name="wardrobe" className="h-8 w-8" />}
                  label="Inventory"
                  detail={ownedCount > 0 ? `${ownedCount} owned` : 'Empty'}
                  badge={inventoryBadge}
                  badgeTone="rose"
                  onClick={() => pick('inventory')}
                />
                <DestinationCard
                  icon={<Icon name="store" className="h-8 w-8" />}
                  label="Shop"
                  detail={dealCountdown || 'New daily'}
                  detailTone={dealCountdown ? 'amber' : 'muted'}
                  detailIcon={
                    dealCountdown ? <Clock className="h-3 w-3" /> : null
                  }
                  onClick={() => pick('shop')}
                />
                <DestinationCard
                  icon={<Icon name="trade" className="h-8 w-8" />}
                  label="Trade"
                  detail={
                    tradeReady
                      ? `${tradeSpares} ready`
                      : `${TRADE_ITEM_COUNT} to swap`
                  }
                  detailTone={tradeReady ? 'amber' : 'muted'}
                  badge={tradeReady ? tradeSpares : 0}
                  badgeTone="amber"
                  onClick={() => pick('trade')}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
