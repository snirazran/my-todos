'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CalendarCheck, FolderOpen, CopyPlus } from 'lucide-react';
import { useSheetStore } from '@/lib/sheetStore';

interface NotificationItem {
  id: number;
  content: React.ReactNode;
  undoAction?: () => void | Promise<void>;
  durationMs: number;
  dedupeKey: string;
  actionLabel: string;
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('|');
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

const MAX_IDENTICAL_TOASTS = 3;

function isUndoItem(n: NotificationItem) {
  return !!n.undoAction && n.actionLabel === 'Undo';
}

function useAutoDismiss(
  id: number | null,
  durationMs: number,
  paused: boolean,
  dismiss: (id: number) => void,
  remainingRef: React.MutableRefObject<Map<number, number>>,
) {
  useEffect(() => {
    if (id === null || paused) return;
    const remaining = remainingRef.current.get(id) ?? durationMs;
    const startedAt = Date.now();
    const timeout = setTimeout(() => dismiss(id), remaining);
    return () => {
      clearTimeout(timeout);
      remainingRef.current.set(
        id,
        Math.max(RESUME_FLOOR_MS, remaining - (Date.now() - startedAt)),
      );
    };
  }, [id, durationMs, paused, dismiss, remainingRef]);
}

interface NotificationContextType {
  showNotification: (
    content: React.ReactNode,
    undoAction?: () => void | Promise<void>,
    options?: { durationMs?: number; actionLabel?: string },
  ) => void;
  hideNotification: () => void;
  isVisible: boolean;
  count: number;
  /** Measured pixel height of the visible notification stack (0 when empty). */
  stackHeight: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

const NotificationItemContext = createContext<(() => void) | null>(null);

export function useDismissNotification() {
  return useContext(NotificationItemContext);
}

const NotificationBody = React.memo(function NotificationBody({
  id,
  dismiss,
  children,
}: {
  id: number;
  dismiss: (id: number) => void;
  children: React.ReactNode;
}) {
  const value = useCallback(() => dismiss(id), [dismiss, id]);
  return (
    <NotificationItemContext.Provider value={value}>
      {children}
    </NotificationItemContext.Provider>
  );
});

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotification must be used within a NotificationProvider',
    );
  }
  return context;
}

function readingTimeMs(text: string, hasAction: boolean): number {
  const words = text.split(/[\s|]+/).filter(Boolean).length;
  const base = Math.min(8000, 2500 + words * 280);
  return Math.max(base, hasAction ? 5000 : 3500);
}

const RESUME_FLOOR_MS = 1500;
const SWIPE_DISMISS_PX = 72;

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const [stackHeight, setStackHeight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const openSheets = useSheetStore((s) => s.count);
  const stackSuppressed = openSheets > 0;
  useEffect(() => setMounted(true), []);

  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [swiped, setSwiped] = useState<{ id: number; dir: number } | null>(
    null,
  );
  const remainingRef = useRef(new Map<number, number>());
  const stackRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const [deckHeight, setDeckHeight] = useState(0);
  const prevDeckHeightRef = useRef(0);
  const deckGrowing = deckHeight >= prevDeckHeightRef.current;
  useEffect(() => {
    prevDeckHeightRef.current = deckHeight;
  }, [deckHeight]);

  const dismiss = useCallback((id: number) => {
    remainingRef.current.delete(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Dismisses the front (most recent) notification.
  const hideNotification = useCallback(() => {
    setNotifications((prev) => prev.slice(0, -1));
  }, []);

  const showNotification = useCallback(
    (
      content: React.ReactNode,
      undoAction?: () => void | Promise<void>,
      options?: { durationMs?: number; actionLabel?: string },
    ) => {
      const id = Date.now() + Math.random();
      const dedupeKey = textOf(content);
      const item: NotificationItem = {
        id,
        content,
        undoAction,
        durationMs:
          options?.durationMs ?? readingTimeMs(dedupeKey, !!undoAction),
        dedupeKey,
        actionLabel: options?.actionLabel ?? 'Undo',
      };
      setNotifications((prev) => {
        if (
          dedupeKey &&
          prev.filter((n) => n.dedupeKey === dedupeKey).length >=
            MAX_IDENTICAL_TOASTS
        ) {
          return prev;
        }
        const base = isUndoItem(item)
          ? prev.filter((n) => !isUndoItem(n))
          : prev;
        return [...base, item];
      });
    },
    [],
  );

  const deckItems = notifications.filter((n) => !isUndoItem(n));
  const undoItem = notifications.filter(isUndoItem).at(-1) ?? null;
  const front = deckItems[deckItems.length - 1] ?? null;
  const frontId = front?.id ?? null;
  const undoId = undoItem?.id ?? null;
  const timerPaused =
    hovered || pressed || pageHidden || undoingId !== null || stackSuppressed;

  useAutoDismiss(frontId, front?.durationMs ?? 0, timerPaused, dismiss, remainingRef);
  useAutoDismiss(undoId, undoItem?.durationMs ?? 0, timerPaused, dismiss, remainingRef);

  useEffect(() => {
    setHovered(false);
    setPressed(false);
  }, [frontId, undoId]);

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () =>
      document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Measure the deck's natural (bottom-anchored) content height. Increases
  // apply immediately; decreases settle briefly first so the transient dip
  // while a toast exits and the next steps forward never reaches the layout —
  // the deck renders at an explicitly animated height driven by this value,
  // which is what the Frogodoro pill above it physically rests on.
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    let decreaseTimer: ReturnType<typeof setTimeout> | null = null;
    let lastApplied = -1;
    const apply = (value: number) => {
      lastApplied = value;
      setDeckHeight(value);
    };
    const update = () => {
      const next = el.offsetHeight;
      if (next >= lastApplied) {
        if (decreaseTimer) {
          clearTimeout(decreaseTimer);
          decreaseTimer = null;
        }
        if (next !== lastApplied) apply(next);
        return;
      }
      if (decreaseTimer) return;
      decreaseTimer = setTimeout(() => {
        decreaseTimer = null;
        apply(el.offsetHeight);
      }, 220);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (decreaseTimer) clearTimeout(decreaseTimer);
    };
  }, [mounted]);

  // Track the full rendered stack height so the FAB and friends can offset
  // cleanly; the deck's animated height already filters transient dips.
  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const update = () => setStackHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  const handleUndo = async (item: NotificationItem) => {
    if (!item.undoAction) return;
    setUndoingId(item.id);
    try {
      await item.undoAction();
    } catch (error) {
      console.error('Undo failed', error);
    } finally {
      setUndoingId(null);
      dismiss(item.id);
    }
  };

  const renderCard = (n: NotificationItem, depth: number) => {
        const isFront = depth === 0;
        const isSavedTasksToast = n.content === 'Moved to Saved Tasks';
        const isMovedToTodayToast = n.content === 'Moved to Today';
        const isDuplicateToast =
          typeof n.content === 'string' &&
          n.content.startsWith('Duplicated to');
        const isMoveToast =
          isSavedTasksToast || isMovedToTodayToast || isDuplicateToast;
        const isUndoing = undoingId === n.id;
        return (
          <motion.div
            key={n.id}
            custom={swiped}
            variants={{
              exit: (swipe: { id: number; dir: number } | null) =>
                swipe?.id === n.id
                  ? {
                      x: swipe.dir * 420,
                      opacity: 0,
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] },
                    }
                  : {
                      opacity: 0,
                      y: 8,
                      scale: 0.96,
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      transition: { duration: 0.16, ease: 'easeIn' },
                    },
            }}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{
              opacity: depth > 2 ? 0 : 1,
              y: depth * -10,
              scale: 1 - depth * 0.05,
            }}
            exit="exit"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            drag={isFront && !isUndoing ? 'x' : false}
            dragDirectionLock
            dragSnapToOrigin
            dragElastic={0.5}
            onDragEnd={(_, info) => {
              setPressed(false);
              if (
                Math.abs(info.offset.x) > SWIPE_DISMISS_PX ||
                Math.abs(info.velocity.x) > 600
              ) {
                setSwiped({ id: n.id, dir: Math.sign(info.offset.x) || 1 });
                dismiss(n.id);
              }
            }}
            onPointerEnter={
              isFront
                ? (e) => {
                    if (e.pointerType === 'mouse') setHovered(true);
                  }
                : undefined
            }
            onPointerLeave={
              isFront
                ? (e) => {
                    if (e.pointerType === 'mouse') setHovered(false);
                  }
                : undefined
            }
            onPointerDown={isFront ? () => setPressed(true) : undefined}
            onPointerUp={isFront ? () => setPressed(false) : undefined}
            onPointerCancel={isFront ? () => setPressed(false) : undefined}
            onFocusCapture={
              isFront
                ? (e) => {
                    if ((e.target as HTMLElement).matches?.(':focus-visible'))
                      setHovered(true);
                  }
                : undefined
            }
            onBlurCapture={isFront ? () => setHovered(false) : undefined}
            style={{ zIndex: 100 - depth, touchAction: 'pan-y' }}
            className={`${
              isFront
                ? 'pointer-events-auto relative'
                : 'pointer-events-none absolute inset-x-0 bottom-0'
            } flex w-full items-center gap-3 px-4 py-3 rounded-[18px] border border-border/50 bg-card/90 text-foreground shadow-sm backdrop-blur-2xl`}
          >
            {isMoveToast && (
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/25 bg-background"
              >
                {isSavedTasksToast ? (
                  <FolderOpen size={14} />
                ) : isDuplicateToast ? (
                  <CopyPlus size={14} />
                ) : (
                  <CalendarCheck size={14} />
                )}
              </span>
            )}
            <div className="min-w-0 flex-1 text-sm font-semibold">
              <NotificationBody id={n.id} dismiss={dismiss}>
                {n.content}
              </NotificationBody>
            </div>
            {n.undoAction && (
              <button
                onClick={() => handleUndo(n)}
                disabled={isUndoing}
                className="-my-1.5 flex h-9 shrink-0 items-center gap-2 rounded-full px-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUndoing ? (
                  <>
                    <svg
                      className="animate-spin h-3 w-3 text-current"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {n.actionLabel}
                  </>
                ) : (
                  n.actionLabel
                )}
              </button>
            )}
            <button
              onClick={() => dismiss(n.id)}
              disabled={isUndoing}
              className="-my-1.5 -mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </motion.div>
        );
  };

  return (
    <NotificationContext.Provider
      value={{
        showNotification,
        hideNotification,
        isVisible: !stackSuppressed && notifications.length > 0,
        count: stackSuppressed ? 0 : notifications.length,
        stackHeight: stackSuppressed ? 0 : stackHeight,
      }}
    >
      {children}
      {mounted &&
        createPortal(
          // Portaled to <body> so the timer pill / toasts sit in the root
          // stacking context and stay above body-level sheets (e.g. settings)
          // regardless of any ancestor stacking context.
          <div
            ref={stackRef}
            className={`fixed left-0 right-0 z-[1300] pointer-events-none flex flex-col gap-2 px-3 md:px-4 bottom-[calc(env(safe-area-inset-bottom)+72px)] md:bottom-[calc(env(safe-area-inset-bottom)+16px)] ${stackSuppressed ? 'hidden' : ''}`}
          >
        {/* Top slot: timer pill portals in here (above all toasts) */}
        <div id="frog-bottom-stack-top" className="contents" />
        <AnimatePresence initial={false}>
          {undoItem && (
            <motion.div
              key={undoItem.id}
              role="status"
              aria-live="polite"
              className="w-full md:w-[380px] md:self-end"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderCard(undoItem, 0)}
            </motion.div>
          )}
        </AnimatePresence>
        {/* Deck stack: newest toast in front; older ones peek out behind it
            and step forward as the front one leaves. The wrapper renders at an
            explicitly animated height (measured with dip-filtering) so the
            pill above never bounces during the exit/step-forward handoff; the
            inner padding reserves room for the peeking cards. */}
        <motion.div
          className="relative w-full md:w-[380px] md:self-end"
          initial={false}
          animate={{ height: deckHeight }}
          transition={
            // Grow instantly so bottom-anchored toasts never poke above the
            // wrapper into the pill; only shrinks (already dip-filtered) ease.
            deckGrowing
              ? { duration: 0 }
              : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
          }
        >
        <div
          ref={deckRef}
          role="status"
          aria-live="polite"
          aria-atomic="false"
          className="absolute inset-x-0 bottom-0"
          style={{
            paddingTop:
              Math.min(Math.max(deckItems.length - 1, 0), 2) * 10,
          }}
        >
        <AnimatePresence initial={false} custom={swiped}>
          {deckItems.map((n, index) =>
            renderCard(n, deckItems.length - 1 - index),
          )}
        </AnimatePresence>
        </div>
        </motion.div>
        {/* Bottom slot: cinematic skip hint portals in here (below all toasts) */}
        <div id="frog-bottom-stack-bottom" className="contents" />
          </div>,
          document.body,
        )}
    </NotificationContext.Provider>
  );
}
