'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Shuffle, X } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import {
  beginEquipMutation,
  endEquipMutation,
  mutateInventoryCaches,
} from '@/hooks/useInventory';
import { mutateBackgrounds } from '@/hooks/useBackgrounds';
import {
  ROTATION_INTERVAL_MS,
  isRotationInterval,
  type RotationInterval,
} from '@/lib/skins/styleShuffle';

const SHUFFLE_API = '/api/skins/shuffle';
const LEGACY_STORAGE_KEY = 'skinRotationInterval';

export type { RotationInterval };

const OPTIONS: {
  value: RotationInterval;
  label: string;
  hint: string;
}[] = [
  { value: '1m', label: 'Every minute', hint: 'Blink and it changes' },
  { value: '5m', label: 'Every 5 minutes', hint: 'Party mode' },
  { value: '10m', label: 'Every 10 minutes', hint: 'Keep it lively' },
  { value: '1h', label: 'Every hour', hint: 'A surprise each session' },
  { value: '1d', label: 'Every day', hint: 'Fresh fit every morning' },
  { value: 'disabled', label: 'Off', hint: 'Keep your current look' },
];

const shuffleFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load shuffle setting');
  return (await res.json()) as { interval: RotationInterval };
};

export function useShuffleInterval() {
  const { user } = useAuth();
  const { data, mutate } = useSWR(user ? SHUFFLE_API : null, shuffleFetcher);

  const setValue = useCallback(
    async (interval: RotationInterval) => {
      try {
        await mutate(
          async () => {
            const res = await fetch(SHUFFLE_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ interval }),
            });
            if (!res.ok) throw new Error('Failed to save shuffle setting');
            return { interval };
          },
          {
            optimisticData: { interval },
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

  const value: RotationInterval =
    data && isRotationInterval(data.interval) ? data.interval : 'disabled';
  return { value, setValue };
}

export function labelForInterval(v: RotationInterval): string {
  return OPTIONS.find((o) => o.value === v)?.label ?? 'Disabled';
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
  const [mounted, setMounted] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const shuffleNow = async () => {
    if (shuffling) return;
    setShuffling(true);
    try {
      navigator.vibrate?.(14);
    } catch {}
    await rotateOnce();
    setShuffling(false);
    onClose();
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
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-500 shadow-lg shadow-fuchsia-500/30">
                <Shuffle className="h-7 w-7 text-white" />
              </div>
              <h3 className="mt-3 text-center text-xl font-black tracking-tight text-foreground">
                Style Shuffle
              </h3>
              <p className="mx-auto mt-1 max-w-[290px] text-center text-xs font-medium text-muted-foreground">
                Let your frog surprise you — a fresh outfit and background from
                your own wardrobe, automatically.
              </p>
              <button
                type="button"
                onClick={shuffleNow}
                disabled={shuffling}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-fuchsia-500/25 transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                <Shuffle
                  className={cn('h-4 w-4', shuffling && 'animate-spin')}
                />
                {shuffling ? 'Shuffling…' : 'Shuffle now'}
              </button>
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
                          ? 'border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-950/30'
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
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-400 text-white">
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
    const data = (await res.json()) as { shuffled?: boolean };
    if (!data.shuffled) return;

    mutateInventoryCaches();
    mutateBackgrounds();
    window.dispatchEvent(new Event('wardrobe-refresh'));
    window.dispatchEvent(new Event('background-refresh'));
    window.dispatchEvent(new Event('style-shuffle-swap'));
  } catch {
    // silent
  } finally {
    endEquipMutation();
    window.dispatchEvent(new Event('style-shuffle-end'));
  }
}

export function StyleShuffleHeaderButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { value, setValue } = useShuffleInterval();
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Style Shuffle"
        className={cn(
          'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-card/80 shadow-sm backdrop-blur-xl transition-colors hover:bg-accent/50 active:scale-95 max-[379px]:h-9 max-[379px]:w-9 max-[359px]:h-8 max-[359px]:w-8',
          className,
        )}
      >
        {ring && (
          <span
            key={ringKey}
            onAnimationEnd={() => setRing(false)}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-fuchsia-400 [animation:shuffle-ping_0.9s_cubic-bezier(0,0,0.2,1)_both]"
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
            className="h-7 w-7 max-[379px]:h-6 max-[379px]:w-6 max-[359px]:h-5 max-[359px]:w-5 dark:[&_path:first-child]:fill-slate-300 dark:[&_path:not(:first-child)]:fill-emerald-400"
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
