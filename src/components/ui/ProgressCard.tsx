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
    <div className="z-10 p-6 mb-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <Sparkles className="w-6 h-6 text-purple-500" />
          ההתקדמות שלך היום
        </h2>
        <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
          {Math.round(rate)}%
        </span>
      </div>

      <div className="w-full h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 to-pink-500"
          style={{ width: `${rate}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        השלמת {done} מתוך {total} משימות
      </p>
    </div>
  );
}
