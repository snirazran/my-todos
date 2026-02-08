'use client';

import React from 'react';
import { WidgetBase, WidgetProps } from './WidgetBase';
import { Target } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/utils';

export function AverageWidget(props: WidgetProps) {
    const totalDone = props.stats?.completed || 0;
    const days = props.historyData?.length || 1;
    const value = Math.round(totalDone / (days > 0 ? days : 1));

    return (
        <WidgetBase {...props} className={cn("shadow-sm hover:bg-muted/30 transition-colors", props.className)}>
             <div className="p-4 flex flex-col justify-between h-full gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-1 bg-blue-500/10 text-blue-500">
                    <Target className="w-4 h-4" strokeWidth={3} />
                </div>
                <div>
                     <div className="text-2xl font-black tracking-tighter flex items-baseline gap-0.5">
                        <AnimatedNumber value={value} />
                        <span className="text-xs text-muted-foreground font-bold">/day</span>
                    </div>
                    <div className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-widest">Average</div>
                </div>
            </div>
        </WidgetBase>
    );
}
