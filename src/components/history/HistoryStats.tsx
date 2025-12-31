'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Target, ListTodo } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

type StatData = {
  total: number;
  completed: number;
  completionRate: number;
};

export default function HistoryStats({
  data,
  className,
}: {
  data: StatData;
  className?: string;
}) {
  const stats = [
    {
      label: 'Completion Rate',
      value: `${Math.round(data.completionRate)}%`,
      icon: Target,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      description: 'of planned tasks',
    },
    {
      label: 'Total Completed',
      value: data.completed,
      icon: CheckCircle2,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
      description: 'tasks finished',
    },
    {
      label: 'Total Tasks',
      value: data.total,
      icon: ListTodo,
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      description: 'recorded in history',
    },
  ];

  return (
    <div
      className={cn(
        'flex overflow-x-auto gap-3 pb-4 -mx-4 px-4 snap-x no-scrollbar md:grid md:grid-cols-3 md:gap-4 md:pb-0 md:mx-0 md:px-0 mb-6',
        className
      )}
    >
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex-1 min-w-[130px] md:min-w-0 snap-center flex"
        >
          <div className="relative group w-full">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[24px]" />

            <Card className="relative overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 bg-card/80 backdrop-blur-2xl rounded-[24px] w-full">
              <CardContent className="p-4 md:p-5 flex flex-row md:flex-col items-center md:items-start gap-4 h-full">
                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-2xl shrink-0 transition-transform duration-300 group-hover:scale-110',
                    stat.bg
                  )}
                >
                  <stat.icon
                    className={cn('w-5 h-5 md:w-6 md:h-6', stat.color)}
                    strokeWidth={2.5}
                  />
                </div>

                    <div className="min-w-0 flex-1 md:flex-none">
                      <div className="text-lg sm:text-xl md:text-3xl font-black tracking-tight text-foreground leading-tight">
                        {typeof stat.value === 'number' ? (
                           <AnimatedNumber value={stat.value} />
                        ) : stat.value}
                      </div>
                      <p className="text-[9px] md:text-[11px] text-muted-foreground font-black uppercase tracking-[0.05em] opacity-70 leading-tight mt-0.5">
                        {stat.label}
                      </p>
                    </div>

                {/* Mini Chart - Hidden on mobile */}
                {stat.label === 'Completion Rate' && (
                  <div className="hidden md:flex h-8 w-8 relative items-center justify-center shrink-0 ml-auto md:ml-0 md:mt-auto">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-muted/20"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <motion.path
                        className={stat.color}
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: data.completionRate / 100 }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeDasharray="100, 100"
                      />
                    </svg>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </motion.div>
      ))}
    </div>
  );
}