'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRangeOption } from './HistoryFilterBar'; // Reuse type or redefine

export type TimeSelectorProps = {
    dateRange: DateRangeOption;
    onDateRangeChange: (val: DateRangeOption) => void;
    customDateRange: { from: string; to: string };
    onCustomDateChange: (range: { from: string; to: string }) => void;
};

export default function HistoryTimeSelector({
    dateRange,
    onDateRangeChange,
    customDateRange,
    onCustomDateChange
}: TimeSelectorProps) {

    const dateOptions: { id: DateRangeOption; label: string; icon?: React.ElementType }[] = [
        { id: '7d', label: 'Last 7 Days' },
        { id: '30d', label: 'Last 30 Days' },
        { id: 'custom', label: 'Custom', icon: Calendar },
    ];

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-sm mb-6 sticky top-2 z-30">
            {/* Toggles */}
            <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-xl overflow-hidden w-full sm:w-auto">
                {dateOptions.map((opt) => {
                    const isActive = dateRange === opt.id;
                    const Icon = opt.icon;
                    return (
                        <button
                            key={opt.id}
                            onClick={() => onDateRangeChange(opt.id)}
                            className={cn(
                                "relative flex-1 sm:flex-none px-4 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 z-10 whitespace-nowrap",
                                isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeTimeSelector"
                                    className="absolute inset-0 bg-primary rounded-lg -z-10 shadow-sm"
                                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                                />
                            )}
                            {Icon && <Icon className="w-3.5 h-3.5" />}
                            {opt.label}
                        </button>
                    );
                })}
            </div>

            {/* Custom Inputs */}
            {dateRange === 'custom' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2 w-full sm:w-auto"
                >
                    <input
                        type="date"
                        value={customDateRange.from}
                        onChange={(e) => onCustomDateChange({ ...customDateRange, from: e.target.value })}
                        className="flex-1 sm:flex-none w-full sm:w-auto px-3 py-2 bg-background border border-border rounded-lg text-xs font-medium focus:ring-1 focus:ring-primary outline-none"
                    />
                    <span className="text-muted-foreground font-bold">-</span>
                    <input
                        type="date"
                        value={customDateRange.to}
                        onChange={(e) => onCustomDateChange({ ...customDateRange, to: e.target.value })}
                        className="flex-1 sm:flex-none w-full sm:w-auto px-3 py-2 bg-background border border-border rounded-lg text-xs font-medium focus:ring-1 focus:ring-primary outline-none"
                    />
                </motion.div>
            )}
        </div>
    );
}
