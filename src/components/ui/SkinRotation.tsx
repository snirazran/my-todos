'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronRight,
  Lock,
  LockOpen,
  Sun,
  Undo2,
} from 'lucide-react';
import useSWR, { mutate as mutateSWR } from 'swr';
import { create } from 'zustand';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { useNotification } from '@/components/providers/NotificationProvider';
import { cn } from '@/lib/utils';
import { hapticImpact, hapticSuccess, hapticTick } from '@/lib/haptics';
import { Icon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { CloseButton } from '@/components/ui/CloseButton';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { PurchaseBurst } from '@/components/ui/skins/PurchaseBurst';
import { HEADER_CONTROL_ICON_BUTTON } from '@/components/ui/MobileHeaderActions';
import {
  beginEquipMutation,
  endEquipMutation,
  mutateInventoryCaches,
} from '@/hooks/useInventory';
import { mutateBackgrounds, useBackgrounds } from '@/hooks/useBackgrounds';
import { useLooks } from '@/hooks/useLooks';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { looksMatch } from '@/lib/skins/looks';
import { useTryOnStore, type TryOnOffer } from '@/lib/tryOnStore';
import { whenAutoPopupsAllowed, whenScreenIsFree } from '@/lib/popupGate';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import {
  ROTATION_INTERVAL_MS,
  isRotationInterval,
  localDayKey,
  type RotationInterval,
  type ShuffleLock,
  type ShuffleSource,
} from '@/lib/skins/styleShuffle';

const SHUFFLE_API = '/api/skins/shuffle';

const useStyleShuffleOpen = create<{ open: boolean }>(() => ({ open: false }));

export function openStyleShuffle() {
  useStyleShuffleOpen.setState({ open: true });
}

type FrameIndices = { skin: number; hat: number; body: number; hand_item: number };
const FRAME_SLOTS: (keyof FrameIndices)[] = ['skin', 'hat', 'body', 'hand_item'];
const FRAME_COUNT = 6;
const SPIN_STEP_MS = 75;
const SPIN_SLOW_STEP_MS = 200;
const SPIN_HAPTIC_CAP_MS = 1800;
const SETTLE_STEPS_MS = [110, 145, 190];

function buildFrames(
  catalog: { id: string; slot: string; riveIndex: number }[] | undefined,
  inventory: Record<string, number> | undefined,
  current: FrameIndices,
  locked: Set<string>,
): FrameIndices[] {
  const pools: Record<string, number[]> = { skin: [], hat: [], body: [], hand_item: [] };
  for (const item of catalog ?? []) {
    if ((inventory?.[item.id] ?? 0) > 0 && pools[item.slot]) {
      pools[item.slot].push(item.riveIndex);
    }
  }
  return Array.from({ length: FRAME_COUNT }, () => {
    const frame = { ...current };
    for (const slot of FRAME_SLOTS) {
      if (locked.has(slot)) continue;
      const options = [0, ...pools[slot]];
      frame[slot] = options[Math.floor(Math.random() * options.length)];
    }
    return frame;
  });
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const MAX_SPIN_MS = 3500;
const REFRESH_WAIT_MS = 3000;
const SHUFFLE_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
const LEGACY_STORAGE_KEY = 'skinRotationInterval';
const AUTO_CHECK_MS = 15 * 60 * 1000;

const SHUFFLE_ICON_ON_DARK = cn(
  'dark:[&_path:nth-child(1)]:fill-[#57a851]',
  'dark:[&_path:nth-child(2)]:fill-[#cfd8d1] dark:[&_path:nth-child(2)]:stroke-[#7d8a80]',
  'dark:[&_path:nth-child(3)]:fill-[#2c7a2a]',
  'dark:[&_path:nth-child(4)]:fill-[#4a564d]',
);

const ACCENT_TEXT = 'text-[#3a7534] dark:text-[#8fd18a]';
const ACCENT_SELECTED =
  'border-[#3f7d39] bg-[#3f7d39]/10 dark:border-[#6fbf69] dark:bg-[#6fbf69]/15';

export type { RotationInterval };

export type ShuffleSlot = ShuffleLock;

const SLOT_LABELS: { slot: ShuffleLock; label: string }[] = [
  { slot: 'skin', label: 'Skin' },
  { slot: 'hat', label: 'Hat' },
  { slot: 'body', label: 'Body' },
  { slot: 'hand_item', label: 'Held' },
  { slot: 'background', label: 'Background' },
];

// Minute-scale rotation is deliberately gone: at that speed the outfit stops
// being a choice the player made and becomes wallpaper, which is exactly what
// stops people visiting the wardrobe at all.
const OPTIONS: { value: RotationInterval; label: string; short: string }[] = [
  { value: 'disabled', label: 'Off', short: 'Off' },
  { value: '1h', label: 'Every hour', short: 'Hourly' },
  { value: '1d', label: 'Every day', short: 'Daily' },
];

const SOURCE_OPTIONS: { value: ShuffleSource; label: string }[] = [
  { value: 'wardrobe', label: 'Wardrobe' },
  { value: 'looks', label: 'Saved looks' },
];

type ShufflePiece = { slot: ShuffleLock; name: string | null; options: number };

type ShuffleState = {
  interval: RotationInterval;
  lockedSlots?: ShuffleLock[];
  source?: ShuffleSource;
  eligible?: boolean;
  shuffleableSlots?: ShuffleLock[];
  ownedCount?: number;
  pieces?: ShufflePiece[];
  looksCount?: number;
  canUndo?: boolean;
  lastAutoAt?: string | null;
};

type ShufflePatch = Partial<
  Pick<ShuffleState, 'interval' | 'lockedSlots' | 'source'>
>;

const shuffleFetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load shuffle setting');
  return (await res.json()) as ShuffleState;
};

export function useShuffleInterval() {
  const { user } = useAuth();
  const { data, mutate } = useSWR(user ? SHUFFLE_API : null, shuffleFetcher);

  const patch = useCallback(
    async (body: ShufflePatch) => {
      const optimistic = (curr?: ShuffleState): ShuffleState => ({
        ...(curr ?? { interval: 'disabled' as RotationInterval }),
        ...body,
        ...(body.interval ? { lastAutoAt: new Date().toISOString() } : {}),
      });
      try {
        await mutate(
          async (curr) => {
            const res = await fetch(SHUFFLE_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(
                body.interval ? { ...body, localDay: localDayKey() } : body,
              ),
            });
            if (!res.ok) throw new Error('Failed to save shuffle setting');
            return optimistic(curr);
          },
          { optimisticData: optimistic, rollbackOnError: true, revalidate: false },
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
    (lockedSlots: ShuffleLock[]) => patch({ lockedSlots }),
    [patch],
  );
  const setSource = useCallback(
    (source: ShuffleSource) => patch({ source }),
    [patch],
  );

  return {
    value: normalizeInterval(data?.interval),
    setValue,
    setLockedSlots,
    setSource,
    lockedSlots: data?.lockedSlots ?? [],
    source: data?.source ?? 'wardrobe',
    eligible: data?.eligible ?? false,
    shuffleableSlots: data?.shuffleableSlots ?? [],
    ownedCount: data?.ownedCount ?? 0,
    pieces: data?.pieces ?? [],
    looksCount: data?.looksCount ?? 0,
    canUndo: data?.canUndo ?? false,
    lastAutoAt: data?.lastAutoAt ?? null,
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

function autoStatus(interval: RotationInterval, lastAutoAt: string | null) {
  if (interval === 'disabled') return 'Your look stays until you change it.';
  if (interval === '1d')
    return 'A fresh fit the first time you open the app each day.';
  const last = lastAutoAt ? new Date(lastAutoAt).getTime() : 0;
  const mins = Math.ceil(
    (last + ROTATION_INTERVAL_MS['1h'] - Date.now()) / 60000,
  );
  if (!last || mins <= 1) return 'A new fit each hour — next one any moment.';
  return `A new fit each hour — next in about ${mins} min.`;
}

function pieceHint(piece: ShufflePiece | undefined, usable: boolean) {
  if (!piece) return '';
  if (!usable) return piece.options === 0 ? 'None owned' : 'Only 1 owned';
  return piece.name ?? 'Nothing on';
}

export function SkinRotationRow() {
  const { value } = useShuffleInterval();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/50 text-left"
      >
        <div className="h-9 w-9 flex items-center justify-center shrink-0">
          <Icon name="shuffle" className="w-10 h-10" />
        </div>
        <span className="flex-1 text-sm font-bold truncate">Style Shuffle</span>
        <span className="text-xs font-bold text-muted-foreground">
          {labelForInterval(value)}
        </span>
        <ChevronRight aria-hidden className="w-4 h-4 text-muted-foreground" />
      </button>
      <SkinRotationDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() =>
      ref.current?.focus({ preventScroll: true }),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = Array.from(
        ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), [href], [tabindex="0"]',
        ),
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return ref;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  describedBy,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  describedBy?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, step: number) => {
    for (let i = 1; i <= options.length; i++) {
      const idx = (from + step * i + options.length) % options.length;
      if (!options[idx].disabled) {
        onChange(options[idx].value);
        refs.current[idx]?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className="flex rounded-xl bg-muted/70 p-0.5"
    >
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (selected) return;
              hapticTick();
              onChange(opt.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(idx, 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(idx, -1);
              }
            }}
            className={cn(
              'relative min-h-10 flex-1 rounded-[10px] px-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f7d39] disabled:cursor-not-allowed disabled:opacity-40',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({
  title,
  hint,
  hintId,
  children,
}: {
  title: string;
  hint: string;
  hintId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="shrink-0 text-[13px] font-black text-foreground">
          {title}
        </h3>
        <div className="w-full max-w-[220px]">{children}</div>
      </div>
      <p id={hintId} className="mt-1.5 text-xs font-medium text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

export function SkinRotationDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [shuffling, setShuffling] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const [frameSeed, setFrameSeed] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [status, setStatus] = useState<{
    msg: string;
    tone: 'info' | 'error';
  } | null>(null);
  const {
    value: interval,
    setValue: setInterval,
    eligible,
    shuffleableSlots,
    lockedSlots,
    setLockedSlots,
    source,
    setSource,
    pieces,
    looksCount,
    canUndo,
    lastAutoAt,
    ownedCount,
    loaded,
    refresh,
  } = useShuffleInterval();
  const {
    looks,
    save: saveLook,
    isFull: looksFull,
    busy: savingLook,
  } = useLooks(open);
  const { ownedIndices, wardrobeData } = useWardrobeIndices(open);
  const { data: backgrounds } = useBackgrounds(open);
  const dialogRef = useDialogFocus(open, onClose);

  useEffect(() => {
    if (open) {
      setStatus(null);
      setMoreOpen(false);
      setActiveFrame(null);
      void refresh();
    }
  }, [open, refresh]);

  const equipped = wardrobeData?.wardrobe?.equipped;
  const equippedBg = backgrounds?.equipped ?? null;
  const bgImage =
    backgrounds?.catalog.find((bg) => bg.id === equippedBg)?.images.mobile ??
    null;
  const alreadySaved =
    !!equipped &&
    looks.some((look) =>
      looksMatch(look.equipped, equipped, look.backgroundId, equippedBg),
    );

  const lookKey = `${ownedIndices.skin}-${ownedIndices.hat}-${ownedIndices.body}-${ownedIndices.hand_item}`;

  const locked = new Set(lockedSlots);
  const allLocked =
    shuffleableSlots.length > 0 &&
    shuffleableSlots.every((slot) => locked.has(slot));
  const canShuffle = eligible && !allLocked;

  const inventory = (wardrobeData?.wardrobe as { inventory?: Record<string, number> } | undefined)
    ?.inventory;
  const frames = React.useMemo(
    () => buildFrames(wardrobeData?.catalog, inventory, ownedIndices, locked),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frameSeed, wardrobeData?.catalog, inventory, lockedSlots.join(',')],
  );

  const toggleLock = (slot: ShuffleLock) => {
    hapticTick();
    const next = new Set(locked);
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    void setLockedSlots(Array.from(next));
  };

  const shuffleNow = async () => {
    if (shuffling || !canShuffle) return;
    setShuffling(true);
    setStatus(null);
    hapticImpact();
    let settled = false;
    const failed: RotateResult = { ok: false, shuffled: false, tryOn: null };
    const request = withTimeout(rotateOnce(), SHUFFLE_TIMEOUT_MS, failed).then(
      async (result) => {
        if (result.ok) {
          await withTimeout<unknown>(
            Promise.all([refresh(), mutateSWR('/api/skins/inventory?view=summary')]),
            REFRESH_WAIT_MS,
            null,
          );
        }
        settled = true;
        return result;
      },
    );
    if (!reduceMotion) {
      let step = 0;
      const spinStarted = performance.now();
      while (
        (!settled && performance.now() - spinStarted < MAX_SPIN_MS) ||
        step < 3
      ) {
        const long = performance.now() - spinStarted > SPIN_HAPTIC_CAP_MS;
        setActiveFrame(step % FRAME_COUNT);
        if (!long) hapticTick();
        step += 1;
        await sleep(long ? SPIN_SLOW_STEP_MS : SPIN_STEP_MS);
      }
      for (const delay of SETTLE_STEPS_MS) {
        setActiveFrame(step % FRAME_COUNT);
        hapticTick();
        step += 1;
        await sleep(delay);
      }
    }
    const result = await request;
    setActiveFrame(null);
    setShuffling(false);
    setFrameSeed((seed) => seed + 1);
    if (!result.ok) {
      setStatus({ msg: "Couldn't shuffle — check your connection.", tone: 'error' });
    } else if (!result.shuffled) {
      setStatus({ msg: 'Nothing new to try with these locks.', tone: 'info' });
    } else {
      setBurstKey((key) => key + 1);
      hapticSuccess();
    }
  };

  const undo = async () => {
    if (shuffling || !canUndo) return;
    setShuffling(true);
    setStatus(null);
    hapticTick();
    const result = await withTimeout(
      rotateOnce({ undo: true }),
      SHUFFLE_TIMEOUT_MS,
      { ok: false, shuffled: false, tryOn: null } as RotateResult,
    );
    await withTimeout<unknown>(
      Promise.all([refresh(), mutateSWR('/api/skins/inventory?view=summary')]),
      REFRESH_WAIT_MS,
      null,
    );
    setShuffling(false);
    if (!result.ok) {
      setStatus({ msg: "Couldn't undo — try again.", tone: 'error' });
    }
  };

  const handleSaveLook = async () => {
    if (alreadySaved) return;
    setStatus(null);
    const result = await saveLook();
    if (result.ok) {
      hapticSuccess();
      void refresh();
    } else if (result.error) {
      setStatus({ msg: result.error, tone: 'error' });
    }
  };

  const sourceOptions = SOURCE_OPTIONS.map((opt) => ({
    ...opt,
    disabled: opt.value === 'looks' && looksCount < 2,
  }));
  const autoOn = interval !== 'disabled';

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1500}
      showClose={false}
      className="sm:max-w-md"
    >
      {({ bindScroll }) => (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="style-shuffle-title"
          tabIndex={-1}
          className="relative flex max-h-[88dvh] flex-col outline-none sm:max-h-[calc(100dvh-3rem)]"
        >
          <CloseButton onClick={onClose} className="h-11 w-11" />
          <div
            ref={bindScroll}
            className="overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-0.5 sm:px-5 sm:pt-4"
          >
            <div className="flex h-11 items-center gap-2 pr-12">
              <Icon name="shuffle" className={cn('h-8 w-8 shrink-0', SHUFFLE_ICON_ON_DARK)} />
              <h2
                id="style-shuffle-title"
                className="text-lg font-black leading-tight tracking-tight text-foreground"
              >
                Style Shuffle
              </h2>
            </div>

            {loaded && !eligible ? (
              <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-center">
                <p className="text-sm font-black text-foreground">
                  {ownedCount > 0 ? 'One more outfit to go' : 'Your wardrobe is empty'}
                </p>
                <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                  Collect a second piece and shuffling unlocks.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push('/wardrobe?tab=shop');
                  }}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#447d3f] px-5 text-sm font-black tracking-wide text-white shadow-[0_3px_0_0_#2c511a] transition-transform active:translate-y-0.5 active:shadow-none"
                >
                  Browse the shop
                </button>
              </div>
            ) : (
              <>
                <div className="relative mt-2 h-52 overflow-hidden rounded-[28px] border border-border/50 bg-gradient-to-b from-[#e8f3e4] to-[#cfe6c6] dark:from-[#1d2a1f] dark:to-[#142016]">
                  {bgImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bgImage}
                      alt=""
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[50%_70%]"
                    />
                  )}
                  {burstKey > 0 && (
                    <PurchaseBurst key={burstKey} rarity="rare" size={300} className="top-[62%]" />
                  )}
                  <div role="img" aria-label="Your frog's current look" className="pointer-events-none absolute inset-0">
                    {frames.map((frame, index) => (
                      <div
                        key={`${frameSeed}-${index}`}
                        className="absolute inset-x-0 bottom-3 z-10 flex justify-center"
                        style={{ visibility: activeFrame === index ? 'visible' : 'hidden' }}
                      >
                        <FrogSnapshot indices={frame} width={224} height={250} />
                      </div>
                    ))}
                    <div
                      className="absolute inset-x-0 bottom-3 z-10 flex justify-center"
                      style={{ visibility: activeFrame === null ? 'visible' : 'hidden' }}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        <motion.div
                          key={lookKey}
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.06 }}
                          transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', damping: 14, stiffness: 340 }}
                        >
                          <FrogSnapshot indices={ownedIndices} width={224} height={250} />
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>

                  {canUndo && !shuffling && (
                    <button
                      type="button"
                      onClick={undo}
                      className="absolute left-2.5 top-2.5 z-20 flex min-h-10 items-center gap-1.5 rounded-full bg-card/90 px-3.5 text-xs font-black text-foreground shadow-sm backdrop-blur transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#447d3f]"
                    >
                      <Undo2 aria-hidden className="h-4 w-4" />
                      Undo
                    </button>
                  )}
                  {!shuffling && (
                    <button
                      type="button"
                      onClick={handleSaveLook}
                      disabled={savingLook || alreadySaved || looksFull}
                      className={cn(
                        'absolute right-2.5 top-2.5 z-20 flex min-h-10 items-center gap-1.5 rounded-full bg-card/90 px-3.5 text-xs font-black shadow-sm backdrop-blur transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#447d3f] disabled:cursor-default',
                        alreadySaved ? ACCENT_TEXT : 'text-foreground disabled:opacity-60',
                      )}
                    >
                      {alreadySaved ? (
                        <BookmarkCheck aria-hidden className="h-4 w-4" />
                      ) : (
                        <Bookmark aria-hidden className="h-4 w-4" />
                      )}
                      {alreadySaved ? 'Kept' : looksFull ? 'Looks full' : 'Keep look'}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={shuffleNow}
                  disabled={shuffling || !canShuffle}
                  aria-busy={shuffling}
                  className="mt-4 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[22px] bg-[#447d3f] text-[17px] font-black tracking-wide text-white shadow-[0_5px_0_0_#2c511a] transition-all active:translate-y-1 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#447d3f] focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-60 disabled:shadow-none"
                >
                  <Icon
                    name="shuffle"
                    className={cn(
                      'h-7 w-7 shrink-0 [&_path:first-child]:fill-[#a8d98c]',
                      shuffling && 'motion-safe:animate-spin',
                    )}
                  />
                  {shuffling ? 'Shuffling…' : 'Shuffle'}
                </button>

                <p
                  aria-live="polite"
                  className={cn(
                    'px-1 text-center text-xs font-bold',
                    (status || allLocked) && 'pt-2',
                    status?.tone === 'error'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-muted-foreground',
                  )}
                >
                  {status?.msg ??
                    (allLocked ? 'Everything is locked — unlock a piece in More options.' : '')}
                </p>

                <button
                  type="button"
                  role="switch"
                  aria-checked={autoOn}
                  onClick={() => {
                    hapticTick();
                    void setInterval(autoOn ? 'disabled' : '1d');
                  }}
                  className="mt-3 flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 ring-inset ring-border/70 transition-colors active:bg-muted/50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300">
                    <Sun className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-black text-foreground">
                      Surprise me every morning
                    </span>
                    <span className="block truncate text-xs font-medium text-muted-foreground">
                      {interval === '1h' ? 'On — a new look every hour' : autoOn ? autoStatus(interval, lastAutoAt) : 'Wake up to a fresh look'}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'relative h-7 w-12 shrink-0 rounded-full transition-colors',
                      autoOn ? 'bg-[#447d3f]' : 'bg-muted-foreground/25',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                        autoOn ? 'translate-x-[22px]' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                </button>

                <button
                  type="button"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((value) => !value)}
                  className="mx-auto mt-2 flex min-h-10 items-center gap-1 rounded-xl px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  More options
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')}
                    strokeWidth={2.75}
                  />
                </button>

                {moreOpen && (
                  <div className="mt-1 space-y-3">
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
                        <h3 className="text-[13px] font-black text-foreground">Keep these</h3>
                        <p className="text-xs font-medium text-muted-foreground">Locked pieces stay on</p>
                      </div>
                      <div
                        role="group"
                        aria-label="Keep these — locked pieces stay on when you shuffle"
                        className="grid grid-cols-2 gap-1.5"
                      >
                        {SLOT_LABELS.map(({ slot, label }) => {
                          const isLocked = locked.has(slot);
                          const usable = shuffleableSlots.includes(slot) || isLocked;
                          const piece = pieces.find((p) => p.slot === slot);
                          return (
                            <button
                              key={slot}
                              type="button"
                              aria-pressed={isLocked}
                              disabled={!usable}
                              onClick={() => toggleLock(slot)}
                              className={cn(
                                'flex min-h-12 items-center gap-2 rounded-2xl border-2 px-2.5 py-1.5 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#447d3f] disabled:cursor-not-allowed',
                                slot === 'background' && 'col-span-2',
                                !usable
                                  ? 'border-dashed border-border/60 opacity-60'
                                  : isLocked
                                    ? ACCENT_SELECTED
                                    : 'border-border/70 hover:border-border',
                              )}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                                  isLocked
                                    ? 'bg-[#447d3f] text-white dark:bg-[#6fbf69] dark:text-[#10210f]'
                                    : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {isLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                              </span>
                              <span className="min-w-0 flex-1 leading-tight">
                                <span className={cn('block text-[13px] font-black', isLocked ? ACCENT_TEXT : 'text-foreground')}>
                                  {label}
                                </span>
                                <span className="block truncate text-xs font-medium text-muted-foreground">
                                  {pieceHint(piece, usable)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
                      <SettingRow
                        title="Shuffle from"
                        hintId="style-shuffle-source-hint"
                        hint={
                          looksCount < 2
                            ? 'Keep 2 looks to shuffle between favourites.'
                            : source === 'looks'
                              ? `Rotates between your ${looksCount} kept looks.`
                              : 'Any piece you own, favouring ones you wear often.'
                        }
                      >
                        <Segmented
                          label="Shuffle from"
                          value={looksCount < 2 ? 'wardrobe' : source}
                          options={sourceOptions}
                          onChange={(v) => void setSource(v)}
                          describedBy="style-shuffle-source-hint"
                        />
                      </SettingRow>
                      <SettingRow
                        title="How often"
                        hintId="style-shuffle-auto-hint"
                        hint={autoStatus(interval, lastAutoAt)}
                      >
                        <Segmented
                          label="How often"
                          value={interval}
                          options={OPTIONS.map((o) => ({ value: o.value, label: o.short }))}
                          onChange={(v) => void setInterval(v)}
                          describedBy="style-shuffle-auto-hint"
                        />
                      </SettingRow>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

function showTryOn(offer: TryOnOffer) {
  whenScreenIsFree(
    () => {
      useTryOnStore.getState().show(offer);
      trackAnalyticsEvent('tryon_shown', {
        item_id: offer.itemId,
        price: offer.price,
        can_afford: offer.canAfford,
      });
    },
    { dropAfterMs: 60_000 },
  );
}

type RotateResult = { ok: boolean; shuffled: boolean; tryOn: TryOnOffer | null };

async function rotateOnce({
  auto = false,
  undo = false,
}: { auto?: boolean; undo?: boolean } = {}): Promise<RotateResult> {
  let spinStarted = !auto;
  if (spinStarted) window.dispatchEvent(new Event('style-shuffle-start'));
  beginEquipMutation();
  const controller = new AbortController();
  const abortTimer = window.setTimeout(() => controller.abort(), SHUFFLE_TIMEOUT_MS);
  try {
    const res = await fetch(SHUFFLE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto, undo, localDay: localDayKey() }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, shuffled: false, tryOn: null };
    const data = (await res.json()) as {
      shuffled?: boolean;
      tryOn?: TryOnOffer | null;
    };
    if (!data.shuffled) return { ok: true, shuffled: false, tryOn: null };

    if (!spinStarted) {
      spinStarted = true;
      window.dispatchEvent(new Event('style-shuffle-start'));
    }
    mutateInventoryCaches();
    mutateBackgrounds();
    window.dispatchEvent(new Event('wardrobe-refresh'));
    window.dispatchEvent(new Event('background-refresh'));
    window.dispatchEvent(new Event('style-shuffle-swap'));

    if (data.tryOn) showTryOn(data.tryOn);
    return { ok: true, shuffled: true, tryOn: data.tryOn ?? null };
  } catch {
    return { ok: false, shuffled: false, tryOn: null };
  } finally {
    window.clearTimeout(abortTimer);
    endEquipMutation();
    if (spinStarted) window.dispatchEvent(new Event('style-shuffle-end'));
  }
}

export function StyleShuffleHeaderButton({
  className,
}: {
  className?: string;
}) {
  const pathname = usePathname();
  const { eligible, loaded } = useShuffleInterval();
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
  if (pathname?.startsWith('/wardrobe')) return null;

  return (
    <>
      <button
        type="button"
        onClick={openStyleShuffle}
        aria-label="Style Shuffle"
        aria-haspopup="dialog"
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
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#447d3f] [animation:shuffle-ping_0.9s_cubic-bezier(0,0,0.2,1)_both] motion-reduce:hidden"
          />
        )}
        <span
          className={cn(
            'flex items-center justify-center will-change-transform',
            spinning &&
              '[animation:spin_0.7s_linear_infinite] motion-reduce:[animation:none]',
          )}
          onAnimationIteration={() => {
            if (stopRequested.current) {
              if (failsafeRef.current) window.clearTimeout(failsafeRef.current);
              setSpinning(false);
            }
          }}
        >
          <Icon name="shuffle" className={cn('h-7 w-7', SHUFFLE_ICON_ON_DARK)} />
        </span>
      </button>
    </>
  );
}

export function StyleShufflePill({ className }: { className?: string }) {
  const { eligible, loaded } = useShuffleInterval();
  if (!loaded || !eligible) return null;
  return (
    <button
      type="button"
      data-hint="wardrobe-shuffle"
      aria-haspopup="dialog"
      onClick={() => {
        hapticTick();
        openStyleShuffle();
      }}
      className={cn(
        'inline-flex min-h-9 items-center gap-1 rounded-full border border-border/60 bg-background/90 pl-1.5 pr-3 text-xs font-bold text-foreground shadow-sm backdrop-blur-md transition-[background-color,transform] hover:bg-background active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        className,
      )}
    >
      <Icon name="shuffle" className={cn('h-6 w-6', SHUFFLE_ICON_ON_DARK)} />
      Shuffle
    </button>
  );
}

export function GlobalSkinRotation() {
  const { user } = useAuth();
  const { value: interval, setValue, refresh } = useShuffleInterval();
  const { showNotification } = useNotification();
  const migratedRef = useRef(false);
  const inFlightRef = useRef(false);

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
    if (!user || interval === 'disabled') return;

    const check = async () => {
      if (inFlightRef.current || document.visibilityState !== 'visible') return;
      inFlightRef.current = true;
      try {
        const result = await rotateOnce({ auto: true });
        if (!result.shuffled) return;
        void refresh();
        if (result.tryOn) return;
        whenAutoPopupsAllowed(
          () =>
            showNotification(
              interval === '1d'
                ? "Style Shuffle picked today's fit"
                : 'Style Shuffle changed your look',
              async () => {
                await rotateOnce({ undo: true });
                void refresh();
              },
              { actionLabel: 'Undo', durationMs: 6000 },
            ),
          { dropAfterMs: 30_000 },
        );
      } finally {
        inFlightRef.current = false;
      }
    };

    void check();
    const timer = window.setInterval(
      () => void check(),
      Math.min(AUTO_CHECK_MS, ROTATION_INTERVAL_MS[interval]),
    );
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, interval, refresh, showNotification]);

  const open = useStyleShuffleOpen((state) => state.open);
  return (
    <SkinRotationDialog
      open={open}
      onClose={() => useStyleShuffleOpen.setState({ open: false })}
    />
  );
}
