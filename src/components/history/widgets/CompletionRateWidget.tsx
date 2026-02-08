'use client';

import React from 'react';
import { WidgetBase, WidgetProps } from './WidgetBase';
import { Target } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function CompletionRateWidget(props: WidgetProps) {
    const rate = props.stats?.completionRate || 0;

    return (
        <WidgetBase {...props} className={cn("col-span-2 sm:col-span-2 p-6 flex flex-col items-center justify-center text-center gap-2", props.className)}>
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <Target className="w-24 h-24" />
            </div>
            
            <div className="relative z-10 flex flex-col items-center">
                <div className="text-5xl sm:text-6xl font-black tracking-tighter text-foreground flex items-baseline">
                    <AnimatedNumber value={Math.round(rate)} />
                    <span className="text-2xl text-muted-foreground ml-1">%</span>
                </div>
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Completion Rate</p>

                <div className="w-full max-w-[200px] h-2 bg-muted rounded-full mt-4 overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${rate}%` }}
                        transition={{ type: "spring", bounce: 0, duration: 1 }}
                        className={cn("h-full rounded-full",
                            rate === 100 ? "bg-emerald-500" :
                            rate > 50 ? "bg-primary" : "bg-orange-400"
                        )}
                    />
                </div>
            </div>
        </WidgetBase>
    );
}
