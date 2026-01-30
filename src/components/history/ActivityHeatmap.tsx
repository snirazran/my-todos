'use client';

import React, { useMemo, useState } from 'react';
import {
    format,
    eachDayOfInterval,
    isSameDay,
    getDay,
    startOfWeek,
    endOfWeek,
    subDays,
    differenceInDays,
    addDays,
    isAfter
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip';
import { ChevronDown, ChevronUp, BarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DailyGroup = {
    date: string;
    tasks: any[];
};

type ActivityHeatmapProps = {
    historyData: DailyGroup[];
    rangeDays?: number; // Optional: Force a specific day count (e.g. 365 for a full year view)
};

export default function ActivityHeatmap({ historyData, rangeDays }: ActivityHeatmapProps) {

    const [isOpen, setIsOpen] = useState(true);
    const today = new Date();

    // Scroll to end on mount
    // Scroll to end on mount - REMOVED (No longer scrollable)

    // Determine the date range. 
    // If rangeDays is provided, we go back that many days from today.
    // Otherwise, we infer from historyData or default to 365 (GitHub style).

    // Default to showing at least the last few months if data is sparse, 
    // or the last year if we want the full GitHub feel. 
    // Let's adapt based on the data:
    // If data is short (< 30 days), maybe show 3 months?
    // Actually, standard GitHub is 1 year.
    // But if the user filtered for "7 days" in the parent, we should probably respect that if we can.
    // However, the component might be independent.
    // Let's use the range of data present, but Pad it to fill full weeks.

    const { startDate, endDate, allDays } = useMemo(() => {
        // Default to showing 6 months (approx 26 weeks) to mimic GitHub's "dense" look
        // regardless of how much data we actually have.
        // If rangeDays is provided, use that.
        const daysToShow = rangeDays || 180;

        const end = today;
        const start = subDays(end, Math.max(0, daysToShow - 1));

        // Generate exact days requested
        const days = eachDayOfInterval({ start, end });

        return { startDate: start, endDate: end, allDays: days };
    }, [rangeDays]);

    // Map data for O(1) lookup
    const dataMap = useMemo(() => {
        const map = new Map<string, number>();
        historyData.forEach(d => {
            const count = d.tasks.filter(t => t.completed).length;
            map.set(d.date, count);
        });
        return map;
    }, [historyData]);

    // Determine max tasks for scaling intensity
    const maxTasks = useMemo(() => {
        let max = 0;
        dataMap.forEach(v => { if (v > max) max = v; });
        return Math.max(max, 5); // Minimum denominator to avoid super dark colors for 1 task
    }, [dataMap]);

    // Helper to get color intensity
    const getLevel = (count: number) => {
        if (count === 0) return 0;
        const ratio = count / maxTasks;
        if (ratio <= 0.25) return 1;
        if (ratio <= 0.50) return 2;
        if (ratio <= 0.75) return 3;
        return 4;
    };

    // 4 Levels of green + 0 (empty)
    const getBlockColor = (level: number) => {
        switch (level) {
            case 0: return "bg-muted/40"; // Empty
            case 1: return "bg-emerald-200 dark:bg-emerald-900/50";
            case 2: return "bg-emerald-400 dark:bg-emerald-700";
            case 3: return "bg-emerald-500 dark:bg-emerald-600";
            case 4: return "bg-emerald-600 dark:bg-emerald-500";
            default: return "bg-muted/20";
        }
    };

    return (
        <TooltipProvider>
            <Card className="border-border/50 bg-card/80 backdrop-blur-xl shadow-sm rounded-3xl overflow-hidden mb-6 transition-all hover:bg-card">
                <div
                    className="p-4 flex items-center justify-between cursor-pointer select-none"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 text-primary p-2 rounded-xl">
                            <BarChart className="w-5 h-5" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Activity Overview</h3>
                            <p className="text-[11px] font-medium text-muted-foreground">{dataMap.size} Active Days</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-xl h-8 w-8 p-0">
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                </div>

                <AnimatePresence initial={false}>
                    {isOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="overflow-hidden"
                        >
                            <CardContent className="px-4 pb-4 pt-0">
                                {/* Scrollable Container */}
                                <div className="w-full pb-2 max-h-[8rem] overflow-y-auto custom-scrollbar">
                                    <div className="flex flex-wrap gap-0.5 w-full justify-start items-start">
                                        {allDays.map((day, index) => {
                                            const dateStr = format(day, 'yyyy-MM-dd');
                                            const count = dataMap.get(dateStr) || 0;
                                            const level = getLevel(count);

                                            return (
                                                <Tooltip key={dateStr} delayDuration={50}>
                                                    <TooltipTrigger asChild>
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.5 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            transition={{ delay: index * 0.005 }}
                                                            className={cn(
                                                                "w-4 h-4 rounded-sm cursor-help transition-colors flex-shrink-0",
                                                                getBlockColor(level)
                                                            )}
                                                        />
                                                    </TooltipTrigger>
                                                    <TooltipContent
                                                        className="text-xs font-medium z-[100]"
                                                        side="top"
                                                        sideOffset={5}
                                                    >
                                                        <div className="flex flex-col gap-0.5 text-center">
                                                            <span className="font-bold text-base">{count}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase">{count === 1 ? 'task' : 'tasks'}</span>
                                                            <span className="text-[10px] opacity-70">{format(day, 'MMM d, yyyy')}</span>
                                                        </div>
                                                    </TooltipContent>
                                                </Tooltip>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Legend */}
                                <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
                                    <span>Less</span>
                                    <div className={`w-3 h-3 rounded-sm ${getBlockColor(0)}`}></div>
                                    <div className={`w-3 h-3 rounded-sm ${getBlockColor(1)}`}></div>
                                    <div className={`w-3 h-3 rounded-sm ${getBlockColor(2)}`}></div>
                                    <div className={`w-3 h-3 rounded-sm ${getBlockColor(3)}`}></div>
                                    <div className={`w-3 h-3 rounded-sm ${getBlockColor(4)}`}></div>
                                    <span>More</span>
                                </div>
                            </CardContent>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Card>
        </TooltipProvider>
    );
}
