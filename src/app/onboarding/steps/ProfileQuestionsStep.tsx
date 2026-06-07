'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import type { MacroCategoryDefinition } from '@/lib/quests/types';
import { OnboardingFrogHeader } from './OnboardingFrogHeader';

type AboutOption = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  iconImageUrl?: string;
};

type AboutQuestion = {
  id: string;
  title: string;
  subtitle?: string;
  sectionLabel: string;
  multiSelect?: boolean;
  options: AboutOption[];
  plainOption?: { id: string; label: string };
};

const ABOUT_QUESTIONS: AboutQuestion[] = [
  {
    id: 'age',
    title: 'How old are you?',
    subtitle: 'This helps us personalize your experience',
    sectionLabel: 'About You',
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
    sectionLabel: 'About You',
    options: [
      { id: 'male', label: 'Male' },
      { id: 'female', label: 'Female' },
      { id: 'non-binary', label: 'Non-binary' },
    ],
    plainOption: { id: 'prefer-not', label: 'Prefer not to answer' },
  },
  {
    id: 'usedBefore',
    title: 'Have you used Frogress before?',
    sectionLabel: 'About You',
    options: [
      { id: 'first-time', label: 'No, this is my first time!', icon: '🍼' },
      { id: 'starting-fresh', label: "Yes, but I'm starting fresh", icon: '☕' },
    ],
  },
];

const FOCUS_AREAS_QUESTION_ID = 'focusAreas';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ProfileQuestionsStep({
  selections,
  onSelect,
  onNext,
  onBack,
  saving,
  direction,
}: OnboardingStepProps) {
  const [questionIndex, setQuestionIndex] = useState(0);

  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';

  const { data: questsData } = useSWR<{ macroCategories?: MacroCategoryDefinition[] }>(
    `/api/quests?view=home&timezone=${encodeURIComponent(tz)}`,
    fetcher,
  );

  const focusAreaCategories = questsData?.macroCategories ?? [];

  const focusAreasQuestion: AboutQuestion = useMemo(
    () => ({
      id: FOCUS_AREAS_QUESTION_ID,
      title: 'What areas would you like support with?',
      sectionLabel: 'Focus Areas',
      multiSelect: true,
      options: focusAreaCategories.map((c) => ({
        id: c.id,
        label: c.name,
        description: c.onboardingSentence?.trim() || undefined,
      })),
    }),
    [focusAreaCategories],
  );

  const displayedQuestions = useMemo(
    () => [...ABOUT_QUESTIONS, focusAreasQuestion],
    [focusAreasQuestion],
  );
  const currentQuestion = displayedQuestions[questionIndex];
  // One milestone per question page: the bar advances (and a circle fills) each
  // time you complete a question.
  const milestoneCount = displayedQuestions.length;
  const completedMilestones = questionIndex;
  const totalProgress = milestoneCount > 0 ? questionIndex / milestoneCount : 0;
  // Keep a sliver of green even at zero progress so the bar never looks empty.
  const progressWidth = `${Math.max(totalProgress, 0.05) * 100}%`;
  const selectedValues = selections[currentQuestion.id] ?? [];
  const selected = selectedValues[0];

  const chooseOption = (id: string) => {
    if (currentQuestion.multiSelect) {
      onSelect(currentQuestion.id, id, true);
      return;
    }

    onSelect(currentQuestion.id, id);
    window.setTimeout(() => {
      if (questionIndex < displayedQuestions.length - 1) {
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

  const handleMultiSelectNext = () => {
    if (selectedValues.length === 0) return;
    if (questionIndex < displayedQuestions.length - 1) {
      setQuestionIndex((index) => index + 1);
      return;
    }
    onNext();
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Progress bar — pinned at the top, above the frog */}
      <div className="absolute inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-40 flex items-center gap-3 px-3">
        <button
          onClick={handleBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-md ring-1 ring-border/40 backdrop-blur transition hover:bg-background"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="relative h-10 flex-1 rounded-full bg-background/85 px-4 shadow-md ring-1 ring-border/40 backdrop-blur">
          <div className="relative h-full">
            <div className="absolute left-0 right-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            <motion.div
              className="absolute left-0 top-1/2 h-3 -translate-y-1/2"
              initial={false}
              animate={{ width: progressWidth }}
              transition={{ type: 'spring', stiffness: 140, damping: 22 }}
            >
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
            </motion.div>
            {Array.from({ length: Math.max(milestoneCount - 1, 0) }, (_, index) => {
              const milestoneNumber = index + 1;
              const isCompleted = milestoneNumber <= completedMilestones;

              return (
                <div
                  key={milestoneNumber}
                  className={cn(
                    'absolute top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-colors',
                    isCompleted ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-zinc-300 text-transparent dark:bg-zinc-600',
                  )}
                  style={{ left: `${(milestoneNumber / milestoneCount) * 100}%` }}
                >
                  {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <OnboardingFrogHeader
        indices={{ skin: 0, hat: 0, body: 0, hand_item: 0, mood: 3 }}
        eyebrow={currentQuestion.sectionLabel}
        title={currentQuestion.title}
        subtitle={currentQuestion.subtitle}
      />

      <div className="relative z-20 flex flex-col pt-[356px] md:pt-[404px]">
      <motion.div
        key={currentQuestion.id}
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center"
      >
        <div
          className={cn(
            'flex w-[calc(100%+2rem)] max-w-[calc(100vw-2rem)] flex-col pb-6 md:mx-auto md:w-full md:max-w-md',
            'mt-1 gap-2.5',
          )}
        >
          {currentQuestion.id === FOCUS_AREAS_QUESTION_ID ? (
            <div className="grid grid-cols-2 gap-3">
              {focusAreaCategories.map((category) => {
                const isSelected = selectedValues.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => chooseOption(category.id)}
                    disabled={saving}
                    className={cn(
                      'group relative aspect-[4/5] overflow-hidden rounded-[20px] text-left transition-all duration-200',
                      isSelected
                        ? 'ring-[3px] ring-primary'
                        : 'ring-1 ring-border/60 hover:-translate-y-0.5 hover:ring-border active:scale-[0.98]',
                      saving && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    {category.coverImageUrl ? (
                      <img
                        src={category.coverImageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(135deg, ${category.backgroundFrom}, ${category.backgroundTo})`,
                        }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                    <div
                      className={cn(
                        'absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border-2 backdrop-blur-md transition-all',
                        isSelected
                          ? 'border-white bg-primary text-white'
                          : 'border-white/70 bg-black/25 text-transparent',
                      )}
                      aria-hidden
                    >
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </div>

                    <div className="absolute inset-x-0 bottom-0 p-2.5">
                      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/70">
                        {category.shortLabel || 'Focus'}
                      </p>
                      <h3 className="mt-0.5 text-sm font-black leading-tight tracking-tight text-white">
                        {category.name}
                      </h3>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {currentQuestion.options.map((option) => {
            const isSelected = currentQuestion.multiSelect
              ? selectedValues.includes(option.id)
              : selected === option.id;
            const hasIcon = !!option.icon || !!option.iconImageUrl;
            const hasDescription = !!option.description;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseOption(option.id)}
                disabled={saving}
                className={cn(
                  'rounded-3xl border-2 bg-background text-base font-black text-foreground shadow-sm transition-all duration-200 active:scale-[0.98]',
                  hasDescription
                    ? 'flex flex-col items-center justify-center gap-1 px-5 py-4 text-center md:py-3.5'
                    : 'h-[62px] md:h-[56px]',
                  !hasDescription && hasIcon && 'flex items-center justify-start gap-4 px-5 text-left',
                  isSelected
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border/50 hover:border-primary/30 hover:bg-muted/30',
                  saving && 'cursor-not-allowed opacity-70',
                )}
              >
                {hasDescription ? (
                  <>
                    <span>{option.label}</span>
                    {option.description ? (
                      <span
                        className={cn(
                          'text-sm font-medium leading-snug',
                          isSelected ? 'text-primary/75' : 'text-muted-foreground',
                        )}
                      >
                        {option.description}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    {option.iconImageUrl ? (
                      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted">
                        <img
                          src={option.iconImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </span>
                    ) : option.icon ? (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-3xl leading-none">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="flex-1">{option.label}</span>
                    {currentQuestion.multiSelect && (
                      <span
                        className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-full text-3xl font-medium transition-colors',
                          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {isSelected ? '−' : '+'}
                      </span>
                    )}
                  </>
                )}
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
            </>
          )}
        </div>

        {currentQuestion.multiSelect && (
          <div className="mt-3 flex w-[calc(100%+2rem)] max-w-[calc(100vw-2rem)] justify-center pb-6 md:mx-auto md:w-full md:max-w-md">
            <motion.button
              type="button"
              onClick={handleMultiSelectNext}
              disabled={selectedValues.length === 0 || saving}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'h-14 w-full rounded-3xl font-bold text-base tracking-wide transition-all duration-200',
                selectedValues.length > 0 && !saving
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {saving ? 'Setting up...' : 'Next'}
            </motion.button>
          </div>
        )}
      </motion.div>
      </div>
    </div>
  );
}
