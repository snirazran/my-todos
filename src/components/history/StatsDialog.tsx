'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart3 } from 'lucide-react';
import HistoryMetrics from './HistoryMetrics';
import HistoryTimeSelector, { DateRangeOption } from './HistoryTimeSelector';

type StatsDialogProps = {
    open: boolean;
    onClose: () => void;
    // Stats Data
    historyData: any[];
    stats: {
        total: number;
        completed: number;
        completionRate: number;
    };
    // Filters
    dateRange: DateRangeOption;
    onDateRangeChange: (val: DateRangeOption) => void;
    customDateRange: { from: string; to: string };
    onCustomDateChange: (range: { from: string; to: string }) => void;
    selectedTags: string[];
    onTagsChange: (tags: string[]) => void;
    availableTags: any[];
};

export default function StatsDialog({
    open,
    onClose,
    historyData,
    stats,
    dateRange,
    onDateRangeChange,
    customDateRange,
    onCustomDateChange,
    selectedTags,
    onTagsChange,
    availableTags
}: StatsDialogProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

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
                        onClick={onClose}
                        className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md"
                    />

                    {/* Modal/Sheet Content */}
                    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center pointer-events-none p-0 sm:p-6">
                        <motion.div
                            initial={{ y: '100%', opacity: 0, scale: 0.95 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: '100%', opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            className="pointer-events-auto relative w-full sm:max-w-lg bg-card/90 backdrop-blur-3xl 
                                     rounded-t-[32px] sm:rounded-[32px] shadow-2xl border-t sm:border border-white/10 
                                     overflow-hidden flex flex-col h-[85vh] sm:h-auto sm:max-h-[85vh]"
                        >
                            {/* Drag Handle (Mobile Visual) */}
                            <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
                                <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full" />
                            </div>

                            {/* Header */}
                            <div className="px-6 py-4 flex items-center justify-between border-b border-border/40">
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-2 text-foreground">
                                        <BarChart3 className="w-6 h-6 text-primary" />
                                        Insights
                                    </h2>
                                    <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                                        Productivity Overview
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2.5 bg-muted/50 hover:bg-muted rounded-full transition-colors text-foreground"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto bg-gradient-to-b from-transparent to-background/30 p-5 sm:p-6 space-y-6">
                                {/* Time Selector Section */}
                                <div className="space-y-3">
                                    <HistoryTimeSelector
                                        dateRange={dateRange}
                                        onDateRangeChange={onDateRangeChange}
                                        customDateRange={customDateRange}
                                        onCustomDateChange={onCustomDateChange}
                                        selectedTags={selectedTags}
                                        onTagsChange={onTagsChange}
                                        availableTags={availableTags}
                                    />
                                </div>

                                {/* Metrics Section */}
                                <div className="space-y-4">
                                    <HistoryMetrics
                                        historyData={historyData}
                                        completedTasks={stats.completed}
                                        completionRate={stats.completionRate}
                                        totalTasks={stats.total}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
