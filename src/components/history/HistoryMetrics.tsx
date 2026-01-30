'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { CheckCircle2, Target, Trophy, Flame } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

type DailyGroup = {
    date: string;
    tasks: any[];
};

type HistoryMetricsProps = {
    historyData: DailyGroup[];
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    className?: string; // Allow minimal styling injection
};

export default function HistoryMetrics({
    historyData,
    completedTasks,
    completionRate,
    className
}: HistoryMetricsProps) {
    // Calculate "Best Day" (most completed tasks)
    // Memoization inside component not strictly necessary if parent passes processed data, 
    // but good for safety. Assuming parent renders often.
    const bestDay = React.useMemo(() => {
        if (historyData.length === 0) return null;
        return historyData.reduce((prev, current) => {
            const prevCount = prev.tasks.filter(t => t.completed).length;
            const currCount = current.tasks.filter(t => t.completed).length;
            return currCount > prevCount ? current : prev;
        });
    }, [historyData]);

    const bestDayCount = bestDay ? bestDay.tasks.filter(t => t.completed).length : 0;

    return (
        <div className={cn("grid grid-cols-2 gap-3", className)}>
            <StatCard
                label="Completion"
                value={`${Math.round(completionRate)}%`}
                icon={Target}
                color="text-blue-500"
                bg="bg-blue-500/10"
            />
            <StatCard
                label="Total Done"
                value={completedTasks}
                icon={CheckCircle2}
                color="text-green-500"
                bg="bg-green-500/10"
            />
            <StatCard
                label="Best Day"
                value={bestDayCount}
                subValue={bestDay ? format(parseISO(bestDay.date), 'MMM d') : '-'}
                icon={Trophy}
                color="text-amber-500"
                bg="bg-amber-500/10"
            />
            <StatCard
                label="Streak"
                value={historyData.length} // Simplified
                suffix="d"
                icon={Flame}
                color="text-orange-500"
                bg="bg-orange-500/10"
            />
        </div>
    );
}

function StatCard({ label, value, subValue, suffix, icon: Icon, color, bg }: any) {
    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-xl shadow-sm hover:bg-card/80 transition-colors rounded-2xl overflow-hidden">
            <div className="p-3 flex flex-col justify-between h-full gap-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", bg, color)}>
                    <Icon className="w-4 h-4" strokeWidth={2.5} />
                </div>
                <div>
                    <div className="text-xl font-black tracking-tight flex items-baseline gap-0.5">
                        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
                        {suffix && <span className="text-xs text-muted-foreground font-medium">{suffix}</span>}
                    </div>
                    <div className="flex flex-col">
                        <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">{label}</div>
                        {subValue && <div className="text-[9px] font-bold text-muted-foreground/70">{subValue}</div>}
                    </div>
                </div>
            </div>
        </Card>
    );
}
