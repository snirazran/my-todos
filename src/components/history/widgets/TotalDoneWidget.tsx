'use client';

import React from 'react';
import { WidgetBase, WidgetProps } from './WidgetBase';
import { CheckCircle2 } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/utils';

export function TotalDoneWidget(props: WidgetProps) {
    const value = props.stats?.completed || 0;

    return (
        <WidgetBase {...props} className={cn("shadow-sm hover:bg-muted/30 transition-colors", props.className)}>
            <div className="p-4 flex flex-col justify-between h-full gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-1 bg-emerald-500/10 text-emerald-500">
                    <CheckCircle2 className="w-4 h-4" strokeWidth={3} />
                </div>
                <div>
                     <div className="text-2xl font-black tracking-tighter flex items-baseline gap-0.5">
                        <AnimatedNumber value={value} />
                    </div>
                    <div className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-widest">Total Done</div>
                </div>
            </div>
        </WidgetBase>
    );
}
