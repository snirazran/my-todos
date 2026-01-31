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

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-background/60 backdrop-blur-md pointer-events-auto"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-lg bg-card/95 backdrop-blur-3xl rounded-[32px] shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden flex flex-col max-h-[85vh] z-10 pointer-events-auto"
                    >
                        <div className="p-6 border-b border-border/50 flex items-center justify-between bg-muted/20">
                            <h2 className="text-2xl font-black flex items-center gap-2 tracking-tight">
                                <BarChart3 className="w-6 h-6 text-primary" />
                                Productivity Insights
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 bg-background hover:bg-muted rounded-full transition-colors border border-border/50 shadow-sm"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gradient-to-b from-transparent to-background/50">
                            {/* Time Selector */}
                            <div className="bg-card/50 p-5 rounded-[24px] border border-border/50 shadow-sm">
                                <label className="text-[11px] uppercase font-black text-muted-foreground/70 mb-4 block tracking-wider">
                                    Date Range & Filters
                                </label>
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

                            {/* Metrics */}
                            <div>
                                <label className="text-[11px] uppercase font-black text-muted-foreground/70 mb-4 block tracking-wider">
                                    Key Metrics
                                </label>
                                <HistoryMetrics
                                    historyData={historyData}
                                    completedTasks={stats.completed}
                                    completionRate={stats.completionRate}
                                    totalTasks={stats.total}
                                    className="grid-cols-2 sm:grid-cols-2"
                                />
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
