'use client';

import React, { useMemo } from 'react';
import { WidgetBase, WidgetProps } from './WidgetBase';
import { Flame, Zap } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/utils';
import { parseISO, differenceInCalendarDays, subDays, startOfToday, format } from 'date-fns';

export function StreakWidget(props: WidgetProps) {
    
    // Calculate Streak
    const streak = useMemo(() => {
        const data = props.historyData || [];
        if (data.length === 0) return 0;
        
        // Convert to map for easy lookup
        const completedDays = new Set(
            data
                .filter((d: any) => d.tasks.some((t: any) => t.completed))
                .map((d: any) => d.date)
        );

        let currentStreak = 0;
        const today = startOfToday();
        
        // check today
        const todayStr = format(today, 'yyyy-MM-dd');
        if (completedDays.has(todayStr)) {
            currentStreak++;
        }

        // check backwards from yesterday
        let checkDate = subDays(today, 1);
        while (true) {
             const str = format(checkDate, 'yyyy-MM-dd');
             if (completedDays.has(str)) {
                 currentStreak++;
                 checkDate = subDays(checkDate, 1);
             } else {
                 break;
             }
        }
        
        return currentStreak;
    }, [props.historyData]);

    return (
        <WidgetBase {...props} className={cn("bg-card/60 backdrop-blur-md border border-border/50 rounded-[20px] shadow-sm hover:bg-muted/30 transition-colors", props.className)}>
             <div className="p-4 flex flex-col justify-between h-full gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-1 bg-rose-500/10 text-rose-500">
                    <Zap className="w-4 h-4" strokeWidth={3} />
                </div>
                <div>
                     <div className="text-2xl font-black tracking-tighter flex items-baseline gap-0.5">
                        <AnimatedNumber value={streak} />
                        <span className="text-xs text-muted-foreground font-bold">days</span>
                    </div>
                    <div className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-widest">Current Streak</div>
                </div>
            </div>
        </WidgetBase>
    );
}
