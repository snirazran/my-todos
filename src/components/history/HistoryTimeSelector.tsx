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

    const [showTags, setShowTags] = useState(false);

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
        <div className="flex flex-col gap-2 mb-6 sticky top-16 md:top-2 z-30 transition-all">
            <div className="flex flex-row items-center justify-between gap-2 p-1.5 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-sm overflow-x-auto no-scrollbar">
                {/* Toggles */}
                <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-xl overflow-hidden flex-shrink-0">
                    {dateOptions.map((opt) => {
                        const isActive = dateRange === opt.id;
                        const Icon = opt.icon;
                        return (
                            <button
                                key={opt.id}
                                onClick={() => onDateRangeChange(opt.id)}
                                className={cn(
                                    "relative px-3 py-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 z-10 whitespace-nowrap",
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

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Filter Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTags(!showTags)}
                        className={cn(
                            "gap-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all h-9 px-3 whitespace-nowrap",
                            showTags || selectedTags.length > 0 ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted/50"
                        )}
                    >
                        <Tag className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Filters</span>
                        {selectedTags.length > 0 && (
                            <span className="flex items-center justify-center w-5 h-5 ml-1 text-[9px] text-primary-foreground bg-primary rounded-full">
                                {selectedTags.length}
                            </span>
                        )}
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", showTags && "rotate-180")} />
                    </Button>
                </div>
            </div>

            {/* Custom Inputs Row */}
            <AnimatePresence>
                {dateRange === 'custom' && (
                    <motion.div
                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center justify-center gap-2 p-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl shadow-sm w-fit mx-auto">
                            <input
                                type="date"
                                max={new Date().toISOString().split('T')[0]}
                                value={customDateRange.from}
                                onChange={(e) => onCustomDateChange({ ...customDateRange, from: e.target.value })}
                                className="w-24 px-2 py-1.5 bg-background border border-border rounded-lg text-[10px] font-medium focus:ring-1 focus:ring-primary outline-none"
                            />
                            <span className="text-muted-foreground font-bold">-</span>
                            <input
                                type="date"
                                min={customDateRange.from}
                                max={new Date().toISOString().split('T')[0]}
                                value={customDateRange.to}
                                onChange={(e) => onCustomDateChange({ ...customDateRange, to: e.target.value })}
                                className="w-24 px-2 py-1.5 bg-background border border-border rounded-lg text-[10px] font-medium focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Expandable Tag Area - Absolute Positioned Dropdown */}
            <AnimatePresence>
                {showTags && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full right-0 mt-2 z-50 w-full md:w-auto md:min-w-[300px]"
                    >
                        <div className="p-3 bg-popover text-popover-foreground border border-border shadow-md rounded-xl flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Filter by Tags</h4>
                                {selectedTags.length > 0 && (
                                    <button
                                        onClick={() => onTagsChange([])}
                                        className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase tracking-wider flex items-center gap-1"
                                    >
                                        <X className="w-3 h-3" /> Clear All
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {availableTags.map((tag) => {
                                    const isSelected = selectedTags.includes(tag.id);
                                    return (
                                        <motion.button
                                            key={tag.id}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleTagToggle(tag.id)}
                                            className={cn(
                                                "relative px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5",
                                                isSelected
                                                    ? "ring-1 ring-offset-1 ring-offset-background"
                                                    : "bg-muted/50 hover:bg-muted border-transparent"
                                            )}
                                            style={{
                                                backgroundColor: isSelected ? `${tag.color}20` : undefined,
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
                                    <span className="text-[10px] text-muted-foreground italic">No tags created yet.</span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
