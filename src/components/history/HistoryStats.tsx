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

export default function HistoryStats({ data, className }: { data: StatData; className?: string }) {
  const stats = [
    {
      label: "Completion Rate",
      value: `${Math.round(data.completionRate)}%`,
      icon: Target,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      description: "of planned tasks"
    },
    {
      label: "Total Completed",
      value: data.completed,
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-900/20",
      description: "tasks finished"
    },
    {
       label: "Total Tasks",
       value: data.total,
       icon: ListTodo, // Changed to ListTodo for generic total
       color: "text-purple-500",
       bg: "bg-purple-50 dark:bg-purple-900/20",
       description: "recorded in history"
     },
  ];

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-3 mb-6", className)}>
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <Card className="border-none shadow-sm hover:shadow-md transition-shadow bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
              <div className="flex justify-between items-start">
                <div className={cn("p-2 rounded-lg", stat.bg)}>
                  <stat.icon className={cn("w-5 h-5", stat.color)} />
                </div>
                {/* Mini Bar Chart / Visual */}
                {stat.label === "Completion Rate" && (
                  <div className="h-8 w-8 relative flex items-center justify-center">
                     <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-slate-100 dark:text-slate-700"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <motion.path
                          className={stat.color}
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: data.completionRate / 100 }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          strokeDasharray="100, 100"
                        />
                     </svg>
                  </div>
                )}
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {typeof stat.value === 'number' ? (
                     <AnimatedNumber value={stat.value} />
                  ) : stat.value}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {stat.label}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}