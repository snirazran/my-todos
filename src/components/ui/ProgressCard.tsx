'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

interface ProgressCardProps {
  rate: number; // percentage complete, e.g. 75
  done: number; // number of tasks done
  total: number; // total tasks
}

export default function ProgressCard({ rate, done, total }: ProgressCardProps) {
  return (
    <div
      dir="ltr"
      className="z-10 p-6 mb-6 bg-white shadow-lg rounded-2xl dark:bg-slate-800"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <Sparkles className="w-6 h-6 text-purple-500" />
          Your progress today
        </h2>
        <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
          {Math.round(rate)}%
        </span>
      </div>

      <div
        className="w-full h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(rate)}
        aria-label="Today's progress"
      >
        <div
          className="h-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 to-pink-500"
          style={{ width: `${Math.max(0, Math.min(100, rate))}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Completed {done} of {total} tasks
      </p>
    </div>
  );
}
