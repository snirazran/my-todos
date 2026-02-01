'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, RotateCcw } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';

export type HistoryTaskCardProps = {
    id: string;
    text: string;
    completed: boolean;
    type?: 'regular' | 'weekly' | 'backlog';
    tags?: string[];
    date: string;
    userTags?: { id: string; name: string; color: string }[];
    onToggle?: (id: string, date: string, currentStatus: boolean) => void;
    setFlyRef?: (el: HTMLDivElement | null) => void;
    isEaten?: boolean;
};

export default function HistoryTaskCard({
    id,
    text,
    completed,
    type,
    tags,
    date,
    userTags,
    onToggle,
    setFlyRef,
    isEaten = false,
}: HistoryTaskCardProps) {
    const isWeekly = type === 'weekly';
    const displayedCompleted = completed || isEaten;

    const getTagDetails = (tagIdentifier: string) => {
        const byId = userTags?.find((t) => t.id === tagIdentifier);
        if (byId) return byId;
        return userTags?.find((t) => t.name === tagIdentifier);
    };

    const handleToggle = () => {
        if (onToggle) {
            onToggle(id, date, completed);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            whileHover={{ scale: 1.005 }}
            transition={{ duration: 0.2 }}
            className={cn(
                "group relative flex items-center gap-1.5 px-2 py-3.5 transition-all duration-200 rounded-xl border shadow-sm select-none cursor-pointer",
                "bg-card border-border/40 md:hover:border-border md:hover:shadow-md",
                // Remove custom bg for completed to match standard list behavior or keep subtle if desired
                // Standard list doesn't grey out background, just text opacity
            )}
            onClick={handleToggle}
        >
            <div className={cn(
                "flex items-center flex-1 min-w-0 gap-3 pl-2 transition-opacity duration-200",
                displayedCompleted ? "opacity-60" : "opacity-100"
            )}>
                {/* Check/Fly Icon */}
                <div className="relative flex-shrink-0 w-7 h-7">
                    <AnimatePresence initial={false}>
                        {!displayedCompleted ? (
                            <motion.div
                                key="fly"
                                className="absolute inset-0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.18 }}
                            >
                                {/* Fly or Empty Circle */}
                                <div
                                    ref={setFlyRef}
                                    className="w-full h-full flex items-center justify-center"
                                >
                                    <Fly
                                        size={24}
                                        paused={displayedCompleted}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggle();
                                        }}
                                    />
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="check"
                                className="absolute inset-0"
                                initial={{ opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.6 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            >
                                <CheckCircle2 className="text-green-500 w-7 h-7 drop-shadow-sm" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Text & Meta */}
                <div className="flex-1 min-w-0">
                    <motion.span
                        className={cn(
                            "block text-base font-medium md:text-lg transition-colors duration-200",
                            displayedCompleted ? "text-muted-foreground line-through" : "text-foreground"
                        )}
                    >
                        {text}
                    </motion.span>

                    {(isWeekly || (tags && tags.length > 0)) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {isWeekly && (
                                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-900/40 dark:text-purple-200 border border-purple-100 dark:border-purple-800/50 uppercase tracking-wider">
                                    <RotateCcw className="w-3 h-3" />
                                    Weekly
                                </span>
                            )}
                            {tags?.map((tagId) => {
                                const tagDetails = getTagDetails(tagId);
                                if (!tagDetails) return null;

                                const color = tagDetails.color;
                                const name = tagDetails.name;

                                return (
                                    <span
                                        key={tagId}
                                        className={cn(
                                            "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider transition-colors border shadow-sm",
                                            !color && "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800/50"
                                        )}
                                        style={color ? {
                                            backgroundColor: `${color}20`,
                                            color: color,
                                            borderColor: `${color}40`,
                                        } : undefined}
                                    >
                                        {name}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
