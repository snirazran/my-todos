'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Tag, Search, X, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type DateRangeOption = '7d' | '30d' | 'custom';

type HistoryFilterBarProps = {
    selectedTags: string[];
    onTagsChange: (tags: string[]) => void;
    availableTags: { id: string; name: string; color: string }[];
};

export default function HistoryFilterBar({
    selectedTags,
    onTagsChange,
    availableTags,
}: HistoryFilterBarProps) {
    const [showTags, setShowTags] = useState(false);

    const handleTagToggle = (tagId: string) => {
        if (selectedTags.includes(tagId)) {
            onTagsChange(selectedTags.filter((t) => t !== tagId));
        } else {
            onTagsChange([...selectedTags, tagId]);
        }
    };

    return (
        <div className="flex flex-col gap-4 w-full mb-6">
            {/* Tag Button Bar */}
            <div className="flex items-center justify-end gap-3 p-1.5 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-sm">
                <div className="flex-1 px-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Filter Tasks
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTags(!showTags)}
                    className={cn(
                        "gap-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all",
                        showTags || selectedTags.length > 0 ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted/50"
                    )}
                >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Tags</span>
                    {selectedTags.length > 0 && (
                        <span className="flex items-center justify-center w-5 h-5 ml-1 text-[9px] text-primary-foreground bg-primary rounded-full">
                            {selectedTags.length}
                        </span>
                    )}
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", showTags && "rotate-180")} />
                </Button>
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
                        <div className="p-4 bg-muted/30 border border-border/50 rounded-2xl flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Filter by Tags</h4>
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
                                                "relative px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5",
                                                isSelected
                                                    ? "ring-2 ring-offset-2 ring-offset-background"
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
                                    <span className="text-xs text-muted-foreground italic">No tags created yet.</span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
