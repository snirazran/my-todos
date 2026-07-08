'use client';

import { useMemo } from 'react';
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

export const PROFILE_QUESTION_COUNT = ABOUT_QUESTIONS.length + 1;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
  const questionIndex = subStep;

  const { data: questsData } = useSWR<{ macroCategories?: MacroCategoryDefinition[] }>(
    '/api/onboarding/categories',
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
  const selectedValues = selections[currentQuestion.id] ?? [];
  const selected = selectedValues[0];
  const compactGrid =
    !currentQuestion.multiSelect &&
    currentQuestion.options.length > 4 &&
    currentQuestion.options.every(
      (o) => !o.icon && !o.iconImageUrl && !o.description,
    );

  const chooseOption = (id: string) => {
    if (currentQuestion.multiSelect) {
      onSelect(currentQuestion.id, id, true);
      return;
    }

    onSelect(currentQuestion.id, id);
    window.setTimeout(() => {
      if (questionIndex < displayedQuestions.length - 1) {
        onSubStepChange(questionIndex + 1);
      } else {
        onNext();
      }
    }, 120);
  };

  const handleMultiSelectNext = () => {
    if (selectedValues.length === 0) return;
    if (questionIndex < displayedQuestions.length - 1) {
      onSubStepChange(questionIndex + 1);
      return;
    }
    onNext();
  };

  return (
    <div className="flex-1 flex flex-col">
      <OnboardingFrogHeader
        eyebrow={currentQuestion.sectionLabel}
        title={currentQuestion.title}
        subtitle={currentQuestion.subtitle}
      />

      <div className="relative z-20 flex flex-col pt-[calc(418px+env(safe-area-inset-top))] short:pt-[calc(370px+env(safe-area-inset-top))] md:pt-[404px]">
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
            <div className="flex flex-col gap-3">
              {focusAreaCategories.map((category, index) => {
                const isSelected = selectedValues.includes(category.id);
                return (
                  <motion.button
                    key={category.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => chooseOption(category.id)}
                    disabled={saving}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.06 * index,
                      duration: 0.3,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'flex items-center gap-3 rounded-3xl border-2 bg-background p-2.5 pr-4 text-left shadow-sm transition-colors duration-200',
                      isSelected
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/50 hover:border-primary/30 hover:bg-muted/30',
                      saving && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-2xl short:h-14 short:w-[84px]">
                      {category.coverImageUrl ? (
                        <img
                          src={category.coverImageUrl}
                          alt=""
                          className={cn(
                            'absolute inset-0 h-full w-full object-cover transition-transform duration-300',
                            isSelected && 'scale-110',
                          )}
                        />
                      ) : (
                        <span
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(135deg, ${category.backgroundFrom}, ${category.backgroundTo})`,
                          }}
                        />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-base font-black leading-tight tracking-tight',
                          isSelected ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {category.name}
                      </span>
                      {category.onboardingSentence?.trim() ? (
                        <span
                          className={cn(
                            'mt-0.5 block truncate text-sm font-medium',
                            isSelected ? 'text-primary/75' : 'text-muted-foreground',
                          )}
                        >
                          {category.onboardingSentence}
                        </span>
                      ) : null}
                    </span>

                    <span
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-all duration-200',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-transparent',
                      )}
                      aria-hidden
                    >
                      <Check className="h-4 w-4 stroke-[3.5]" />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          ) : (
            <>
              <div className={compactGrid ? 'grid grid-cols-2 gap-2.5' : 'contents'}>
              {currentQuestion.options.map((option, optionIndex) => {
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
                  compactGrid &&
                    optionIndex === currentQuestion.options.length - 1 &&
                    currentQuestion.options.length % 2 === 1 &&
                    'col-span-2',
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
              </div>
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
          <div className="sticky bottom-0 z-30 mt-1 flex w-[calc(100%+2rem)] max-w-[calc(100vw-2rem)] justify-center bg-gradient-to-t from-background via-background/90 to-transparent pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 md:mx-auto md:w-full md:max-w-md">
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
