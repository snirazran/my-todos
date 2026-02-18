'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CalendarCheck, FolderOpen } from 'lucide-react';

interface NotificationContextType {
  showNotification: (
    content: React.ReactNode,
    undoAction?: () => void | Promise<void>,
  ) => void;
  hideNotification: () => void;
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

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notification, setNotification] = useState<{
    content: React.ReactNode;
    undoAction?: () => void | Promise<void>;
    id: number;
  } | null>(null);

  const [isUndoing, setIsUndoing] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hideNotification = useCallback(() => {
    setNotification(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showNotification = useCallback(
    (content: React.ReactNode, undoAction?: () => void | Promise<void>) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setNotification({
        content,
        undoAction,
        id: Date.now(),
      });

      // Auto dismiss after 4 seconds
      timeoutRef.current = setTimeout(() => {
        setNotification(null);
      }, 4000);
    },
    [],
  );

  const handleUndo = async () => {
    if (!notification?.undoAction) return;

    setIsUndoing(true);
    // Clear timeout so it doesn't dismiss while we are undoing
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      await notification.undoAction();
    } catch (error) {
      console.error('Undo failed', error);
    } finally {
      setIsUndoing(false);
      hideNotification();
    }
  };

  const isSavedTasksToast = notification?.content === 'Moved to Saved Tasks';
  const isMovedToTodayToast = notification?.content === 'Moved to Today';
  const isMoveToast = isSavedTasksToast || isMovedToTodayToast;

  return (
    <NotificationContext.Provider
      value={{ showNotification, hideNotification }}
    >
      {children}
      <AnimatePresence>
        {notification && (
          <div className="fixed bottom-0 left-0 right-0 z-[100] flex justify-center pointer-events-none px-4 pb-40 md:pb-36">
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[18px] max-w-sm w-auto border shadow-sm backdrop-blur-2xl ${
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
                {notification.content}
              </div>
              {notification.undoAction && (
                <button
                  onClick={handleUndo}
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
                onClick={hideNotification}
                disabled={isUndoing}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
}
