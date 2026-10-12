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
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
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

export const TOAST_SURFACE_STYLE = {
  backgroundColor: 'var(--toast-surface, hsl(115 36% 36%))',
  boxShadow:
    '0 0 0 1px rgb(255 255 255 / 0.08), 0 14px 28px -18px rgb(28 64 26 / 0.7)',
  '--foreground': '0 0% 100%',
  '--muted-foreground': '110 40% 88%',
  '--primary': '0 0% 100%',
} as React.CSSProperties;

const RESUME_FLOOR_MS = 1500;

const TOAST_EASE_OUT = [0.22, 1, 0.36, 1] as const;
const TOAST_EASE_IN = [0.4, 0, 1, 1] as const;
const TOAST_RESTING = 'translateX(0%) translateY(0%) scale(1)';
const TOAST_ENTER_FROM = 'translateX(0%) translateY(70%) scale(0.94)';
const TOAST_EXIT_TO = 'translateX(0%) translateY(35%) scale(0.96)';

function SwipeableToast({
  disabled,
  onSwipe,
  onDragSettled,
  className,
  style,
  children,
}: {
  disabled: boolean;
  onSwipe: (dir: number) => void;
  onDragSettled: () => void;
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-180, 0, 180], [0.3, 1, 0.3]);
  return (
    <motion.div
      drag={disabled ? false : 'x'}
      dragDirectionLock
      dragMomentum={false}
      onDragEnd={(_, info) => {
        onDragSettled();
        if (
          Math.abs(info.offset.x) > SWIPE_DISMISS_PX ||
          Math.abs(info.velocity.x) > 600
        ) {
          onSwipe(Math.sign(info.offset.x || info.velocity.x) || 1);
          return;
        }
        animate(x, 0, { type: 'spring', stiffness: 600, damping: 40 });
      }}
      style={{ ...style, x, opacity, touchAction: 'pan-y' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
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
  const reduceMotion = useReducedMotion();
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

  const current = undoItem ?? front;

  useAutoDismiss(
    frontId,
    front?.durationMs ?? 0,
    timerPaused || undoId !== null,
    dismiss,
    remainingRef,
  );
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

  const renderCard = (n: NotificationItem) => {
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
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: TOAST_ENTER_FROM }}
            animate={{
              opacity: 1,
              transform: TOAST_RESTING,
              transition: {
                duration: 0.42,
                ease: TOAST_EASE_OUT,
                opacity: { duration: 0.2, ease: 'linear' },
              },
            }}
            variants={{
              exit: (swipe: { id: number; dir: number } | null) =>
                swipe?.id === n.id
                  ? {
                      opacity: 0,
                      transform: `translateX(${swipe.dir * 110}%) translateY(0%) scale(1)`,
                      transition: { duration: 0.24, ease: TOAST_EASE_OUT },
                    }
                  : reduceMotion
                    ? { opacity: 0, transition: { duration: 0.15 } }
                    : {
                        opacity: 0,
                        transform: TOAST_EXIT_TO,
                        transition: { duration: 0.18, ease: TOAST_EASE_IN },
                      },
            }}
            exit="exit"
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') setHovered(true);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') setHovered(false);
            }}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onFocusCapture={(e) => {
              if ((e.target as HTMLElement).matches?.(':focus-visible'))
                setHovered(true);
            }}
            onBlurCapture={() => setHovered(false)}
            style={{ willChange: 'transform, opacity' }}
            className="pointer-events-auto relative w-full"
          >
          <SwipeableToast
            disabled={isUndoing}
            onDragSettled={() => setPressed(false)}
            onSwipe={(dir) => {
              setSwiped({ id: n.id, dir });
              dismiss(n.id);
            }}
            style={TOAST_SURFACE_STYLE}
            className="dark relative flex min-h-12 w-full items-center gap-3 overflow-hidden rounded-[18px] px-3.5 py-2 text-foreground"
          >
            {isMoveToast && (
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
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
                className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-white/20 px-3.5 text-sm font-black text-primary transition-colors hover:bg-white/25 active:bg-white/30 disabled:cursor-not-allowed disabled:opacity-50"
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
              className={`-my-1.5 -mr-2 ${n.undoAction ? 'hidden md:grid' : 'grid'} h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-50`}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
            {isUndoItem(n) && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left bg-primary/70"
                style={{
                  animation: `toast-countdown ${n.durationMs}ms linear forwards`,
                  animationPlayState:
                    timerPaused || isUndoing ? 'paused' : 'running',
                }}
              />
            )}
          </SwipeableToast>
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
        <div
          role="status"
          aria-live="polite"
          className="relative w-full md:w-[380px] md:self-end"
        >
          <AnimatePresence initial={false} mode="popLayout" custom={swiped}>
            {current && renderCard(current)}
          </AnimatePresence>
        </div>
        {/* Bottom slot: cinematic skip hint portals in here (below all toasts) */}
        <div id="frog-bottom-stack-bottom" className="contents" />
          </div>,
          document.body,
        )}
    </NotificationContext.Provider>
  );
}
