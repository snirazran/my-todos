'use client';

import React, { useMemo } from 'react';
import { WidgetBase, WidgetProps } from './WidgetBase';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

export function ProductivityTrendWidget(props: WidgetProps) {
    
    // Prepare Mini Chart Data (Last 7 days or all data if less)
    const chartData = useMemo(() => {
        const data = props.historyData || [];
        // Sort by date
        const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
        // Take last 7 entries for the sparkline
        const recent = sorted.slice(-7);
        
        return recent.map(d => {
            const completed = d.tasks.filter((t: any) => t.completed).length;
            // Height relative to max (capped at 10 for scale 100%)
            const height = Math.min((completed / 10) * 100, 100);
            return {
                date: d.date,
                completed,
                height: Math.max(height, 10), // Min 10% height
                day: format(parseISO(d.date), 'EEEEE') // Single letter day
            };
        });
    }, [props.historyData]);

    return (
        <WidgetBase {...props} className={cn("col-span-2 sm:col-span-1 bg-card/60 backdrop-blur-md border border-border/50 rounded-[20px] shadow-sm hover:bg-muted/30 transition-colors", props.className)}>
            <div className="p-4 flex flex-col h-full gap-3">
                 <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-cyan-500/10 text-cyan-500">
                        <TrendingUp className="w-4 h-4" strokeWidth={3} />
                    </div>
                     <div className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-widest">Trend</div>
                </div>
                
                {/* Mini Chart */}
                <div className="flex items-end justify-between h-16 gap-1 mt-auto">
                    {chartData.length > 0 ? chartData.map((d, i) => (
                        <div key={d.date} className="flex flex-col items-center gap-1 flex-1">
                            <motion.div 
                                initial={{ height: 0 }}
                                animate={{ height: `${d.height}%` }}
                                transition={{ duration: 0.5, delay: i * 0.05 }}
                                className={cn(
                                    "w-full max-w-[12px] rounded-t-sm opacity-80",
                                    d.completed > 0 ? "bg-cyan-500" : "bg-muted"
                                )}
                            />
                            <span className="text-[8px] font-bold text-muted-foreground uppercase">{d.day}</span>
                        </div>
                    )) : (
                        <div className="w-full text-center text-xs text-muted-foreground">No data</div>
                    )}
                </div>
            </div>
        </WidgetBase>
    );
}
