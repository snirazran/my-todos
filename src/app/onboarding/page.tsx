'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type Option = { id: string; emoji: string; label: string };

const STEPS = [
  {
    id: 'welcome',
    title: "Welcome to FrogTask!",
    subtitle: "Let's set up your frog habitat in a few quick steps.",
    options: [] as Option[],
    multiSelect: false,
  },
  {
    id: 'goal',
    title: "What's your main goal?",
    subtitle: "We'll tailor your experience around this.",
    options: [
      { id: 'productive', emoji: '⚡', label: 'Stay productive' },
      { id: 'habits', emoji: '🔁', label: 'Build better habits' },
      { id: 'plan', emoji: '📅', label: 'Plan my week' },
      { id: 'all', emoji: '🐸', label: 'All of the above' },
    ],
    multiSelect: false,
  },
  {
    id: 'time',
    title: "When are you most productive?",
    subtitle: "We'll use this to suggest the best times for your tasks.",
    options: [
      { id: 'morning', emoji: '🌅', label: 'Morning person' },
      { id: 'afternoon', emoji: '☀️', label: 'Afternoon grinder' },
      { id: 'evening', emoji: '🌙', label: 'Night owl' },
      { id: 'varies', emoji: '🎲', label: 'It varies' },
    ],
    multiSelect: false,
  },
];

const TOTAL_STEPS = STEPS.length;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState(1);

  const current = STEPS[step];
  const selectedForStep = selections[current.id] ?? [];
  const canProceed = current.options.length === 0 || selectedForStep.length > 0;

  const toggle = (optionId: string) => {
    setSelections((prev) => {
      const existing = prev[current.id] ?? [];
      if (current.multiSelect) {
        return {
          ...prev,
          [current.id]: existing.includes(optionId)
            ? existing.filter((x) => x !== optionId)
            : [...existing, optionId],
        };
      }
      return { ...prev, [current.id]: [optionId] };
    });
  };

  const handleNext = async () => {
    if (!canProceed) return;
    if (step < TOTAL_STEPS - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      setSaving(true);
      try {
        await fetch('/api/onboarding', { method: 'POST' });
      } catch {
        // best-effort — don't block navigation
      } finally {
        router.push('/');
      }
    }
  };

  const handleBack = () => {
    if (step === 0) return;
    setDirection(-1);
    setStep((s) => s - 1);
  };

  return (
    <main className="fixed inset-0 flex flex-col items-center bg-background px-5 pt-4 overflow-y-auto">

      <div className="relative z-10 w-full max-w-sm flex flex-col" style={{ minHeight: '100%' }}>
        {/* ── Progress bar ── */}
        <div className="flex items-center w-full gap-6 mb-0">
          {/* Left: small back button pushed to the edge */}
          <div className="-ml-5 shrink-0 w-6">
            {step > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center justify-center w-6 h-6 rounded-full border border-border/60 bg-background text-muted-foreground hover:bg-muted transition"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Centre: track */}
          <div className="flex-1 relative h-[8px]">
            <div className="absolute inset-0 rounded-full bg-border/30" />
            <div
              className="absolute top-0 left-0 h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(step / (TOTAL_STEPS - 1)) * 100}%` }}
            />
            {STEPS.map((s, i) => {
              const done = i < step;
              const pct = (i / (TOTAL_STEPS - 1)) * 100;
              return (
                <div
                  key={s.id}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                  style={{ left: `${pct}%` }}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300',
                    done ? 'bg-primary border-primary' : 'bg-background border-border/40',
                  )}>
                    {done && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: mirror spacer */}
          <div className="w-6 shrink-0" />
        </div>

        {/* ── Frog ── */}
        <div className="flex justify-center" style={{ marginTop: -30, marginBottom: -20 }}>
          <Frog
            width={200}
            height={200}
            indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
          />
        </div>

        {/* ── Step content ── */}
        <div className="flex-1">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="text-2xl font-black tracking-tight text-foreground text-center mb-1">
                {current.title}
              </h1>
              <p className="text-sm font-medium text-muted-foreground text-center mb-8">
                {current.subtitle}
              </p>

              {current.options.length > 0 && (
                <div className="flex flex-col gap-3">
                  {current.options.map((opt) => {
                    const selected = selectedForStep.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggle(opt.id)}
                        className={cn(
                          'flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98]',
                          selected
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-border/50 bg-background hover:border-primary/30 hover:bg-muted/40',
                        )}
                      >
                        <span className="text-2xl w-8 text-center shrink-0">{opt.emoji}</span>
                        <span
                          className={cn(
                            'flex-1 text-sm font-bold',
                            selected ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          {opt.label}
                        </span>
                        <div
                          className={cn(
                            'flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all duration-200 shrink-0',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border/50 text-transparent',
                          )}
                        >
                          {selected ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Plus className="w-3 h-3 text-muted-foreground/50" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Next button ── */}
        <div className="pt-6 pb-10">
          <motion.button
            type="button"
            onClick={handleNext}
            disabled={!canProceed || saving}
            whileTap={{ scale: 0.97 }}
            className={cn(
              'w-full h-14 rounded-2xl font-black uppercase tracking-wider text-sm transition-all duration-200',
              canProceed && !saving
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {saving ? 'Setting up...' : step === TOTAL_STEPS - 1 ? "Let's go!" : 'Next'}
          </motion.button>
        </div>
      </div>
    </main>
  );
}
