'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface NotificationContextType {
    showNotification: (message: string, undoAction?: () => void) => void;
    hideNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notification, setNotification] = useState<{
        message: string;
        undoAction?: () => void;
        id: number;
    } | null>(null);

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const hideNotification = useCallback(() => {
        setNotification(null);
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const showNotification = useCallback((message: string, undoAction?: () => void) => {
        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        setNotification({
            message,
            undoAction,
            id: Date.now(),
        });

        // Auto dismiss after 4 seconds
        timeoutRef.current = setTimeout(() => {
            setNotification(null);
        }, 4000);
    }, []);

    return (
        <NotificationContext.Provider value={{ showNotification, hideNotification }}>
            {children}
            <AnimatePresence>
                {notification && (
                    <div className="fixed bottom-0 left-0 right-0 z-[100] flex justify-center pointer-events-none px-4 pb-24 md:pb-20">
                        <motion.div
                            key={notification.id}
                            initial={{ opacity: 0, y: 50, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            className="pointer-events-auto flex items-center gap-3 px-4 py-3 bg-popover text-popover-foreground rounded-lg shadow-xl max-w-sm w-full border border-border"
                        >
                            <span className="flex-1 text-sm font-medium">{notification.message}</span>
                            {notification.undoAction && (
                                <button
                                    onClick={() => {
                                        notification.undoAction?.();
                                        hideNotification();
                                    }}
                                    className="text-sm font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider"
                                >
                                    Undo
                                </button>
                            )}
                            <button
                                onClick={hideNotification}
                                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
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
