import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Tag, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type DateRangeOption = '7d' | '30d' | 'custom';

export type TimeSelectorProps = {
    dateRange: DateRangeOption;
    onDateRangeChange: (val: DateRangeOption) => void;
    customDateRange: { from: string; to: string };
    onCustomDateChange: (range: { from: string; to: string }) => void;
    // Tag Props
    selectedTags: string[];
    onTagsChange: (tags: string[]) => void;
    availableTags: { id: string; name: string; color: string }[];
};

export default function HistoryTimeSelector({
    dateRange,
    onDateRangeChange,
    customDateRange,
    onCustomDateChange,
    selectedTags,
    onTagsChange,
    availableTags
}: TimeSelectorProps) {

    const dateOptions: { id: DateRangeOption; label: string; icon?: React.ElementType }[] = [
        { id: '7d', label: '7 Days' },
        { id: '30d', label: '30 Days' },
        { id: 'custom', label: 'Custom', icon: Calendar },
    ];

    const handleTagToggle = (tagId: string) => {
        if (selectedTags.includes(tagId)) {
            onTagsChange(selectedTags.filter((t) => t !== tagId));
        } else {
            onTagsChange([...selectedTags, tagId]);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            {/* 1. Date Range Segmented Control */}
            <div className="bg-muted/30 p-1.5 rounded-2xl flex relative">
                {dateOptions.map((opt) => {
                    const isActive = dateRange === opt.id;
                    const Icon = opt.icon;
                    return (
                        <button
                            key={opt.id}
                            onClick={() => onDateRangeChange(opt.id)}
                            className={cn(
                                "flex-1 relative py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 z-10",
                                isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeDateSegment"
                                    className="absolute inset-0 bg-primary/90 shadow-lg shadow-primary/20 rounded-xl -z-10"
                                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                                />
                            )}
                            {Icon && <Icon className="w-3.5 h-3.5" />}
                            {opt.label}
                        </button>
                    );
                })}
            </div>

            {/* Custom Range Inputs (Animate In) */}
            <AnimatePresence>
                {dateRange === 'custom' && (
                    <motion.div
                        initial={{ height: 0, opacity: 0, marginTop: -10 }}
                        animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
                        exit={{ height: 0, opacity: 0, marginTop: -10 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-2xl border border-border/50">
                            <div className="flex-1 flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase pl-1">From</label>
                                <input
                                    type="date"
                                    max={new Date().toISOString().split('T')[0]}
                                    value={customDateRange.from}
                                    onChange={(e) => onCustomDateChange({ ...customDateRange, from: e.target.value })}
                                    className="w-full px-3 py-2 bg-background border border-border/50 rounded-xl text-xs font-bold focus:ring-1 focus:ring-primary outline-none text-center"
                                />
                            </div>
                            <span className="text-muted-foreground/30 pt-4">▬</span>
                            <div className="flex-1 flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase pl-1">To</label>
                                <input
                                    type="date"
                                    min={customDateRange.from}
                                    max={new Date().toISOString().split('T')[0]}
                                    value={customDateRange.to}
                                    onChange={(e) => onCustomDateChange({ ...customDateRange, to: e.target.value })}
                                    className="w-full px-3 py-2 bg-background border border-border/50 rounded-xl text-xs font-bold focus:ring-1 focus:ring-primary outline-none text-center"
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 2. Horizontal Tag Filter List */}
            <div>
                <div className="flex items-center justify-between mb-2 px-1">
                    <label className="text-[11px] uppercase font-black text-muted-foreground/50 tracking-widest flex items-center gap-2">
                        <Tag className="w-3 h-3" /> Filter by Tag
                    </label>
                    {selectedTags.length > 0 && (
                        <button
                            onClick={() => onTagsChange([])}
                            className="text-[10px] font-bold text-red-500 hover:text-red-500/80 uppercase tracking-wider flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded-md"
                        >
                            <X className="w-3 h-3" /> Clear ({selectedTags.length})
                        </button>
                    )}
                </div>

                <div className="flex overflow-visible overflow-x-auto p-4 -mx-4 -my-2 no-scrollbar gap-2">
                    <motion.button
                        layout
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { if (selectedTags.length > 0) onTagsChange([]); }}
                        className={cn(
                            "flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all border shrink-0",
                            selectedTags.length === 0
                                ? "bg-foreground text-background border-transparent"
                                : "bg-muted/30 text-muted-foreground hover:bg-muted border-transparent"
                        )}
                    >
                        All
                    </motion.button>

                    {availableTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.id);
                        return (
                            <motion.button
                                key={tag.id}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleTagToggle(tag.id)}
                                className={cn(
                                    "flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5",
                                    isSelected
                                        ? "ring-1 ring-offset-1 ring-offset-background"
                                        : "hover:bg-muted/50 border-transparent opacity-80 hover:opacity-100"
                                )}
                                style={{
                                    backgroundColor: isSelected ? `${tag.color}20` : `${tag.color}08`,
                                    color: tag.color,
                                    borderColor: isSelected ? `${tag.color}40` : 'transparent',
                                    boxShadow: isSelected ? `0 0 0 1px ${tag.color}` : 'none',
                                }}
                            >
                                {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                                {tag.name}
                            </motion.button>
                        );
                    })}
                    {availableTags.length === 0 && (
                        <span className="text-xs text-muted-foreground italic pl-2 py-2">No tags available.</span>
                    )}
                </div>
            </div>
        </div>
    );
}
