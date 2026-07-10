'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Shuffle, X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { mutateBackgrounds, type BackgroundsApiData } from '@/hooks/useBackgrounds';
import type { WardrobeSlot } from '@/lib/skins/catalog';

const STORAGE_KEY = 'skinRotationInterval';

export type RotationInterval = 'disabled' | '5m' | '10m' | '1h' | '1d';

const OPTIONS: {
  value: RotationInterval;
  label: string;
  hint: string;
}[] = [
  { value: '5m', label: 'Every 5 minutes', hint: 'Party mode' },
  { value: '10m', label: 'Every 10 minutes', hint: 'Keep it lively' },
  { value: '1h', label: 'Every hour', hint: 'A surprise each session' },
  { value: '1d', label: 'Every day', hint: 'Fresh fit every morning' },
  { value: 'disabled', label: 'Off', hint: 'Keep your current look' },
];

const INTERVAL_MS: Record<RotationInterval, number> = {
  disabled: 0,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export function getRotationInterval(): RotationInterval {
  if (typeof window === 'undefined') return 'disabled';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === '5m' || v === '10m' || v === '1h' || v === '1d') return v;
  return 'disabled';
}

export function setRotationInterval(value: RotationInterval) {
  if (typeof window === 'undefined') return;
  if (value === 'disabled') window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new Event('skin-rotation-change'));
}

export function labelForInterval(v: RotationInterval): string {
  return OPTIONS.find((o) => o.value === v)?.label ?? 'Disabled';
}

export function SkinRotationRow() {
  const [value, setValue] = useState<RotationInterval>('disabled');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setValue(getRotationInterval());
    const handler = () => setValue(getRotationInterval());
    window.addEventListener('skin-rotation-change', handler);
    return () => window.removeEventListener('skin-rotation-change', handler);
  }, []);

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
          setRotationInterval(v);
          setValue(v);
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
              className="pointer-events-auto relative w-full max-w-md rounded-3xl border border-border/50 bg-card p-5 shadow-2xl"
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

type CatalogItem = { id: string; slot: WardrobeSlot };
type SkinsResponse = {
  wardrobe?: {
    equipped?: Partial<Record<WardrobeSlot, string | null>>;
    inventory?: Record<string, number>;
  };
  catalog?: CatalogItem[];
};
type BackgroundsResponse = BackgroundsApiData;

async function rotateOnce() {
  try {
    const [skinsRes, bgRes] = await Promise.all([
      fetch('/api/skins/inventory'),
      fetch('/api/backgrounds'),
    ]);
    if (!skinsRes.ok || !bgRes.ok) return;

    const skinsData = (await skinsRes.json()) as SkinsResponse;
    const bgData = (await bgRes.json()) as BackgroundsResponse;

    const inventory = skinsData.wardrobe?.inventory ?? {};
    const catalog = skinsData.catalog ?? [];
    const ownedBySlot: Record<WardrobeSlot, string[]> = {
      skin: [],
      hat: [],
      body: [],
      hand_item: [],
      container: [],
    };
    for (const item of catalog) {
      if ((inventory[item.id] ?? 0) > 0 && item.slot !== 'container') {
        ownedBySlot[item.slot]?.push(item.id);
      }
    }

    const equipCalls: Promise<unknown>[] = [];
    const slots: WardrobeSlot[] = ['skin', 'hat', 'body', 'hand_item'];
    for (const slot of slots) {
      const owned = ownedBySlot[slot];
      if (!owned || owned.length === 0) continue;
      const itemId = owned[Math.floor(Math.random() * owned.length)];
      equipCalls.push(
        fetch('/api/skins/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot, itemId }),
        }),
      );
    }

    const ownedBackgrounds = Object.entries(bgData.inventory ?? {})
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([id]) => id);
    let nextBackgroundData: BackgroundsApiData | null = null;
    if (ownedBackgrounds.length > 0) {
      const bgId = ownedBackgrounds[Math.floor(Math.random() * ownedBackgrounds.length)];
      nextBackgroundData = { ...bgData, equipped: bgId };
      equipCalls.push(
        fetch('/api/backgrounds/equip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: bgId }),
        }),
      );
    }

    await Promise.allSettled(equipCalls);
    // Revalidate the SWR caches the frog/wardrobe/background read from so the
    // new look shows up live, without needing a navigation or manual refresh.
    mutateInventoryCaches();
    if (nextBackgroundData) mutateBackgrounds(nextBackgroundData);
    mutateBackgrounds();
    window.dispatchEvent(new Event('wardrobe-refresh'));
    window.dispatchEvent(new Event('background-refresh'));
    window.dispatchEvent(new Event('style-shuffle-swap'));
  } catch {
    // silent
  }
}

export function StyleShuffleBadge({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = () => {
      setVisible(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setVisible(false), 2600);
    };
    window.addEventListener('style-shuffle-swap', handler);
    return () => {
      window.removeEventListener('style-shuffle-swap', handler);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          className={cn(
            'pointer-events-none flex items-center gap-1.5 rounded-full border border-border/50 bg-card/90 px-3 py-1.5 shadow-md backdrop-blur-sm',
            className,
          )}
        >
          <Shuffle className="h-3.5 w-3.5 text-fuchsia-500" />
          <span className="whitespace-nowrap text-[11px] font-black uppercase tracking-wide text-foreground">
            New look!
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GlobalSkinRotation() {
  const { user } = useAuth();
  const [interval, setIntervalValue] = useState<RotationInterval>('disabled');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setIntervalValue(getRotationInterval());
    const handler = () => setIntervalValue(getRotationInterval());
    window.addEventListener('skin-rotation-change', handler);
    return () => window.removeEventListener('skin-rotation-change', handler);
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!user || interval === 'disabled') return;
    const ms = INTERVAL_MS[interval];
    if (ms <= 0) return;
    timerRef.current = window.setInterval(() => {
      void rotateOnce();
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
