'use client';

import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { type FrogHandle } from '@/components/ui/frog';
import HistoryTaskCard from './HistoryTaskCard';
import useSWR from 'swr';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';

type DayDetailSheetProps = {
    open: boolean;
    onClose: () => void;
    date: string;
    tasks: any[];
    onToggleTask: (id: string, date: string, currentStatus: boolean) => void;
    frogProps: any; // Props for FrogDisplay
    visuallyCompleted?: Set<string>;
    setFlyRef?: (key: string, el: HTMLDivElement | null) => void;
};

export default function DayDetailSheet({
    open,
    onClose,
    date,
    tasks,
    onToggleTask,
    frogProps,
    visuallyCompleted,
    setFlyRef
}: DayDetailSheetProps) {
    const [mounted, setMounted] = useState(false);
    const frogRef = useRef<FrogHandle>(null);
    const frogBoxRef = useRef<HTMLDivElement>(null);

    // Need to get tag data for tasks
    const { data: tagsData } = useSWR('/api/tags', (url) => fetch(url).then((r) => r.json()));
    const userTags = tagsData?.tags || [];

    // Manage wardrobe locally if needed in popup, or passed down
    const { indices } = useWardrobeIndices(true);

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

    const completedCount = tasks.filter(t => t.completed).length;
    const totalCount = tasks.length;
    const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

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
                        className="fixed inset-0 z-[999] bg-background/60 backdrop-blur-md"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed inset-x-0 bottom-0 z-[1000] h-[90vh] md:h-[85vh] flex flex-col bg-card/95 backdrop-blur-3xl rounded-t-[40px] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] border-t border-white/20 dark:border-white/10 overflow-hidden"
                    >
                        {/* Handle for dragging (visual only for now) */}
                        <div className="w-full flex justify-center pt-4 pb-2" onClick={onClose}>
                            <div className="w-16 h-1.5 bg-muted-foreground/20 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="px-6 py-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-3xl font-black tracking-tighter flex items-center gap-2 text-foreground">
                                    <CalendarIcon className="w-7 h-7 text-primary" />
                                    {format(new Date(date), 'MMMM do')}
                                </h2>
                                <p className="text-muted-foreground font-bold text-sm mt-1">
                                    {completedCount} of {totalCount} completed
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-3 bg-muted/50 hover:bg-muted rounded-full transition-colors text-foreground"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-gradient-to-b from-transparent to-background/50">

                            {/* 1. Frog Display Section */}
                            <div className="flex justify-center pb-8 border-b border-border/50 border-dashed">
                                <div className="scale-90 md:scale-100">
                                    <FrogDisplay
                                        {...frogProps}
                                        frogRef={frogRef}
                                        frogBoxRef={frogBoxRef}
                                        indices={indices}
                                        rate={completionRate}
                                        done={completedCount}
                                        total={totalCount}
                                    />
                                </div>
                            </div>

                            {/* 2. Tasks List */}
                            <div className="max-w-2xl mx-auto w-full space-y-4 pb-24">
                                <h3 className="font-black text-muted-foreground/50 uppercase tracking-widest text-xs mb-4 text-center">
                                    Tasks & Activities
                                </h3>

                                {tasks.length === 0 ? (
                                    <div className="text-center py-16 text-muted-foreground bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
                                        <p className="font-medium">No tasks recorded for this day.</p>
                                    </div>
                                ) : (
                                    tasks.map(task => {
                                        const uniqueKey = `${date}::${task.id}`;
                                        return (
                                            <HistoryTaskCard
                                                key={uniqueKey}
                                                id={task.id}
                                                text={task.text}
                                                completed={task.completed}
                                                type={task.type}
                                                tags={task.tags}
                                                date={date}
                                                onToggle={onToggleTask}
                                                setFlyRef={(el) => setFlyRef?.(uniqueKey, el)}
                                                isEaten={visuallyCompleted?.has(uniqueKey)}
                                                userTags={userTags}
                                            />
                                        );
                                    })
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
