'use client';

import React from 'react';

interface LoadingScreenProps {
  message?: string;
  fullscreen?: boolean;
  subtext?: string;
}

function FrogLoaderStatic() {
  return (
    <div className="relative w-28 h-28 drop-shadow-xl">
      <div className="absolute inset-1 rounded-2xl bg-emerald-200/50 dark:bg-emerald-300/10 blur-2xl" />
      <div className="relative flex items-center justify-center w-full h-full rounded-2xl bg-white/95 dark:bg-slate-900/85 ring-1 ring-emerald-100/70 dark:ring-emerald-400/20">
        <div className="flex items-center justify-center w-20 h-20 text-4xl rounded-full bg-emerald-50 dark:bg-emerald-900/60 shadow-inner">
          🐸
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen({
  message = 'Loading...',
  subtext = 'Summoning your frog and fetching your data.',
  fullscreen = true,
}: LoadingScreenProps) {
  return (
    <div
      className={`relative overflow-hidden ${
        fullscreen ? 'min-h-screen' : 'py-12'
      } flex items-center justify-center`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-900/80 dark:to-emerald-950" />
      <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.25),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.2),transparent_32%),radial-gradient(circle_at_50%_80%,rgba(236,72,153,0.16),transparent_28%)]" />
      <div className="relative flex items-center justify-center w-full px-4">
        <div className="inline-flex flex-col items-center gap-4 px-6 py-6 rounded-2xl bg-white/90 dark:bg-slate-900/80 backdrop-blur-lg shadow-2xl ring-1 ring-emerald-100/70 dark:ring-white/10 min-w-[260px]">
          <FrogLoaderStatic />
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
              {message}
            </p>
            {subtext && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {subtext}
              </p>
            )}
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
