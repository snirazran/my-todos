'use client';
import React from 'react';

export default function StatCard({
  icon,
  value,
  label,
}: {
  icon: JSX.Element;
  value: number | string;
  label: string;
}) {
  return (
    <div className="p-6 bg-white shadow-md dark:bg-slate-800 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        {icon}
        <span className="text-3xl font-bold text-slate-900 dark:text-white">
          {value}
        </span>
      </div>
      <p className="text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}
