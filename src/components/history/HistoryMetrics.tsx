'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { CheckCircle2, Target, Trophy, Flame } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { motion } from 'framer-motion';

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
    // Calculate "Best Day"
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
        <div className={cn("flex flex-col gap-4", className)}>
            {/* Hero Stat: Completion Rate */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-md shadow-sm rounded-[24px] overflow-hidden p-6 relative">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Target className="w-24 h-24" />
                </div>
                <div className="relative z-10 flex flex-col items-center justify-center text-center gap-2">
                    <div className="text-5xl sm:text-6xl font-black tracking-tighter text-foreground flex items-baseline">
                        <AnimatedNumber value={Math.round(completionRate)} />
                        <span className="text-2xl text-muted-foreground ml-1">%</span>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Completion Rate</p>

                    {/* Visual Bar */}
                    <div className="w-full max-w-[200px] h-2 bg-muted rounded-full mt-4 overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${completionRate}%` }}
                            transition={{ type: "spring", bounce: 0, duration: 1 }}
                            className={cn("h-full rounded-full",
                                completionRate === 100 ? "bg-emerald-500" :
                                    completionRate > 50 ? "bg-primary" : "bg-orange-400"
                            )}
                        />
                    </div>
                </div>
            </Card>

            {/* Sub Stats Grid */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <StatCard
                    label="Total Done"
                    value={completedTasks}
                    icon={CheckCircle2}
                    color="text-emerald-500"
                    bg="bg-emerald-500/10"
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
                    label="Active Days"
                    value={historyData.length}
                    suffix="d"
                    icon={Flame}
                    color="text-orange-500"
                    bg="bg-orange-500/10"
                />
                {/* Empty slot or another stat could go here, for now spreading 3 items or centered */}
                <div className="hidden sm:block">
                    {/* Placeholder or Future Stat */}
                    <StatCard
                        label="Average"
                        value={historyData.length > 0 ? Math.round(completedTasks / historyData.length) : 0}
                        suffix="/day"
                        icon={Target}
                        color="text-blue-500"
                        bg="bg-blue-500/10"
                    />
                </div>
            </div>
            {/* Mobile simplified 4th item if needed, but 3 items looks okay or just 2x2 with average */}
            <div className="block sm:hidden">
                <StatCard
                    label="Average"
                    value={historyData.length > 0 ? Math.round(completedTasks / historyData.length) : 0}
                    suffix="/day"
                    icon={Target}
                    color="text-blue-500"
                    bg="bg-blue-500/10"
                />
            </div>
        </div>
    );
}

function StatCard({ label, value, subValue, suffix, icon: Icon, color, bg }: any) {
    return (
        <Card className="border-border/50 bg-card/60 backdrop-blur-md shadow-sm hover:bg-muted/30 transition-colors rounded-[20px] overflow-hidden">
            <div className="p-4 flex flex-col justify-between h-full gap-3">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-1", bg, color)}>
                    <Icon className="w-4 h-4" strokeWidth={3} />
                </div>
                <div>
                    <div className="text-2xl font-black tracking-tighter flex items-baseline gap-0.5">
                        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
                        {suffix && <span className="text-xs text-muted-foreground font-bold">{suffix}</span>}
                    </div>
                    <div className="flex flex-col">
                        <div className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-widest">{label}</div>
                        {subValue && <div className="text-[10px] font-bold text-foreground mt-0.5">{subValue}</div>}
                    </div>
                </div>
            </div>
        </Card>
    );
}
