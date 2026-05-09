'use client';

import React from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import ProgressCoach from '@/components/coach/ProgressCoach';
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
                <LockedProgressCoach />
              )}
            </div>
          </div>
        );
      }}
    </BaseSheet>
  );
}

function LockedProgressCoach() {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[30px] border border-primary/20 bg-card/80 shadow-sm">
        <div className="border-b border-border/50 bg-primary/[0.04] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <Lock className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary-foreground">
                  Pro coach
                </span>
              </div>
              <h3 className="text-xl font-black leading-tight tracking-tight text-foreground">
                Know exactly what to change next.
              </h3>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-muted-foreground">
                Progress Coach reads your recent tasks, tags, and focus sessions, then turns them into a simple plan.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            <Brain className="h-4 w-4 text-primary" />
            Preview
          </div>
          <div className="space-y-3">
            <div className="rounded-[24px] border border-border/50 bg-background/70 p-4">
              <PreviewTitle icon={Brain} label="Main insight" />
              <p className="mt-2 text-sm font-black leading-snug text-foreground">
                Your progress drops when tasks stay vague or pile up on the same day.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <PreviewMiniCard
                icon={ShieldCheck}
                label="Works"
                text="Short, specific lists get finished."
                tone="emerald"
              />
              <PreviewMiniCard
                icon={AlertTriangle}
                label="Adjust"
                text="Open-ended reminders are easier to miss."
                tone="amber"
              />
            </div>

            <div className="rounded-[24px] border border-primary/20 bg-primary/[0.04] p-4">
              <PreviewTitle icon={Target} label="Do next" />
              <div className="mt-3 space-y-2">
                {[
                  'Keep busy days to 3 important tasks.',
                  'Schedule one soft reminder for a fixed time.',
                  'Start a focus session on your hardest task.',
                ].map((step, index) => (
                  <div key={step} className="flex items-start gap-3 rounded-2xl bg-background/70 px-3 py-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="text-[11px] font-black">{index + 1}</span>
                    </div>
                    <p className="text-sm font-bold leading-snug text-foreground">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Benefit label="Less guessing" />
        <Benefit label="Better planning" />
        <Benefit label="Clear next steps" />
      </section>

      <section className="rounded-[26px] border border-border/60 bg-card/70 p-4 shadow-sm">
        <div className="space-y-2">
          {[
            'Find the pattern behind missed tasks.',
            'Separate what works from what needs adjusting.',
            'Get a short plan you can use before planning tomorrow.',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm font-bold leading-snug text-foreground">
                {item}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-wider text-primary-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
          Unlock Progress Coach
        </div>
      </section>
    </div>
  );
}

function PreviewTitle({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </div>
  );
}

function PreviewMiniCard({
  icon: Icon,
  label,
  text,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  text: string;
  tone: 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-600 dark:text-emerald-400'
      : 'border-amber-500/20 bg-amber-500/[0.05] text-amber-600 dark:text-amber-400';

  return (
    <div className={`rounded-[22px] border p-3 shadow-sm ${toneClass}`}>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/70">
        <Icon className="h-4 w-4" />
      </div>
        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
      </div>
      <p className="text-sm font-black leading-snug text-foreground">{text}</p>
    </div>
  );
}

function Benefit({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] px-2 py-3 text-center text-[11px] font-black leading-tight text-primary shadow-sm">
      {label}
    </div>
  );
}
