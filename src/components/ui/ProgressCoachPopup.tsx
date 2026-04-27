'use client';

import React from 'react';
import { Brain, CheckCircle2, Lock, Sparkles, X } from 'lucide-react';
import ProgressCoach from '@/components/history/ProgressCoach';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';

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
  const overscrollDrag = useSheetOverscrollDrag();

  return (
    <BaseSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      className="h-[90vh] bg-background sm:h-[86vh] sm:max-w-2xl"
      backdropClassName="bg-black/45 backdrop-blur-sm sm:bg-black/45"
      zIndex={1090}
    >
      {({ isDesktop, dragControls }) => {
        overscrollDrag.setContext(dragControls, !isDesktop);

        return (
          <div className="relative flex h-full min-h-0 flex-col">
            <div
              onPointerDown={(event) => !isDesktop && dragControls.start(event)}
              className="shrink-0 border-b border-border/50 bg-card/70 px-4 py-4 backdrop-blur-2xl sm:px-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15">
                    <Brain className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-black uppercase tracking-wider text-foreground">
                        Progress Coach
                      </h2>
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                        {isPremium ? 'Pro' : 'Locked'}
                      </span>
                    </div>
                    <p className="mt-1 max-w-md text-xs font-semibold leading-relaxed text-muted-foreground">
                      What is working, what to adjust, and what to do next.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="rounded-xl border border-border/70 bg-background/70 p-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Close progress coach"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              ref={overscrollDrag.bind}
              className="min-h-0 flex-1 overflow-y-auto overscroll-none p-4 sm:p-5"
            >
              {isPremium ? (
                <ProgressCoach
                  historyData={historyData}
                  dateRange="7d"
                  selectedTags={[]}
                  availableTags={availableTags}
                />
              ) : (
                <div className="rounded-[28px] border border-primary/15 bg-card/70 p-5 shadow-sm backdrop-blur-xl">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Lock className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black tracking-tight text-foreground">
                        Unlock Progress Coach
                      </h3>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-muted-foreground">
                        Get a short weekly plan that turns recent patterns into clear next steps.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-border/50 bg-background/60 p-3">
                    {[
                      'See the pattern behind your recent progress.',
                      'Find the main thing to adjust.',
                      'Get 3 practical changes for the next few days.',
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p className="text-sm font-semibold leading-snug text-foreground">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground">
                    <Sparkles className="h-4 w-4" />
                    Pro feature
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }}
    </BaseSheet>
  );
}
