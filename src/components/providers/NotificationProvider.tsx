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

interface NotificationItem {
  id: number;
  content: React.ReactNode;
  undoAction?: () => void | Promise<void>;
}

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
  useEffect(() => setMounted(true), []);

  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const stackRef = useRef<HTMLDivElement | null>(null);

  const dismiss = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const t = timeoutsRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
  }, []);

  // Backwards compatible — dismisses the oldest visible notification.
  const hideNotification = useCallback(() => {
    setNotifications((prev) => {
      if (prev.length === 0) return prev;
      const [head, ...rest] = prev;
      const t = timeoutsRef.current.get(head.id);
      if (t) {
        clearTimeout(t);
        timeoutsRef.current.delete(head.id);
      }
      return rest;
    });
  }, []);

  const showNotification = useCallback(
    (
      content: React.ReactNode,
      undoAction?: () => void | Promise<void>,
      options?: { durationMs?: number },
    ) => {
      const id = Date.now() + Math.random();
      setNotifications((prev) => [...prev, { id, content, undoAction }]);
      const timeout = setTimeout(
        () => dismiss(id),
        options?.durationMs ?? AUTO_DISMISS_MS,
      );
      timeoutsRef.current.set(id, timeout);
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timeoutsRef.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // Track the rendered stack height so the FAB / Frogodoro pill can offset cleanly.
  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const update = () => setStackHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [notifications.length, mounted]);

  const handleUndo = async (item: NotificationItem) => {
    if (!item.undoAction) return;
    setUndoingId(item.id);
    const t = timeoutsRef.current.get(item.id);
    if (t) {
      clearTimeout(t);
      timeoutsRef.current.delete(item.id);
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
        isVisible: notifications.length > 0,
        count: notifications.length,
        stackHeight,
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
            className="fixed left-0 right-0 z-[1300] pointer-events-none flex flex-col gap-2 px-3 md:px-4 bottom-[calc(env(safe-area-inset-bottom)+72px)] md:bottom-[calc(env(safe-area-inset-bottom)+16px)]"
          >
        {/* Top slot: timer pill portals in here (above all toasts) */}
        <div id="frog-bottom-stack-top" className="contents" />
        <AnimatePresence initial={false}>
          {notifications.map((n) => {
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
                layout
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={`pointer-events-auto w-full md:w-[380px] md:self-end flex items-center gap-3 px-4 py-3 rounded-[18px] border shadow-sm backdrop-blur-2xl ${
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
        {/* Bottom slot: cinematic skip hint portals in here (below all toasts) */}
        <div id="frog-bottom-stack-bottom" className="contents" />
          </div>,
          document.body,
        )}
    </NotificationContext.Provider>
  );
}
