'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Plus, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

// Widget icons/labels mapping (reusing from parent if possible, but defining here for now)
const WIDGET_LABELS: Record<string, string> = {
    'completion-rate': 'Completion Rate',
    'total-done': 'Total Tasks Done',
    'best-day': 'Best Day',
    'average': 'Daily Average',
    'active-days': 'Active Days',
    'streak': 'Current Streak',
    'tag-distribution': 'Top Tags View',
    'productivity-trend': 'Activity Trend',
};

// Simple descriptions for better UX
const WIDGET_DESCRIPTIONS: Record<string, string> = {
    'completion-rate': 'Track how often you complete planned tasks.',
    'total-done': 'Total count of finished tasks.',
    'best-day': 'Which day of the week you are most productive.',
    'average': 'Average tasks completed per day.',
    'active-days': 'Number of days you were active.',
    'streak': 'Current daily streak.',
    'tag-distribution': 'Breakdown of tasks by tag.',
    'productivity-trend': 'Your productivity over the last 7 days.',
};

interface AddWidgetDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    availableWidgets: string[];
    onAdd: (id: string) => void;
}

export function AddWidgetDrawer({ open, onOpenChange, availableWidgets, onAdd }: AddWidgetDrawerProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => onOpenChange(false)}
                        className="fixed inset-0 z-[1001] bg-background/80 backdrop-blur-sm"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ y: '100%', opacity: 0.5 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 z-[1002] mx-auto w-full max-w-xl p-4 sm:p-6"
                    >
                        <div className="flex flex-col gap-4 rounded-3xl bg-popover border border-border/50 shadow-2xl p-6 ring-1 ring-border/10">
                            <div className="flex items-center justify-between pl-1">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <span className="p-2 bg-primary/10 rounded-xl text-primary">
                                        <Plus className="w-5 h-5" strokeWidth={3} />
                                    </span>
                                    Add Widget
                                </h2>
                                <button 
                                    onClick={() => onOpenChange(false)}
                                    className="p-2 bg-muted rounded-full hover:bg-muted/80 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1 -mr-2">
                                {availableWidgets.length === 0 ? (
                                    <div className="col-span-full py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                                        <div className="p-4 rounded-full bg-muted/50">
                                            <LayoutGrid className="w-8 h-8 opacity-20" />
                                        </div>
                                        <p>You've added all available widgets!</p>
                                    </div>
                                ) : (
                                    availableWidgets.map((id) => (
                                        <button
                                            key={id}
                                            onClick={() => onAdd(id)}
                                            className="flex flex-col items-start gap-1 p-4 rounded-2xl border border-border/50 bg-card hover:bg-muted/50 hover:border-primary/50 transition-all text-left shadow-sm hover:shadow-md group active:scale-[0.98]"
                                        >
                                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                                {WIDGET_LABELS[id] || id}
                                            </span>
                                            <span className="text-xs text-muted-foreground line-clamp-2">
                                                {WIDGET_DESCRIPTIONS[id] || 'Add this widget to your dashboard.'}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
