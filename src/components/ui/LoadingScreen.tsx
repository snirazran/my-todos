'use client';

import React from 'react';

interface LoadingScreenProps {
  message?: string;
  fullscreen?: boolean;
  subtext?: string;
}

function RingLoader() {
  return (
    <div className="relative flex items-center justify-center w-16 h-16 drop-shadow-sm">
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(#10b981,#6366f1,#10b981)] animate-spin" />
      <div className="absolute inset-[4px] rounded-full bg-white dark:bg-slate-900" />
      <div className="absolute inset-[10px] rounded-full bg-emerald-100/70 dark:bg-emerald-800/60 blur-[1px]" />
    </div>
  );
}

export function LoadingScreen({
  message = 'Loading…',
  subtext = '',
  fullscreen = true,
}: LoadingScreenProps) {
  return (
    <div
      className={`relative overflow-hidden ${
        fullscreen ? 'min-h-screen' : 'py-12'
      } flex items-center justify-center`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-900/80 dark:to-emerald-950" />
      <div className="absolute inset-0 opacity-35 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.14),transparent_32%),radial-gradient(circle_at_50%_80%,rgba(236,72,153,0.12),transparent_28%)]" />
      <div className="relative flex items-center justify-center w-full px-4">
        <div className="inline-flex flex-col items-center gap-4 px-6 py-6 rounded-2xl bg-white/90 dark:bg-slate-900/85 backdrop-blur-lg shadow-2xl ring-1 ring-white/60 dark:ring-white/10 min-w-[220px]">
          <RingLoader />
          <div className="text-center space-y-1">
            <p className="text-base font-semibold text-emerald-900 dark:text-emerald-100">
              {message}
            </p>
            {subtext ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {subtext}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
      <span className="w-4 h-4 rounded-full border-2 border-emerald-500/70 border-t-transparent animate-spin" />
      {label && <span>{label}</span>}
    </span>
  );
}
