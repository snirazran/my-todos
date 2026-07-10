'use client';
import React from 'react';

export default function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.JSX.Element;
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-md">
      <div className="flex items-center justify-between mb-2">
        {icon}
        <span className="text-3xl font-bold text-foreground">
          {value}
        </span>
      </div>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}
