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

interface NotificationContextType {
  showNotification: (
    content: React.ReactNode,
    undoAction?: () => void | Promise<void>,
    options?: { durationMs?: number },
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

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotification must be used within a NotificationProvider',
    );
  }
  return context;
}

const AUTO_DISMISS_MS = 3000;

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

  const frontTimerRef = useRef<{
    id: number;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const [deckHeight, setDeckHeight] = useState(0);
  const prevDeckHeightRef = useRef(0);
  const deckGrowing = deckHeight >= prevDeckHeightRef.current;
  useEffect(() => {
    prevDeckHeightRef.current = deckHeight;
  }, [deckHeight]);

  const dismiss = useCallback((id: number) => {
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
      options?: { durationMs?: number },
    ) => {
      const id = Date.now() + Math.random();
      const dedupeKey = textOf(content);
      setNotifications((prev) => {
        if (
          dedupeKey &&
          prev.filter((n) => n.dedupeKey === dedupeKey).length >=
            MAX_IDENTICAL_TOASTS
        ) {
          return prev;
        }
        return [
          ...prev,
          {
            id,
            content,
            undoAction,
            durationMs: options?.durationMs ?? AUTO_DISMISS_MS,
            dedupeKey,
          },
        ];
      });
    },
    [],
  );

  // Only the front toast's auto-dismiss timer runs; the ones queued behind it
  // keep their full read-time for when they step forward.
  useEffect(() => {
    const front = notifications[notifications.length - 1] ?? null;
    if (frontTimerRef.current && frontTimerRef.current.id !== front?.id) {
      clearTimeout(frontTimerRef.current.timeout);
      frontTimerRef.current = null;
    }
    if (!front || frontTimerRef.current?.id === front.id) return;
    frontTimerRef.current = {
      id: front.id,
      timeout: setTimeout(() => dismiss(front.id), front.durationMs),
    };
  }, [notifications, dismiss]);

  useEffect(() => {
    return () => {
      if (frontTimerRef.current) clearTimeout(frontTimerRef.current.timeout);
    };
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
    if (frontTimerRef.current?.id === item.id) {
      clearTimeout(frontTimerRef.current.timeout);
      frontTimerRef.current = null;
    }
    try {
      await item.undoAction();
    } catch (error) {
      console.error('Undo failed', error);
    } finally {
      setUndoingId(null);
      dismiss(item.id);
    }
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
          className="absolute inset-x-0 bottom-0"
          style={{
            paddingTop:
              Math.min(Math.max(notifications.length - 1, 0), 2) * 10,
          }}
        >
        <AnimatePresence initial={false}>
          {notifications.map((n, index) => {
            const depth = notifications.length - 1 - index;
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
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{
                  opacity: depth > 2 ? 0 : 1,
                  y: depth * -10,
                  scale: 1 - depth * 0.05,
                }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  transition: { duration: 0.15 },
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{ zIndex: 100 - depth }}
                className={`${
                  isFront
                    ? 'pointer-events-auto relative'
                    : 'pointer-events-none absolute inset-x-0 bottom-0'
                } flex w-full items-center gap-3 px-4 py-3 rounded-[18px] border shadow-sm backdrop-blur-2xl ${
                  isMoveToast
                    ? 'bg-card/90 text-foreground border-border/50'
                    : 'bg-popover/90 text-popover-foreground border-border'
                }`}
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
                <div
                  className={`flex-1 text-sm ${
                    isMoveToast ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {n.content}
                </div>
                {n.undoAction && (
                  <button
                    onClick={() => handleUndo(n)}
                    disabled={isUndoing}
                    className="text-sm font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                        Undo
                      </>
                    ) : (
                      'Undo'
                    )}
                  </button>
                )}
                <button
                  onClick={() => dismiss(n.id)}
                  disabled={isUndoing}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </motion.div>
            );
          })}
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
