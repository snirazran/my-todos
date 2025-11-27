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
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(#7c3aed,#6366f1,#7c3aed)] animate-spin" />
      <div className="absolute inset-[4px] rounded-full bg-white/90 dark:bg-slate-950" />
      <div className="absolute inset-[10px] rounded-full bg-indigo-100/60 dark:bg-indigo-900/50 blur-[1px]" />
    </div>
  );
}

export function LoadingScreen({
  message = 'Loading...',
  subtext = '',
  fullscreen = true,
}: LoadingScreenProps) {
  return (
    <div
      className={`relative overflow-hidden ${
        fullscreen ? 'min-h-screen' : 'py-12'
      } flex items-center justify-center`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />
      <div className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.16),transparent_32%),radial-gradient(circle_at_75%_15%,rgba(99,102,241,0.14),transparent_30%),radial-gradient(circle_at_45%_80%,rgba(236,72,153,0.12),transparent_28%)]" />
      <div className="relative flex items-center justify-center w-full px-4">
        <div className="inline-flex flex-col items-center gap-4 px-6 py-6 rounded-2xl bg-white/85 dark:bg-slate-900/80 backdrop-blur-2xl shadow-[0_20px_60px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/80 dark:ring-slate-800/70 min-w-[220px]">
          <RingLoader />
          <div className="text-center space-y-1">
            <p className="text-base font-semibold text-slate-900 dark:text-white">
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
      <span className="w-4 h-4 rounded-full border-2 border-purple-500/70 border-t-transparent animate-spin" />
      {label && <span>{label}</span>}
    </span>
  );
}
