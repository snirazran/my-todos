'use client';

import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import useSWR, { preload } from 'swr';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import type { MacroCategoryDefinition } from '@/lib/quests/types';
import {
  barrierQuestionId,
  STARTER_BARRIER_FOLLOW_UPS,
  type StarterBarrierPrompt,
} from '@/lib/quests/starterPlan';
import { OnboardingHeading, ONBOARDING_FLOW_TOP_CLASS, ONBOARDING_SPLIT_STEP_CLASS } from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';
import { hapticSelect } from '@/lib/haptics';

type AboutOption = {
  id: string;
  label: string;
  icon?: string;
};

export type ProfileSectionId = 'you' | 'energy' | 'life' | 'areas';

export type ProfileQuestion = {
  id: string;
  title: string;
  subtitle?: string;
  section: ProfileSectionId;
  multiSelect?: boolean;
  options: AboutOption[];
  plainOption?: { id: string; label: string };
};

const ABOUT_QUESTIONS: ProfileQuestion[] = [
  {
    id: 'age',
    title: 'How old are you?',
    subtitle: 'This helps us personalize your experience',
    section: 'you',
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
    section: 'you',
    options: [
      { id: 'male', label: 'Male', icon: '💙' },
      { id: 'female', label: 'Female', icon: '💗' },
      { id: 'non-binary', label: 'Non-binary', icon: '💛' },
    ],
    plainOption: { id: 'prefer-not', label: 'Prefer not to answer' },
  },
  {
    id: 'usedBefore',
    title: 'Have you used Frogress before?',
    section: 'you',
    options: [
      { id: 'first-time', label: 'No, this is my first time!', icon: '🍼' },
      { id: 'starting-fresh', label: "Yes, but I'm starting fresh", icon: '☕' },
    ],
  },
  {
    id: 'sleep',
    title: 'How long do you usually sleep at night?',
    section: 'energy',
    options: [
      { id: 'under-5', label: 'Less than 5 hours', icon: '😴' },
      { id: '5-7', label: '5-7 hours', icon: '🛏️' },
      { id: '7-9', label: '7-9 hours', icon: '🌙' },
      { id: 'over-9', label: 'More than 9 hours', icon: '🌞' },
    ],
  },
  {
    id: 'activity',
    title: 'How active are you during the day?',
    section: 'energy',
    options: [
      { id: 'on-the-move', label: "I'm on the move most of the day", icon: '🏃' },
      { id: 'balanced', label: 'I mix sitting with some movement', icon: '🚶' },
      { id: 'sitting', label: 'I sit a lot and want to move more', icon: '💺' },
      { id: 'limited', label: 'I have conditions that limit my movement', icon: '🌻' },
    ],
  },
  {
    id: 'overwhelm',
    title: 'How often do you feel overwhelmed?',
    section: 'life',
    options: [
      { id: 'weekly', label: 'Several times a week', icon: '😫' },
      { id: 'monthly', label: 'A few stressful days a month', icon: '😕' },
      { id: 'rarely', label: 'Rarely, I handle stress pretty well', icon: '😌' },
    ],
  },
  {
    id: 'support',
    title: 'How many people can you lean on when things get tough?',
    section: 'life',
    options: [
      { id: '3-plus', label: '3 or more', icon: '🌳' },
      { id: '2', label: '2', icon: '🌿' },
      { id: '1', label: '1', icon: '🌱' },
      { id: 'just-me', label: 'Just me', icon: '🍃' },
    ],
  },
];

const FOCUS_AREAS_QUESTION_ID = 'focusAreas';

const SECTION_LABELS: Record<ProfileSectionId, string> = {
  you: 'About you',
  energy: 'Energy & activity',
  life: "How's life",
  areas: 'Support areas',
};

export const PROFILE_PROGRESS_UNITS = ABOUT_QUESTIONS.length + 1 + STARTER_BARRIER_FOLLOW_UPS;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const FOCUS_AREAS_URL = '/api/onboarding/categories';

type FocusAreaCategory = MacroCategoryDefinition & {
  barriers?: StarterBarrierPrompt | null;
  support?: { emoji: string; label: string };
};

export function useProfileQuestions(selections: Record<string, string[]>, enabled = true) {
  const { data } = useSWR<{ macroCategories?: FocusAreaCategory[] }>(
    enabled ? FOCUS_AREAS_URL : null,
    fetcher,
  );
  const categories = useMemo(() => data?.macroCategories ?? [], [data]);
  const picked = selections[FOCUS_AREAS_QUESTION_ID];

  const questions = useMemo(() => {
    const focusAreasQuestion: ProfileQuestion = {
      id: FOCUS_AREAS_QUESTION_ID,
      title: 'What areas would you like support with?',
      subtitle: 'Pick as many as you like',
      section: 'areas',
      multiSelect: true,
      options: categories.map((c) => ({
        id: c.id,
        label: c.support?.label || c.name,
        icon: c.support?.emoji || '✨',
      })),
    };
    const byId = new Map(categories.map((c) => [c.id, c]));
    const followUps = (picked ?? [])
      .map((id) => byId.get(id))
      .filter((c): c is FocusAreaCategory & { barriers: StarterBarrierPrompt } => !!c?.barriers)
      .slice(0, STARTER_BARRIER_FOLLOW_UPS)
      .map(
        (c): ProfileQuestion => ({
          id: barrierQuestionId(c.id),
          title: c.barriers.title,
          subtitle: 'Pick all that apply',
          section: 'areas',
          multiSelect: true,
          options: c.barriers.options.map((o) => ({ id: o.id, label: o.label, icon: o.emoji })),
          plainOption: { id: 'other', label: 'Something else' },
        }),
      );
    return [...ABOUT_QUESTIONS, focusAreasQuestion, ...followUps];
  }, [categories, picked]);

  return { questions, categories };
}

export function preloadFocusAreas() {
  preload(FOCUS_AREAS_URL, fetcher).catch(() => {});
}

type Props = OnboardingStepProps & {
  subStep: number;
  onSubStepChange: (index: number) => void;
};

export default function ProfileQuestionsStep({
  selections,
  onSelect,
  onNext,
  saving,
  direction,
  subStep,
  onSubStepChange,
}: Props) {
  const { questions: displayedQuestions } = useProfileQuestions(selections);
  const questionIndex = Math.min(subStep, displayedQuestions.length - 1);
  const currentQuestion = displayedQuestions[questionIndex];
  const selectedValues = selections[currentQuestion.id] ?? [];
  const selected = selectedValues[0];
  const plainId = currentQuestion.plainOption?.id;
  const pickedCount = selectedValues.filter((id) => id !== plainId).length;
  const compactGrid =
    !currentQuestion.multiSelect &&
    currentQuestion.options.length > 4 &&
    currentQuestion.options.every((o) => !o.icon);

  const advanceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    };
  }, [questionIndex]);

  const advance = () => {
    if (questionIndex < displayedQuestions.length - 1) {
      onSubStepChange(questionIndex + 1);
    } else {
      onNext();
    }
  };

  const advanceSoon = () => {
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      advance();
    }, 240);
  };

  const chooseOption = (id: string) => {
    hapticSelect();
    if (currentQuestion.multiSelect) {
      if (plainId && selectedValues.includes(plainId)) onSelect(currentQuestion.id, '__clear__');
      onSelect(currentQuestion.id, id, true);
      return;
    }
    if (advanceTimerRef.current !== null) return;
    onSelect(currentQuestion.id, id);
    advanceSoon();
  };

  const choosePlainOption = (id: string) => {
    hapticSelect();
    if (advanceTimerRef.current !== null) return;
    onSelect(currentQuestion.id, id);
    advanceSoon();
  };

  const handleMultiSelectNext = () => {
    if (pickedCount === 0) return;
    advance();
  };

  return (
    <div className={cn('flex flex-1 flex-col', ONBOARDING_SPLIT_STEP_CLASS)}>
      <div className={cn('relative z-20 flex flex-col', ONBOARDING_FLOW_TOP_CLASS)}>
        <OnboardingHeading
          eyebrow={SECTION_LABELS[currentQuestion.section]}
          title={currentQuestion.title}
          subtitle={currentQuestion.subtitle}
        />
        <motion.div
          key={currentQuestion.id}
          custom={direction}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center"
        >
          <div className="mt-5 flex w-[calc(100%+2rem)] max-w-[calc(100vw-2rem)] flex-col gap-2.5 pb-6 md:mx-auto md:w-full md:max-w-md">
            <div className={compactGrid ? 'grid grid-cols-2 gap-2.5' : 'contents'}>
              {currentQuestion.options.map((option, optionIndex) => {
                const isSelected = currentQuestion.multiSelect
                  ? selectedValues.includes(option.id)
                  : selected === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => chooseOption(option.id)}
                    disabled={saving}
                    className={cn(
                      'relative rounded-2xl border-2 bg-card text-foreground shadow-[0_3px_0_0_rgba(0,0,0,0.06)] transition-all duration-150 [-webkit-tap-highlight-color:transparent] active:translate-y-[2px] active:shadow-none',
                      option.icon
                        ? 'flex min-h-[62px] items-center gap-3.5 py-2 pl-4 pr-3 text-left text-[15.5px] font-extrabold leading-snug md:min-h-[56px]'
                        : 'h-[62px] text-base font-black md:h-[56px]',
                      compactGrid &&
                        optionIndex === currentQuestion.options.length - 1 &&
                        currentQuestion.options.length % 2 === 1 &&
                        'col-span-2',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary shadow-none'
                        : 'border-border/60 [@media(hover:hover)]:hover:border-primary/40',
                      saving && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    {option.icon ? (
                      <>
                        <span
                          aria-hidden
                          className="grid h-10 w-10 shrink-0 place-items-center text-[28px] leading-none"
                        >
                          {option.icon}
                        </span>
                        <span className="flex-1">{option.label}</span>
                        {currentQuestion.multiSelect && (
                          <span
                            aria-hidden
                            className={cn(
                              'grid h-9 w-9 shrink-0 place-items-center rounded-full text-2xl font-semibold leading-none transition-colors',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {isSelected ? '−' : '+'}
                          </span>
                        )}
                      </>
                    ) : (
                      option.label
                    )}
                  </button>
                );
              })}
            </div>
            {currentQuestion.plainOption && (
              <button
                type="button"
                onClick={() => choosePlainOption(currentQuestion.plainOption!.id)}
                disabled={saving}
                className={cn(
                  'mt-4 h-12 text-base font-black text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]',
                  saving && 'cursor-not-allowed opacity-70',
                )}
              >
                {currentQuestion.plainOption.label}
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {currentQuestion.multiSelect && (
        <>
          <div className="flex-1 lg:max-h-2" />
          <OnboardingFooter>
            <OnboardingButton onClick={handleMultiSelectNext} disabled={pickedCount === 0} loading={saving}>
              {pickedCount > 0 ? `Continue · ${pickedCount} picked` : 'Pick at least one'}
            </OnboardingButton>
          </OnboardingFooter>
        </>
      )}
    </div>
  );
}
