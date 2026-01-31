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
    const [wardrobeOpen, setWardrobeOpen] = useState(false);
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
                        className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md"
                    />

                    {/* Sheet Container */}
                    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center pointer-events-none p-0 sm:p-6">
                        <motion.div
                            initial={{ y: '100%', opacity: 0, scale: 0.96 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: '100%', opacity: 0, scale: 0.96 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            className="pointer-events-auto w-full sm:max-w-lg h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col bg-card/90 backdrop-blur-3xl rounded-t-[32px] sm:rounded-[40px] shadow-2xl border-t sm:border border-white/10 overflow-hidden"
                        >
                            {/* Header (Compact) */}
                            <div className="flex-shrink-0 px-5 py-4 flex items-center justify-between border-b border-border/40 bg-background/20">
                                <div>
                                    <h2 className="text-2xl font-black tracking-tighter flex items-center gap-2 text-foreground">
                                        <CalendarIcon className="w-6 h-6 text-primary" />
                                        {format(new Date(date), 'MMMM do')}
                                    </h2>
                                    <p className="text-muted-foreground font-bold text-xs uppercase tracking-wider mt-1 opacity-80">
                                        {completedCount} / {totalCount} Tasks Completed
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 bg-muted/50 hover:bg-red-500/10 hover:text-red-500 rounded-full transition-all text-muted-foreground"
                                >
                                    <X className="w-5 h-5" strokeWidth={3} />
                                </button>
                            </div>

                            {/* Content Scrollable */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                                {/* 1. Frog Display Section */}
                                <div className="flex justify-center pb-4 border-b border-border/40 border-dashed">
                                    <div className="scale-90 transform-origin-center">
                                        <FrogDisplay
                                            {...frogProps}
                                            frogRef={frogRef}
                                            frogBoxRef={frogBoxRef}
                                            indices={indices}
                                            rate={completionRate}
                                            done={completedCount}
                                            total={totalCount}
                                            openWardrobe={wardrobeOpen}
                                            onOpenChange={setWardrobeOpen}
                                        />
                                    </div>
                                </div>

                                {/* 2. Tasks List */}
                                <div className="space-y-3 pb-12">
                                    <h3 className="font-black text-muted-foreground/40 uppercase tracking-widest text-[10px] text-center mb-2">
                                        Activity Log
                                    </h3>

                                    {tasks.length === 0 ? (
                                        <div className="text-center py-10 px-4 text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border/50">
                                            <p className="font-bold text-sm">No tasks recorded details for this day.</p>
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
                    </div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
