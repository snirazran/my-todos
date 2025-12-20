'use client';

import React from 'react';

interface LoadingScreenProps {
  message?: string;
  fullscreen?: boolean;
  subtext?: string;
}

function ThemeMorphLoader() {
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      {/* The Morphing Shape */}
      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-xl shadow-purple-500/30 animate-[morph-spin_2s_ease-in-out_infinite]" />

      <style jsx>{`
        @keyframes morph-spin {
          0% {
            border-radius: 12px; /* rounded-xl (Task Card shape) */
            transform: rotate(0deg);
          }
          50% {
            border-radius: 50%; /* Circle (Button/Avatar shape) */
            transform: rotate(180deg) scale(0.75); /* Shrink slightly */
          }
          100% {
            border-radius: 12px;
            transform: rotate(360deg);
          }
        }
      `}</style>
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
        fullscreen ? 'min-h-[calc(100dvh-3.5rem)] md:min-h-[calc(100dvh-4rem)]' : 'py-12'
      } flex items-center justify-center`}
    >
      {/* Cleaner, lighter background */}
      <div className="absolute inset-0 bg-slate-50/50 dark:bg-slate-950/50" />
      
      <div className="relative flex items-center justify-center w-full px-4">
        <div className="flex flex-col items-center gap-4">
          <ThemeMorphLoader />
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-slate-700 dark:text-slate-200 tracking-tight">
              {message}
            </p>
            {subtext ? (
              <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
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
      <span className="w-4 h-4 rounded-full border-2 border-slate-400/70 border-t-transparent animate-spin" />
      {label && <span>{label}</span>}
    </span>
  );
}
