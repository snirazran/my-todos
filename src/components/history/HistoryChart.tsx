'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, BarChart, ScrollText } from 'lucide-react';
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
    const [isOpen, setIsOpen] = useState(false); // Collapsed by default

    const chartData = useMemo(() => {
        const sorted = [...historyData].sort((a, b) => a.date.localeCompare(b.date));

        // Ensure maxVal is at least 1 to avoid division by zero
        const maxVal = Math.max(...sorted.map(d => d.tasks.filter(t => t.completed).length), 1);

        return sorted.map(d => {
            const completed = d.tasks.filter(t => t.completed).length;
            const total = d.tasks.length;
            const rate = total > 0 ? completed / total : 0;
            return {
                date: d.date,
                dayName: format(parseISO(d.date), 'EEE'),
                displayDate: format(parseISO(d.date), 'MMM d'),
                completed,
                total,
                rate,
                height: (completed / maxVal) * 100
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
                        <CardContent className="px-6 pb-6 pt-0">
                            {/* Scrollable Container */}
                            <div className="mt-4 w-full overflow-x-auto no-scrollbar pb-2">
                                {/* Minimum width container to ensure bars don't squash */}
                                <div className="min-w-full w-max flex items-end gap-2 h-40 px-2" style={{ minWidth: chartData.length > 10 ? 'max-content' : '100%' }}>
                                    {chartData.map((d, i) => (
                                        <div key={d.date} className="flex flex-col items-center gap-2 group min-w-[24px] flex-1">
                                            <div className="relative w-full flex items-end justify-center h-full rounded-lg bg-muted/20 overflow-hidden">
                                                <motion.div
                                                    initial={{ height: 0 }}
                                                    animate={{ height: `${d.height}%` }}
                                                    transition={{ delay: i * 0.02, duration: 0.5, type: 'spring' }}
                                                    className={cn(
                                                        "w-full rounded-t opacity-80 group-hover:opacity-100 transition-opacity min-h-[4px]",
                                                        d.rate >= 1 ? "bg-green-500" :
                                                            d.rate >= 0.5 ? "bg-primary" : "bg-primary/50"
                                                    )}
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 backdrop-blur-[1px]">
                                                    <span className="text-[10px] font-bold text-white drop-shadow-md">{d.completed}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-[9px] uppercase font-bold text-muted-foreground">{d.dayName}</span>
                                                <span className="text-[7px] font-bold text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity -mt-1">{d.displayDate}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {chartData.length === 0 && (
                                        <div className="w-full flex items-center justify-center text-muted-foreground text-sm h-full">
                                            No data available
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-center mt-2">
                                <div className="h-1 w-12 bg-muted rounded-full opacity-50" />
                            </div>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
