'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  Lock,
  LockOpen,
  Shuffle,
  X,
} from 'lucide-react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { cn } from '@/lib/utils';
import { hapticImpact, hapticTick } from '@/lib/haptics';
import { Icon } from '@/components/ui/Icon';
import { HEADER_CONTROL_ICON_BUTTON } from '@/components/ui/MobileHeaderActions';
import {
  beginEquipMutation,
  endEquipMutation,
  mutateInventoryCaches,
} from '@/hooks/useInventory';
import { mutateBackgrounds } from '@/hooks/useBackgrounds';
import { useLooks } from '@/hooks/useLooks';
import { useTryOnStore, type TryOnOffer } from '@/lib/tryOnStore';
import { useUIStore } from '@/lib/uiStore';
import { useSheetStore } from '@/lib/sheetStore';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import {
  ROTATION_INTERVAL_MS,
  isRotationInterval,
  type RotationInterval,
} from '@/lib/skins/styleShuffle';

const SHUFFLE_API = '/api/skins/shuffle';
const LEGACY_STORAGE_KEY = 'skinRotationInterval';

export type { RotationInterval };

export type ShuffleSlot = 'skin' | 'hat' | 'body' | 'hand_item';

const SLOT_LABELS: { slot: ShuffleSlot; label: string }[] = [
  { slot: 'skin', label: 'Skin' },
  { slot: 'hat', label: 'Hat' },
  { slot: 'body', label: 'Body' },
  { slot: 'hand_item', label: 'Held' },
];

// Minute-scale rotation is deliberately gone: at that speed the outfit stops
// being a choice the player made and becomes wallpaper, which is exactly what
// stops people visiting the wardrobe at all.
const OPTIONS: {
  value: RotationInterval;
  label: string;
  hint: string;
}[] = [
  { value: '1h', label: 'Every hour', hint: 'A surprise each session' },
  { value: '1d', label: 'Every day', hint: 'Fresh fit every morning' },
  { value: 'disabled', label: 'Off', hint: 'Keep your current look' },
];

type ShuffleState = {
  interval: RotationInterval;
  lockedSlots?: ShuffleSlot[];
  eligible?: boolean;
  shuffleableSlots?: ShuffleSlot[];
  ownedCount?: number;
};

const shuffleFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load shuffle setting');
  return (await res.json()) as ShuffleState;
};

export function useShuffleInterval() {
  const { user } = useAuth();
  const { data, mutate } = useSWR(user ? SHUFFLE_API : null, shuffleFetcher);

  const patch = useCallback(
    async (body: Partial<Pick<ShuffleState, 'interval' | 'lockedSlots'>>) => {
      try {
        await mutate(
          async (curr) => {
            const res = await fetch(SHUFFLE_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Failed to save shuffle setting');
            return { ...(curr ?? { interval: 'disabled' }), ...body };
          },
          {
            optimisticData: (curr?: ShuffleState) => ({
              ...(curr ?? { interval: 'disabled' as RotationInterval }),
              ...body,
            }),
            rollbackOnError: true,
            revalidate: false,
          },
        );
        return true;
      } catch {
        return false;
      }
    },
    [mutate],
  );

  const setValue = useCallback(
    (interval: RotationInterval) => patch({ interval }),
    [patch],
  );
  const setLockedSlots = useCallback(
    (lockedSlots: ShuffleSlot[]) => patch({ lockedSlots }),
    [patch],
  );

  const value = normalizeInterval(data?.interval);
  return {
    value,
    setValue,
    setLockedSlots,
    lockedSlots: data?.lockedSlots ?? [],
    eligible: data?.eligible ?? false,
    shuffleableSlots: data?.shuffleableSlots ?? [],
    ownedCount: data?.ownedCount ?? 0,
    loaded: !!data,
    refresh: mutate,
  };
}

/** Accounts saved under the retired minute-scale options land on hourly. */
function normalizeInterval(raw: unknown): RotationInterval {
  if (!isRotationInterval(raw)) return 'disabled';
  if (raw === '1m' || raw === '5m' || raw === '10m') return '1h';
  return raw;
}

export function labelForInterval(v: RotationInterval): string {
  return OPTIONS.find((o) => o.value === normalizeInterval(v))?.label ?? 'Off';
}

export function SkinRotationRow() {
  const { value, setValue } = useShuffleInterval();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/50 text-left"
      >
        <div className="h-9 w-9 flex items-center justify-center shrink-0">
          <Icon name="shuffle" label="Style Shuffle" className="w-10 h-10" />
        </div>
        <span className="flex-1 text-sm font-bold truncate">Style Shuffle</span>
        <span className="text-[11px] font-bold text-muted-foreground">
          {labelForInterval(value)}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>
      <SkinRotationDialog
        open={open}
        currentValue={value}
        onClose={() => setOpen(false)}
        onSelect={(v) => {
          void setValue(v);
          setOpen(false);
        }}
      />
    </>
  );
}

export function SkinRotationDialog({
  open,
  currentValue,
  onClose,
  onSelect,
}: {
  open: boolean;
  currentValue: RotationInterval;
  onClose: () => void;
  onSelect: (value: RotationInterval) => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [savedLook, setSavedLook] = useState(false);
  const [lookError, setLookError] = useState<string | null>(null);
  const {
    save: saveLook,
    isFull: looksFull,
    busy: savingLook,
  } = useLooks(open);
  const {
    eligible,
    shuffleableSlots,
    lockedSlots,
    setLockedSlots,
    ownedCount,
    loaded,
    refresh,
  } = useShuffleInterval();
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);
  if (!mounted) return null;

  const locked = new Set(lockedSlots);
  const toggleLock = (slot: ShuffleSlot) => {
    hapticTick();
    const next = new Set(locked);
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    void setLockedSlots(Array.from(next));
  };

  // Every shuffleable slot pinned means the button can't do anything either.
  const allLocked =
    shuffleableSlots.length > 0 &&
    shuffleableSlots.every((slot) => locked.has(slot));
  const canShuffle = eligible && !allLocked;

  const shuffleNow = async () => {
    if (shuffling || !canShuffle) return;
    setShuffling(true);
    setSavedLook(false);
    setLookError(null);
    hapticImpact();
    await rotateOnce();
    void refresh();
    setShuffling(false);
    // Close so the result is actually visible — the dialog sits over the frog.
    onClose();
  };

  const handleSaveLook = async () => {
    setLookError(null);
    const result = await saveLook();
    if (result.ok) setSavedLook(true);
    else if (result.error) setLookError(result.error);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[1500] bg-black/40 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-[1501] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="pointer-events-auto relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-3xl border border-border/50 bg-card p-5 shadow-2xl"
            >
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4f9149] shadow-lg shadow-[#4f9149]/25">
                <Shuffle className="h-7 w-7 text-white" />
              </div>
              <h3 className="mt-3 text-center text-xl font-black tracking-tight text-foreground">
                Style Shuffle
              </h3>
              <p className="mx-auto mt-1 max-w-[290px] text-center text-xs font-medium text-muted-foreground">
                Let your frog surprise you — a fresh outfit pulled from your own
                wardrobe.
              </p>

              {loaded && !eligible ? (
                // Nothing owned that isn't already on: shuffling would be a
                // no-op, so point at the shop instead of a dead button.
                <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-center">
                  <p className="text-sm font-black text-foreground">
                    {ownedCount > 0
                      ? 'Only one outfit so far'
                      : 'Your wardrobe is empty'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push('/wardrobe?tab=shop');
                    }}
                    className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-[#4f9149] px-4 text-xs font-black uppercase tracking-wide text-white shadow-[0_3px_0_0_#34631f] transition-transform active:translate-y-0.5 active:shadow-none"
                  >
                    Browse the shop
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={shuffleNow}
                      disabled={shuffling || !canShuffle}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_0_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none"
                    >
                      <Shuffle
                        className={cn('h-4 w-4', shuffling && 'animate-spin')}
                      />
                      {shuffling ? 'Shuffling…' : 'Shuffle now'}
                    </button>
                    {/* The whole point of saving: a shuffle that lands well is
                        otherwise lost the next time the timer fires. */}
                    <button
                      type="button"
                      onClick={handleSaveLook}
                      disabled={savingLook || looksFull}
                      title={
                        looksFull
                          ? 'All look slots are full'
                          : 'Keep this outfit'
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-border/60 text-muted-foreground transition-colors hover:border-[#4f9149] hover:text-[#4f9149] disabled:opacity-40"
                      aria-label="Save this look"
                    >
                      {savedLook ? (
                        <BookmarkCheck className="h-5 w-5 text-[#4f9149]" />
                      ) : (
                        <Bookmark className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {lookError && (
                    <p className="mt-2 px-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                      {lookError}
                    </p>
                  )}

                  {/* Lock what you like, shuffle the rest — the difference
                      between a slot machine and a styling tool. */}
                  <p className="mb-2 mt-5 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Keep these
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SLOT_LABELS.map(({ slot, label }) => {
                      const isLocked = locked.has(slot);
                      const usable = shuffleableSlots.includes(slot);
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={!usable}
                          onClick={() => toggleLock(slot)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-black transition-all active:scale-[0.97]',
                            !usable
                              ? 'border-border/30 text-muted-foreground/40'
                              : isLocked
                                ? 'border-[#4f9149] bg-[#4f9149]/10 text-[#4f9149]'
                                : 'border-border/40 text-muted-foreground hover:border-border',
                          )}
                        >
                          {isLocked ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <LockOpen className="h-3.5 w-3.5" />
                          )}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {allLocked && (
                    <p className="mt-2 px-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                      Everything is locked — unlock a piece to shuffle.
                    </p>
                  )}
                </>
              )}

              <p className="mb-2 mt-5 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Auto-shuffle
              </p>
              <div className="space-y-2">
                {OPTIONS.map((opt) => {
                  const isSelected = opt.value === currentValue;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onSelect(opt.value)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-left transition-all active:scale-[0.98]',
                        isSelected
                          ? 'border-[#4f9149] bg-[#4f9149]/10'
                          : 'border-border/40 bg-card hover:border-border',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block text-sm font-bold',
                            isSelected
                              ? 'text-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          {opt.label}
                        </span>
                        <span className="block text-[11px] font-medium text-muted-foreground/80">
                          {opt.hint}
                        </span>
                      </span>
                      {isSelected && (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4f9149] text-white">
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

async function rotateOnce(auto = false) {
  window.dispatchEvent(new Event('style-shuffle-start'));
  beginEquipMutation();
  try {
    const res = await fetch(SHUFFLE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      shuffled?: boolean;
      tryOn?: TryOnOffer | null;
    };
    if (!data.shuffled) return;

    mutateInventoryCaches();
    mutateBackgrounds();
    window.dispatchEvent(new Event('wardrobe-refresh'));
    window.dispatchEvent(new Event('background-refresh'));
    window.dispatchEvent(new Event('style-shuffle-swap'));

    if (data.tryOn) {
      // Let the real shuffle land first, so the try-on reads as the last thing
      // the frog put on rather than part of the same swap. If the user is
      // mid-task (tongue cinematic, open sheet) the offer is dropped outright
      // rather than queued — an interrupted completion is never worth a sale.
      window.setTimeout(() => {
        const ui = useUIStore.getState();
        if (ui.isCinematicActive || useSheetStore.getState().count > 0) return;
        useTryOnStore.getState().show(data.tryOn as TryOnOffer);
        trackAnalyticsEvent('tryon_shown', {
          item_id: data.tryOn!.itemId,
          price: data.tryOn!.price,
          can_afford: data.tryOn!.canAfford,
        });
      }, 900);
    }
  } catch {
    // silent
  } finally {
    endEquipMutation();
    window.dispatchEvent(new Event('style-shuffle-end'));
  }
}

export function StyleShuffleHeaderButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { value, setValue, eligible, loaded } = useShuffleInterval();
  const [spinning, setSpinning] = useState(false);
  const [ring, setRing] = useState(false);
  const [ringKey, setRingKey] = useState(0);
  const stopRequested = useRef(false);
  const failsafeRef = useRef<number | null>(null);

  useEffect(() => {
    const onStart = () => {
      stopRequested.current = false;
      if (failsafeRef.current) window.clearTimeout(failsafeRef.current);
      setSpinning(true);
    };
    const onEnd = () => {
      stopRequested.current = true;
      if (failsafeRef.current) window.clearTimeout(failsafeRef.current);
      failsafeRef.current = window.setTimeout(() => setSpinning(false), 1600);
    };
    const onSwap = () => {
      setRing(true);
      setRingKey((k) => k + 1);
    };
    window.addEventListener('style-shuffle-start', onStart);
    window.addEventListener('style-shuffle-end', onEnd);
    window.addEventListener('style-shuffle-swap', onSwap);
    return () => {
      window.removeEventListener('style-shuffle-start', onStart);
      window.removeEventListener('style-shuffle-end', onEnd);
      window.removeEventListener('style-shuffle-swap', onSwap);
      if (failsafeRef.current) window.clearTimeout(failsafeRef.current);
    };
  }, []);

  // Nothing to shuffle between yet — don't spend a header slot on a control
  // that can't do anything. It appears on its own once a 2nd piece is owned.
  if (loaded && !eligible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Style Shuffle"
        className={cn(
          HEADER_CONTROL_ICON_BUTTON,
          'relative hover:bg-accent/50',
          className,
        )}
      >
        {ring && (
          <span
            key={ringKey}
            onAnimationEnd={() => setRing(false)}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#4f9149] [animation:shuffle-ping_0.9s_cubic-bezier(0,0,0.2,1)_both]"
          />
        )}
        <span
          className={cn(
            'flex items-center justify-center will-change-transform',
            spinning && '[animation:spin_0.7s_linear_infinite]',
          )}
          onAnimationIteration={() => {
            if (stopRequested.current) {
              if (failsafeRef.current) window.clearTimeout(failsafeRef.current);
              setSpinning(false);
            }
          }}
        >
          <Icon
            name="shuffle"
            label="Style Shuffle"
            className="h-7 w-7 dark:[&_path:first-child]:fill-slate-300 dark:[&_path:not(:first-child)]:fill-emerald-400"
          />
        </span>
      </button>
      <SkinRotationDialog
        open={open}
        currentValue={value}
        onClose={() => setOpen(false)}
        onSelect={(v) => {
          void setValue(v);
          setOpen(false);
        }}
      />
    </>
  );
}

export function GlobalSkinRotation() {
  const { user } = useAuth();
  const { value: interval, setValue } = useShuffleInterval();
  const timerRef = useRef<number | null>(null);
  const migratedRef = useRef(false);

  useEffect(() => {
    if (!user || migratedRef.current) return;
    migratedRef.current = true;
    let legacy: string | null = null;
    try {
      legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch {}
    if (!isRotationInterval(legacy) || legacy === 'disabled') return;
    void setValue(legacy).then((ok) => {
      if (!ok) return;
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {}
    });
  }, [user, setValue]);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!user || interval === 'disabled') return;
    const ms = ROTATION_INTERVAL_MS[interval];
    if (ms <= 0) return;
    timerRef.current = window.setInterval(() => {
      void rotateOnce(true);
    }, ms) as unknown as number;
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [user, interval]);

  return null;
}
