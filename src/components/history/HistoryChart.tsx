'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, BarChart } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type DailyGroup = {
    date: string;
    tasks: any[];
};

type HistoryChartProps = {
    historyData: DailyGroup[];
};

export default function HistoryChart({ historyData }: HistoryChartProps) {
    const [isOpen, setIsOpen] = useState(false);

    const chartData = useMemo(() => {
        const sorted = [...historyData].sort((a, b) => a.date.localeCompare(b.date));

        // Find maximum completed tasks to scale the bars (min 5 for meaningful height)
        const counts = sorted.map(d => d.tasks.filter(t => t.completed).length);
        const maxVal = Math.max(...counts, 5);

        return sorted.map(d => {
            const completed = d.tasks.filter(t => t.completed).length;
            const total = d.tasks.length;

            // Calculate height percentage relative to max volume
            const heightPercent = completed === 0 ? 5 : (completed / maxVal) * 100;

            // Calculate opacity based on intensity relative to max volume
            // 0 tasks -> 0.1 opacity (faint)
            // 1 task (vs max 5) -> 0.2 scale -> 0.44 opacity
            // Max tasks -> 1.0 opacity
            const opacity = completed === 0 ? 0.1 : 0.3 + (Math.min(completed / maxVal, 1) * 0.7);

            return {
                date: d.date,
                dayName: format(parseISO(d.date), 'EEE'),
                displayDate: format(parseISO(d.date), 'MMM d'),
                completed,
                total,
                height: heightPercent,
                opacity: opacity
            };
        });
    }, [historyData]);

    return (
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
                        <p className="text-[11px] font-medium text-muted-foreground">{historyData.length} Days Recorded</p>
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
                            <div className="mt-2 w-full overflow-x-auto no-scrollbar pb-2">
                                <div className="min-w-full w-max flex items-end gap-1.5 h-24 px-1" style={{ minWidth: chartData.length > 10 ? 'max-content' : '100%' }}>
                                    {chartData.map((d, i) => (
                                        <div key={d.date} className="flex flex-col items-center gap-1 group min-w-[20px] flex-1">
                                            <div className="relative w-full flex items-end justify-center h-full rounded-md bg-muted/20 overflow-hidden">
                                                <motion.div
                                                    initial={{ height: 0 }}
                                                    animate={{ height: `${d.height}%` }}
                                                    transition={{ delay: i * 0.02, duration: 0.5, type: 'spring' }}
                                                    className={cn(
                                                        "w-full rounded-t transition-all min-h-[4px]",
                                                        // Color is simpler: Always Green, but intensity (opacity) varies with volume
                                                        d.completed === 0 ? "bg-muted-foreground" : "bg-emerald-500"
                                                    )}
                                                    style={{ opacity: d.opacity }}
                                                />
                                                {d.completed > 0 && (
                                                    <div className="absolute inset-0 flex items-end justify-center pb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="text-[9px] font-bold text-foreground drop-shadow-sm bg-background/80 px-1 rounded-sm">{d.completed}</span>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Date Labels */}
                                            <div className="flex flex-col items-center">
                                                <span className="text-[8px] uppercase font-bold text-muted-foreground">{d.dayName}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {chartData.length === 0 && (
                                        <div className="w-full flex items-center justify-center text-muted-foreground text-xs h-full">
                                            No data
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
