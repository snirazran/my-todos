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
import {
    useFrogTongue,
    HIT_AT,
    OFFSET_MS,
    TONGUE_MS,
    TONGUE_STROKE,
} from '@/hooks/useFrogTongue';

type DayDetailSheetProps = {
    open: boolean;
    onClose: () => void;
    date: string;
    tasks: any[];
    onToggleTask: (id: string, date: string, currentStatus: boolean) => void;
    frogProps: any; // Props for FrogDisplay
};

export default function DayDetailSheet({
    open,
    onClose,
    date,
    tasks,
    onToggleTask,
    frogProps,
}: DayDetailSheetProps) {
    const [mounted, setMounted] = useState(false);
    const [wardrobeOpen, setWardrobeOpen] = useState(false);
    const frogRef = useRef<FrogHandle>(null);
    const frogBoxRef = useRef<HTMLDivElement>(null);

    // Animation State
    const flyRefs = useRef<Record<string, HTMLElement | null>>({});
    const {
        vp,
        cinematic,
        grab,
        tip,
        tipVisible,
        tonguePathEl,
        triggerTongue,
        visuallyDone,
    } = useFrogTongue({ frogRef, frogBoxRef, flyRefs });

    // Need to get tag data for tasks
    const { data: tagsData } = useSWR('/api/tags', (url) => fetch(url).then((r) => r.json()));
    const userTags = tagsData?.tags || [];

    // Manage wardrobe locally if needed in popup, or passed down
    const { indices } = useWardrobeIndices(true);

    // Responsive Check
    const [isDesktop, setIsDesktop] = useState(false);
    useEffect(() => {
        const checkDesktop = () => setIsDesktop(window.matchMedia("(min-width: 640px)").matches);
        checkDesktop();
        window.addEventListener('resize', checkDesktop);
        return () => window.removeEventListener('resize', checkDesktop);
    }, []);

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

    const handleToggleProxy = async (id: string, date: string, currentStatus: boolean) => {
        // If we are marking as COMPLETE (currentStatus is false), trigger animation
        if (!currentStatus) {
            await triggerTongue({
                key: `${date}::${id}`,
                completed: true,
                onPersist: () => onToggleTask(id, date, currentStatus)
            });
        } else {
            // Uncheck immediately
            onToggleTask(id, date, currentStatus);
        }
    };

    if (!mounted) return null;

    // Animation Variants
    const mobileVariants = {
        initial: { y: '100%', opacity: 0, scale: 0.96 },
        animate: { y: 0, opacity: 1, scale: 1 },
        exit: { y: '100%', opacity: 0, scale: 0.96 }
    };

    const desktopVariants = {
        initial: { opacity: 0, scale: 0.95, y: 0 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 0 }
    };

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
                            variants={isDesktop ? desktopVariants : mobileVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            drag={!isDesktop ? "y" : false}
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={{ top: 0, bottom: 0.5 }}
                            onDragEnd={(e, { offset, velocity }) => {
                                if (offset.y > 100 || velocity.y > 500) {
                                    onClose();
                                }
                            }}
                            // Updated background to match requested "white like"
                            className="pointer-events-auto w-full sm:max-w-lg h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col bg-background/95 backdrop-blur-2xl rounded-t-[32px] sm:rounded-[40px] shadow-2xl border-t sm:border border-border/40 overflow-hidden relative"
                        >
                            {/* Drag Handle (Mobile Only) */}
                            {!isDesktop && (
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted-foreground/20 rounded-full z-50" />
                            )}

                            {/* Header (Compact) */}
                            <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between border-b border-border/40 bg-background/20">
                                <div>
                                    <h2 className="text-xl font-black tracking-tighter flex items-center gap-2 text-foreground">
                                        <CalendarIcon className="w-5 h-5 text-primary" />
                                        {format(new Date(date), 'MMMM do')}
                                    </h2>
                                    <p className="text-muted-foreground font-bold text-[10px] uppercase tracking-wider mt-0.5 opacity-80">
                                        {completedCount} / {totalCount} Tasks Completed
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 bg-muted/50 hover:bg-red-500/10 hover:text-red-500 rounded-full transition-all text-muted-foreground"
                                >
                                    <X className="w-4 h-4" strokeWidth={3} />
                                </button>
                            </div>

                            {/* Content Scrollable */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
                                {/* 1. Frog Display Section */}
                                <div className="flex justify-center pb-0 border-b border-border/40 border-dashed">
                                    <div className="scale-100 transform-origin-center -my-1">
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
                                            mouthOpen={!!grab} // Open mouth when grabbing
                                            mouthOffset={{ y: -4 }}
                                        />
                                    </div>
                                </div>

                                {/* 2. Tasks List */}
                                <div className="space-y-1 pb-8">
                                    <h3 className="font-black text-muted-foreground/40 uppercase tracking-widest text-[9px] text-center mb-0">
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
                                                    onToggle={handleToggleProxy}
                                                    setFlyRef={(el) => {
                                                        if (el) flyRefs.current[uniqueKey] = el;
                                                        else delete flyRefs.current[uniqueKey];
                                                    }}
                                                    isEaten={visuallyDone?.has(uniqueKey)}
                                                    userTags={userTags}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* SVG Tongue Overlay (Z-index high to overlap sheet) */}
                    {grab && (
                        <svg
                            key={grab.startAt}
                            className="fixed inset-0 z-[1100] pointer-events-none"
                            width={vp.w}
                            height={vp.h}
                            viewBox={`0 0 ${vp.w} ${vp.h}`}
                            preserveAspectRatio="none"
                            style={{ width: vp.w, height: vp.h }}
                        >
                            <defs>
                                <linearGradient id="tongue-grad-history" x1="0" y1="0" x2="0" y2="1">
                                    <stop stopColor="#ff6b6b" />
                                    <stop offset="1" stopColor="#f43f5e" />
                                </linearGradient>
                            </defs>
                            <motion.path
                                key={`tongue-${grab.startAt}`}
                                ref={tonguePathEl}
                                d="M0 0 L0 0"
                                fill="none"
                                stroke="url(#tongue-grad-history)"
                                strokeWidth={TONGUE_STROKE}
                                strokeLinecap="round"
                                vectorEffect="non-scaling-stroke"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: [0, 1, 0] }}
                                transition={{
                                    delay: OFFSET_MS / 1000,
                                    duration: TONGUE_MS / 1000,
                                    times: [0, HIT_AT, 1],
                                    ease: 'linear',
                                }}
                            />
                            {tipVisible && tip && (
                                <g transform={`translate(${tip.x}, ${tip.y})`}>
                                    <circle r={10} fill="transparent" />
                                    <image
                                        href="/fly.svg"
                                        x={-24 / 2}
                                        y={-24 / 2}
                                        width={24}
                                        height={24}
                                    />
                                </g>
                            )}
                        </svg>
                    )}
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
