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
        <div className="flex flex-col gap-2 mb-6 sticky top-2 z-30">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-sm">
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
                                    "relative flex-1 sm:flex-none px-3 py-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 z-10 whitespace-nowrap",
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

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {/* Custom Inputs */}
                    {dateRange === 'custom' && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-2 flex-1 sm:flex-none"
                        >
                            <input
                                type="date"
                                value={customDateRange.from}
                                onChange={(e) => onCustomDateChange({ ...customDateRange, from: e.target.value })}
                                className="flex-1 w-full sm:w-auto px-2 py-1.5 bg-background border border-border rounded-lg text-[10px] font-medium focus:ring-1 focus:ring-primary outline-none"
                            />
                            <span className="text-muted-foreground font-bold">-</span>
                            <input
                                type="date"
                                value={customDateRange.to}
                                onChange={(e) => onCustomDateChange({ ...customDateRange, to: e.target.value })}
                                className="flex-1 w-full sm:w-auto px-2 py-1.5 bg-background border border-border rounded-lg text-[10px] font-medium focus:ring-1 focus:ring-primary outline-none"
                            />
                        </motion.div>
                    )}

                    {/* Filter Button */}
                    <div className="h-6 w-px bg-border/50 mx-1 hidden sm:block" />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTags(!showTags)}
                        className={cn(
                            "gap-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all h-9 px-3",
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

            {/* Expandable Tag Area */}
            <AnimatePresence>
                {showTags && (
                    <motion.div
                        initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginBottom: 16 }}
                        exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl flex flex-col gap-2 shadow-sm">
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
                                                    : "bg-card hover:bg-card/80 border-transparent opacity-70 hover:opacity-100"
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
