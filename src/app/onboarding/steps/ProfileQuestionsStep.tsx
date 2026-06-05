'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { randomFrogIndices } from '@/lib/randomFrogIndices';
import type { OnboardingStepProps } from './types';
import type { MacroCategoryDefinition } from '@/lib/quests/types';

const Frog = dynamic(() => import('@/components/ui/FrogOnDeck'), { ssr: false });

type AboutOption = {
  id: string;
  label: string;
  icon?: string;
  iconImageUrl?: string;
};

type AboutQuestion = {
  id: string;
  title: string;
  subtitle?: string;
  sectionLabel: string;
  sectionIndex: number;
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
    sectionIndex: 0,
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
    sectionIndex: 0,
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
    sectionIndex: 0,
    options: [
      { id: 'first-time', label: 'No, this is my first time!', icon: '🍼' },
      { id: 'starting-fresh', label: "Yes, but I'm starting fresh", icon: '☕' },
    ],
  },
  {
    id: 'sleepDuration',
    title: 'How long do you usually sleep at night?',
    sectionLabel: 'Energy & Creativity',
    sectionIndex: 1,
    options: [
      { id: 'less-than-5', label: 'Less than 5 hours', icon: '😴' },
      { id: '5-7', label: '5-7 hours', icon: '🛏️' },
      { id: '7-9', label: '7-9 hours', icon: '🌙' },
      { id: 'more-than-9', label: 'More than 9 hours', icon: '☀️' },
    ],
  },
  {
    id: 'wakeEase',
    title: 'How easy is it for you to get out of bed?',
    sectionLabel: 'Energy & Creativity',
    sectionIndex: 1,
    options: [
      { id: 'very-easy', label: 'Very easy, I get up pretty quickly', icon: '🐬' },
      { id: 'sometimes-hard', label: 'Sometimes easy, some days can be hard', icon: '🧦' },
      { id: 'hard', label: 'Hard, I often struggle to get out of bed', icon: '🧸' },
    ],
  },
  {
    id: 'dayActivity',
    title: 'How active are you during the day?',
    sectionLabel: 'Energy & Creativity',
    sectionIndex: 1,
    options: [
      { id: 'on-the-move', label: "I'm on the move most of the day", icon: '🏃' },
      { id: 'balanced', label: 'I balance being stationary with some movement', icon: '🚶' },
      { id: 'not-active', label: "I don't move much and want to be more active", icon: '🪑' },
      { id: 'limited-movement', label: 'I have conditions that limit my movement', icon: '🌻' },
    ],
  },
  {
    id: 'overwhelmedFrequency',
    title: 'How often do you feel overwhelmed?',
    sectionLabel: "How's Life",
    sectionIndex: 2,
    options: [
      { id: 'several-times-week', label: 'I feel overwhelmed several times a week', icon: '😫' },
      { id: 'few-stressful-days', label: 'I have a few stressful days each month', icon: '😕' },
      { id: 'manage-well', label: 'I manage and overcome stress pretty well', icon: '😌' },
    ],
  },
  {
    id: 'supportCircle',
    title: 'How many people can you lean on for support in tough times?',
    sectionLabel: "How's Life",
    sectionIndex: 2,
    options: [
      { id: 'three-or-more', label: '3 or more', icon: '🌳' },
      { id: 'two', label: '2', icon: '🌿' },
      { id: 'one', label: '1', icon: '🌱' },
      { id: 'just-me', label: 'Just me', icon: '🍃' },
    ],
  },
  {
    id: 'routineHappiness',
    title: 'How happy are you with your current routine?',
    sectionLabel: "How's Life",
    sectionIndex: 2,
    options: [
      { id: 'completely', label: 'Completely, I take care of myself well', icon: '🥳' },
      { id: 'slightly', label: "Slightly, I'd like to see some improvements", icon: '😌' },
      { id: 'not-at-all', label: 'Not at all, I expect to see a major change', icon: '😮' },
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
  const frogIndices = useMemo(() => randomFrogIndices(), [questionIndex]);

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
      sectionIndex: 3,
      multiSelect: true,
      options: focusAreaCategories.map((c) => ({
        id: c.id,
        label: c.onboardingSentence?.trim() || c.name,
        iconImageUrl: c.coverImageUrl,
      })),
    }),
    [focusAreaCategories],
  );

  const displayedQuestions = useMemo(
    () => [...ABOUT_QUESTIONS, focusAreasQuestion],
    [focusAreasQuestion],
  );
  const currentQuestion = displayedQuestions[questionIndex];
  const totalStages = 5;
  const milestoneCount = totalStages - 1;
  const currentSection = currentQuestion.sectionIndex;
  const sectionQuestionCount = displayedQuestions.filter(
    (question) => question.sectionIndex === currentSection,
  ).length;
  const sectionQuestionOffset = displayedQuestions
    .filter((question) => question.sectionIndex === currentSection)
    .findIndex((question) => question.id === currentQuestion.id);
  const baseProgress = currentSection / milestoneCount;
  const sectionSpan = 1 / milestoneCount;
  const sectionProgress = (sectionQuestionOffset / Math.max(sectionQuestionCount, 1)) * sectionSpan;
  const totalProgress = baseProgress + sectionProgress;
  const completedMilestones = Math.floor(totalProgress * milestoneCount + 0.0001);
  const progressWidth = `${totalProgress * 100}%`;
  const selectedValues = selections[currentQuestion.id] ?? [];
  const selected = selectedValues[0];

  useEffect(() => {
    if ((selections[currentQuestion.id] ?? []).length > 0) return;
    onSelect(currentQuestion.id, '__clear__');
    // Clear only when a question is entered, so no option starts selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion.id, selections]);

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
          {Array.from({ length: Math.max(milestoneCount - 1, 0) }, (_, index) => {
            const milestoneNumber = index + 1;
            const isCompleted = milestoneNumber <= completedMilestones;

            return (
              <div
                key={milestoneNumber}
                className={cn(
                  'absolute top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-colors',
                  isCompleted ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-transparent',
                )}
                style={{ left: `${(milestoneNumber / milestoneCount) * 100}%` }}
              >
                {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-center text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
        {currentQuestion.sectionLabel}
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
        <div className="relative mb-3">
          <div className="hidden md:block">
            <Frog
              width={260}
              height={260}
              indices={frogIndices}
              title={currentQuestion.title}
            />
          </div>
          <div className="block md:hidden">
            <Frog
              width={210}
              height={210}
              indices={frogIndices}
              title={currentQuestion.title}
            />
          </div>
        </div>
        {currentQuestion.subtitle && (
          <p className="text-center text-base md:text-lg font-medium text-muted-foreground mb-2">
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
            const isSelected = currentQuestion.multiSelect
              ? selectedValues.includes(option.id)
              : selected === option.id;
            const hasIcon = !!option.icon || !!option.iconImageUrl;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseOption(option.id)}
                disabled={saving}
                className={cn(
                  'h-[62px] rounded-3xl border-2 bg-background text-base font-black text-foreground shadow-sm transition-all duration-200 active:scale-[0.98] md:h-[68px] md:text-lg',
                  hasIcon && 'flex items-center justify-start gap-4 px-5 text-left',
                  isSelected
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border/50 hover:border-primary/30 hover:bg-muted/30',
                  saving && 'cursor-not-allowed opacity-70',
                )}
              >
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

        {currentQuestion.multiSelect && (
          <div className="mt-3 flex w-[calc(100%+2rem)] max-w-[calc(100vw-2rem)] justify-center pb-6">
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
  );
}
