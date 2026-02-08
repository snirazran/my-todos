'use client';

import React, { useMemo } from 'react';
import { WidgetBase, WidgetProps } from './WidgetBase';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

export function ProductivityTrendWidget(props: WidgetProps) {
    
    // Prepare Mini Chart Data (Last 7 days fixed, filling gaps)
    const chartData = useMemo(() => {
        const today = new Date();
        const days = [];
        
        // Generate last 7 days (ending yesterday, matching the general history view logic usually)
        // Or if we want "upto today", let's stick to the "last 7 days" concept. 
        // Based on HistoryPage text "Yesterday", let's end with Yesterday.
        // Actually, let's just show the last 7 available days ending today for immediate feedback?
        // Let's stick to: End date = Today.
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(format(d, 'yyyy-MM-dd'));
        }

        return days.map(dateStr => {
            const dayData = props.historyData?.find((d: any) => d.date === dateStr);
            const completed = dayData ? dayData.tasks.filter((t: any) => t.completed).length : 0;
            
            // Height relative to max (capped at 10 for scale 100%)
            // If we want a dynamic scale, we should find max first. But let's keep 10 as a "good day" goal.
            const height = Math.min((completed / 10) * 100, 100);
            
            return {
                date: dateStr,
                completed,
                height: Math.max(height, 10), // Min 10% height for visibility
                day: format(parseISO(dateStr), 'EEEEE') // Single letter day
            };
        });
    }, [props.historyData]);

    return (
        <WidgetBase {...props} className={cn("col-span-2 sm:col-span-1 shadow-sm hover:bg-muted/30 transition-colors", props.className)}>
            <div className="p-4 flex flex-col h-full gap-3">
                 <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-cyan-500/10 text-cyan-500">
                        <TrendingUp className="w-4 h-4" strokeWidth={3} />
                    </div>
                     <div className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-widest">Trend</div>
                </div>
                
                {/* Mini Chart */}
                <div className="flex justify-between items-end h-[60px] gap-1 mt-auto">
                    {chartData.length > 0 ? chartData.map((d, i) => (
                        <div key={d.date} className="flex flex-col items-center justify-end gap-1 flex-1 h-full"> 
                            {/* Bar Container - Fixed height relative to trend area */}
                            <div className="w-full flex items-end justify-center h-full relative">
                                <motion.div 
                                    initial={{ height: 0 }}
                                    animate={{ height: `${d.height}%` }}
                                    transition={{ duration: 0.5, delay: i * 0.05 }}
                                    className={cn(
                                        "w-full max-w-[12px] rounded-t-sm",
                                        d.completed > 0 ? "bg-cyan-500" : "bg-primary/10"
                                    )}
                                />
                            </div>
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
