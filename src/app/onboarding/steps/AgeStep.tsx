'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type AboutQuestion = {
  id: string;
  title: string;
  subtitle?: string;
  options: Array<{ id: string; label: string; icon?: string }>;
  plainOption?: { id: string; label: string };
};

const ABOUT_QUESTIONS: AboutQuestion[] = [
  {
    id: 'age',
    title: 'How old are you?',
    subtitle: 'This helps us personalize your experience',
    options: [
      { id: 'under-18', label: 'Under 18' },
      { id: '18-24', label: '18-24' },
      { id: '25-34', label: '25-34' },
      { id: '35-44', label: '35-44' },
      { id: '45-54', label: '45-54' },
      { id: '55-64', label: '55-64' },
      { id: '65-plus', label: '65 and over' },
    ],
  },
  {
    id: 'aboutGender',
    title: "What's your gender?",
    options: [
      { id: 'male', label: 'Male' },
      { id: 'female', label: 'Female' },
      { id: 'non-binary', label: 'Non-binary' },
    ],
    plainOption: { id: 'prefer-not', label: 'Prefer not to answer' },
  },
  {
    id: 'usedBefore',
    title: 'Have you used FrogTask before?',
    options: [
      { id: 'first-time', label: 'No, this is my first time!', icon: '🍼' },
      { id: 'starting-fresh', label: "Yes, but I'm starting fresh", icon: '☕' },
    ],
  },
];

export default function AgeStep({ selections, onSelect, onNext, onBack, saving, direction }: OnboardingStepProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const currentQuestion = ABOUT_QUESTIONS[questionIndex];
  const progressSlots = Math.max(ABOUT_QUESTIONS.length, 4);
  const firstMilestonePct = 100 / Math.max(progressSlots - 1, 1);
  const progressWidth = `${((questionIndex + 1) / ABOUT_QUESTIONS.length) * firstMilestonePct}%`;
  const selected = selections[currentQuestion.id]?.[0];

  useEffect(() => {
    onSelect(currentQuestion.id, '__clear__');
    // Clear only when a question is entered, so no option starts selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion.id]);

  const chooseOption = (id: string) => {
    onSelect(currentQuestion.id, id);
    window.setTimeout(() => {
      if (questionIndex < ABOUT_QUESTIONS.length - 1) {
        setQuestionIndex((index) => index + 1);
      } else {
        onNext();
      }
    }, 120);
  };

  const handleBack = () => {
    if (questionIndex > 0) {
      setQuestionIndex((index) => index - 1);
      return;
    }
    onBack();
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="relative mt-12 h-10">
        <button
          onClick={handleBack}
          className="absolute left-[-1.25rem] top-0 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 md:left-[-1.75rem]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="relative mx-auto h-10 w-[74%]">
          <div className="absolute left-0 right-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-muted" />
          <div className="absolute left-0 top-1/2 h-3 -translate-y-1/2" style={{ width: progressWidth }}>
            <motion.div
              className="h-full w-full rounded-full bg-primary shadow-sm"
              animate={{
                filter: ['brightness(1)', 'brightness(1.08)', 'brightness(1)'],
                boxShadow: [
                  '0 1px 2px rgba(0,0,0,0.08)',
                  '0 0 14px rgba(34,197,94,0.35)',
                  '0 1px 2px rgba(0,0,0,0.08)',
                ],
              }}
              transition={{
                duration: 2.2,
                ease: 'easeInOut',
                repeat: Infinity,
              }}
            />
          </div>
          {Array.from({ length: progressSlots - 1 }, (_, index) => index + 1).map((index) => (
            <div
              key={index}
              className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted transition-colors"
              style={{ left: `${(index / Math.max(progressSlots - 1, 1)) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
        About you
      </p>

      <motion.div
        key={currentQuestion.id}
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="mt-2 flex flex-col items-center"
      >
        <div className="relative mb-5">
          <div className="hidden md:block">
            <Frog
              width={210}
              height={210}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>
          <div className="block md:hidden">
            <Frog
              width={170}
              height={170}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>
        </div>

        <h1 className="text-center text-2xl font-black tracking-tight text-foreground">
          {currentQuestion.title}
        </h1>
        {currentQuestion.subtitle && (
          <p className="mt-2 text-center text-base md:text-lg font-medium text-muted-foreground">
            {currentQuestion.subtitle}
          </p>
        )}

        <div
          className={cn(
            'flex w-[calc(100%+2rem)] max-w-[calc(100vw-2rem)] flex-col pb-6',
            currentQuestion.subtitle ? 'mt-7 gap-2.5' : 'mt-12 gap-3',
          )}
        >
          {currentQuestion.options.map((option) => {
            const isSelected = selected === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseOption(option.id)}
                disabled={saving}
                className={cn(
                  'h-[62px] rounded-3xl border-2 bg-background text-base font-black text-foreground shadow-sm transition-all duration-200 active:scale-[0.98] md:h-[68px] md:text-lg',
                  option.icon && 'flex items-center justify-start gap-4 px-4 text-left',
                  isSelected
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border/50 hover:border-primary/30 hover:bg-muted/30',
                  saving && 'cursor-not-allowed opacity-70',
                )}
              >
                {option.icon && <span className="text-3xl leading-none">{option.icon}</span>}
                <span>{option.label}</span>
              </button>
            );
          })}
          {currentQuestion.plainOption && (
            <button
              type="button"
              onClick={() => chooseOption(currentQuestion.plainOption!.id)}
              disabled={saving}
              className={cn(
                'mt-7 h-12 text-base font-black text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]',
                saving && 'cursor-not-allowed opacity-70',
              )}
            >
              {currentQuestion.plainOption.label}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
