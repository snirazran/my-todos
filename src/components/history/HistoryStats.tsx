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

        <div className={cn(

          "flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 snap-x no-scrollbar md:grid md:grid-cols-3 md:gap-4 md:pb-0 md:mx-0 md:px-0 mb-6",

          className

        )}>

          {stats.map((stat, i) => (

            <motion.div

              key={stat.label}

              initial={{ opacity: 0, y: 20 }}

              animate={{ opacity: 1, y: 0 }}

              transition={{ delay: i * 0.1 }}

              className="flex-1 min-w-[125px] md:min-w-0 snap-center flex"

            >

              <Card className="border-none shadow-sm hover:shadow-md transition-shadow bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm w-full">

                <CardContent className="p-2 md:p-4 flex flex-row md:flex-col items-center md:items-start gap-2.5 md:gap-3 h-full">

                  <div className={cn("p-1.5 md:p-2 rounded-lg shrink-0", stat.bg)}>

                    <stat.icon className={cn("w-4 h-4 md:w-5 md:h-5", stat.color)} />

                  </div>

                  

                  <div className="min-w-0 flex-1 md:flex-none">

                    <div className="text-sm md:text-2xl font-bold text-slate-900 dark:text-white truncate">

                      {typeof stat.value === 'number' ? (

                         <AnimatedNumber value={stat.value} />

                      ) : stat.value}

                    </div>

                    <p className="text-[9px] md:text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider truncate">

                      {stat.label}

                    </p>

                  </div>

    

                  {/* Mini Chart - Hidden on mobile for extreme efficiency */}

                  {stat.label === "Completion Rate" && (

                    <div className="hidden md:flex h-8 w-8 relative items-center justify-center shrink-0">

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

                </CardContent>

              </Card>

            </motion.div>

          ))}

        </div>

      );

    }

    

  