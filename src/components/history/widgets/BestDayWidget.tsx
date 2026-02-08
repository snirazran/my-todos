'use client';

import React, { useMemo } from 'react';
import { WidgetBase, WidgetProps } from './WidgetBase';
import { Trophy } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

export function BestDayWidget(props: WidgetProps) {
    // Calculate Best Day
    const historyData = props.historyData || [];
    const bestDay = useMemo(() => {
        if (historyData.length === 0) return null;
        return historyData.reduce((prev, current) => {
            const prevCount = prev.tasks.filter((t: any) => t.completed).length;
            const currCount = current.tasks.filter((t: any) => t.completed).length;
            return currCount > prevCount ? current : prev;
        });
    }, [historyData]);

    const bestDayCount = bestDay ? bestDay.tasks.filter((t: any) => t.completed).length : 0;
    const dateLabel = bestDay ? format(parseISO(bestDay.date), 'MMM d') : '-';

    return (
        <WidgetBase {...props} className={cn("shadow-sm hover:bg-muted/30 transition-colors", props.className)}>
            <div className="p-4 flex flex-col justify-between h-full gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-1 bg-amber-500/10 text-amber-500">
                    <Trophy className="w-4 h-4" strokeWidth={3} />
                </div>
                <div>
                     <div className="text-2xl font-black tracking-tighter flex items-baseline gap-0.5">
                        <AnimatedNumber value={bestDayCount} />
                    </div>
                    <div className="flex flex-col">
                        <div className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-widest">Best Day</div>
                        <div className="text-[10px] font-bold text-foreground mt-0.5">{dateLabel}</div>
                    </div>
                </div>
            </div>
        </WidgetBase>
    );
}
