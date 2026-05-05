'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type AboutQuestion = {
  id: string;
  title: string;
  subtitle?: string;
  sectionLabel: string;
  sectionIndex: number;
  multiSelect?: boolean;
  options: Array<{ id: string; label: string; icon?: string }>;
  plainOption?: { id: string; label: string };
};

type SupportFollowUpConfig = {
  title: string;
  options: Array<{ id: string; label: string; icon: string }>;
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
    title: 'Have you used FrogTask before?',
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
  {
    id: 'supportAreas',
    title: 'What areas would you like support with?',
    sectionLabel: 'Support Areas',
    sectionIndex: 3,
    multiSelect: true,
    options: [
      { id: 'self-acceptance', label: 'Self-acceptance and confidence', icon: '🌻' },
      { id: 'more-active', label: 'Be more active', icon: '👟' },
      { id: 'sleep-better', label: 'Sleep better', icon: '😴' },
      { id: 'healthy-eating', label: 'Build healthy eating habits', icon: '🍎' },
      { id: 'focus-productivity', label: 'Boost focus and productivity', icon: '🎯' },
      { id: 'keep-routine', label: 'Build and keep a routine', icon: '🌱' },
    ],
  },
];

const SUPPORT_AREA_FOLLOW_UPS: Record<string, SupportFollowUpConfig> = {
  'self-acceptance': {
    title: 'Which topics make it harder for you to feel confident or accept yourself?',
    options: [
      { id: 'energy-levels', label: 'Energy levels', icon: '🔋' },
      { id: 'chronic-pain', label: 'Chronic pain', icon: '⛰️' },
      { id: 'body-image', label: 'Body image', icon: '🧡' },
      { id: 'overall-health', label: 'Overall health', icon: '💪' },
      { id: 'social-skills', label: 'Social skills', icon: '☎️' },
      { id: 'relationships', label: 'Relationships', icon: '🧑‍🤝‍🧑' },
    ],
  },
  'more-active': {
    title: 'What usually gets in the way of being more active?',
    options: [
      { id: 'low-energy', label: 'Low energy', icon: '🔋' },
      { id: 'pain-discomfort', label: 'Pain or discomfort', icon: '🪨' },
      { id: 'lack-of-time', label: 'Lack of time', icon: '⏰' },
      { id: 'motivation', label: 'Motivation', icon: '🧠' },
      { id: 'not-sure-where-start', label: 'Not sure where to start', icon: '🧭' },
      { id: 'limited-access', label: 'Limited access or resources', icon: '🚧' },
    ],
  },
  'sleep-better': {
    title: 'What tends to make sleep harder for you?',
    options: [
      { id: 'hard-falling-asleep', label: 'Falling asleep', icon: '🌙' },
      { id: 'wake-up-often', label: 'Waking up often', icon: '⏱️' },
      { id: 'stress-racing-thoughts', label: 'Stress or racing thoughts', icon: '💭' },
      { id: 'schedule', label: 'An inconsistent schedule', icon: '🗓️' },
      { id: 'screen-time', label: 'Too much screen time', icon: '📱' },
      { id: 'pain-discomfort', label: 'Pain or discomfort', icon: '🛌' },
    ],
  },
  'healthy-eating': {
    title: 'What makes healthy eating harder right now?',
    options: [
      { id: 'cravings', label: 'Cravings', icon: '🍫' },
      { id: 'lack-of-time', label: 'Lack of time', icon: '⏰' },
      { id: 'meal-planning', label: 'Meal planning', icon: '📝' },
      { id: 'budget', label: 'Budget', icon: '💸' },
      { id: 'emotional-eating', label: 'Emotional eating', icon: '💓' },
      { id: 'energy-to-cook', label: 'Not enough energy to cook', icon: '🍳' },
    ],
  },
  'focus-productivity': {
    title: 'What most often affects your focus or productivity?',
    options: [
      { id: 'distractions', label: 'Distractions', icon: '📣' },
      { id: 'overwhelm', label: 'Feeling overwhelmed', icon: '🌊' },
      { id: 'low-energy', label: 'Low energy', icon: '🔋' },
      { id: 'difficulty-starting', label: 'Difficulty getting started', icon: '🚦' },
      { id: 'forgetfulness', label: 'Forgetfulness', icon: '🧩' },
      { id: 'no-routine', label: 'Lack of routine', icon: '📍' },
    ],
  },
  'keep-routine': {
    title: 'What makes it hard to build or keep a routine?',
    options: [
      { id: 'inconsistent-energy', label: 'Inconsistent energy', icon: '🔋' },
      { id: 'busy-schedule', label: 'A busy schedule', icon: '🗓️' },
      { id: 'forgetting', label: 'Forgetting', icon: '🧠' },
      { id: 'motivation', label: 'Motivation', icon: '🌱' },
      { id: 'life-changes', label: 'Life changes or unpredictability', icon: '🌦️' },
      { id: 'too-many-goals', label: 'Trying to change too much at once', icon: '🎯' },
    ],
  },
};

export default function ProfileQuestionsStep({
  selections,
  onSelect,
  onNext,
  onBack,
  saving,
  direction,
}: OnboardingStepProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const selectedSupportAreas = selections.supportAreas ?? [];
  const displayedQuestions = useMemo(() => {
    const followUpQuestions: AboutQuestion[] = selectedSupportAreas
      .filter((areaId) => SUPPORT_AREA_FOLLOW_UPS[areaId])
      .map((areaId) => {
        const config = SUPPORT_AREA_FOLLOW_UPS[areaId];
        return {
          id: `support-followup-${areaId}`,
          title: config.title,
          sectionLabel: 'Support Areas',
          sectionIndex: 3,
          multiSelect: true,
          options: config.options,
        };
      });

    return [...ABOUT_QUESTIONS, ...followUpQuestions];
  }, [selectedSupportAreas]);
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
            const isSelected = currentQuestion.multiSelect
              ? selectedValues.includes(option.id)
              : selected === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseOption(option.id)}
                disabled={saving}
                className={cn(
                  'h-[62px] rounded-3xl border-2 bg-background text-base font-black text-foreground shadow-sm transition-all duration-200 active:scale-[0.98] md:h-[68px] md:text-lg',
                  option.icon && 'flex items-center justify-start gap-4 px-5 text-left',
                  isSelected
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border/50 hover:border-primary/30 hover:bg-muted/30',
                  saving && 'cursor-not-allowed opacity-70',
                )}
              >
                {option.icon && (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-3xl leading-none">
                    {option.icon}
                  </span>
                )}
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
