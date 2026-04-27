'use client';

import React from 'react';
import { Brain, Lock, Sparkles, X } from 'lucide-react';
import ProgressCoach from '@/components/history/ProgressCoach';

type ProgressCoachPopupProps = {
  open: boolean;
  onClose: () => void;
  isPremium: boolean;
  historyData: any[];
  availableTags: { id: string; name: string; color: string }[];
};

export default function ProgressCoachPopup({
  open,
  onClose,
  isPremium,
  historyData,
  availableTags,
}: ProgressCoachPopupProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close progress coach"
        onClick={onClose}
      />

      <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[32px] border border-border bg-background p-4 shadow-2xl sm:max-w-2xl sm:rounded-[32px] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wider text-foreground">
                Progress Coach
              </h2>
              <p className="text-xs font-semibold text-muted-foreground">
                Practical changes for your next few days.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border/70 bg-card p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close progress coach"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isPremium ? (
          <ProgressCoach
            historyData={historyData}
            dateRange="7d"
            selectedTags={[]}
            availableTags={availableTags}
          />
        ) : (
          <div className="rounded-[28px] border border-primary/15 bg-primary/[0.04] p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-black tracking-tight text-foreground">
              Unlock Progress Coach
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
              Get AI coaching that turns your recent task patterns into a clear plan.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground">
              <Sparkles className="h-4 w-4" />
              Pro feature
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
