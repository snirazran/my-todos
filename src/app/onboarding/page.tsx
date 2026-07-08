'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import type { OnboardingStepProps } from './steps/types';
import FrogNameStep from './steps/FrogNameStep';
import HumanNameStep from './steps/HumanNameStep';
import NotificationStep from './steps/NotificationStep';
import AboutIntroStep from './steps/AboutIntroStep';
import ProfileQuestionsStep, { PROFILE_QUESTION_COUNT } from './steps/ProfileQuestionsStep';
import CreateAccountStep from './steps/CreateAccountStep';
import CelebrationStep from './steps/CelebrationStep';
import { OnboardingTopBar } from './steps/OnboardingTopBar';
import { OnboardingFrogStage } from './steps/OnboardingFrogHeader';
import type { FrogEmote } from '@/components/ui/frog';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { clearSessionCookie, establishSessionCookie } from '@/lib/authCookie';
import { OnboardingBackground } from '@/components/ui/OnboardingBackground';
import { useAuth } from '@/components/auth/AuthContext';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';

const STEP_IDS = ['name', 'humanName', 'aboutIntro', 'age', 'notifications', 'createAccount'] as const;

const CELEBRATION_MS = 2600;

const STEP_EMOTES: Partial<Record<(typeof STEP_IDS)[number], FrogEmote>> = {
  humanName: 'love',
  aboutIntro: 'love',
  age: 'question',
};

// Persist answers locally so the frog/human names (collected before sign-in)
// survive the email magic-link round trip, which reloads onto a fresh
// /onboarding. Without this they're lost and the account keeps its default name.
const ONBOARDING_SELECTIONS_KEY = 'onboardingSelections';

function loadStoredSelections(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ONBOARDING_SELECTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string[]>)
      : {};
  } catch {
    return {};
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const hasAccount = !!authUser && !authUser.isAnonymous;
  const { indices: wardrobeIndices } = useWardrobeIndices(hasAccount);
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>(
    loadStoredSelections,
  );
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState(1);
  const [subStep, setSubStep] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [step, subStep]);

  // Keep the local copy in sync so it can be restored after the magic-link reload.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ONBOARDING_SELECTIONS_KEY,
        JSON.stringify(selections),
      );
    } catch {
      // ignore storage failures (private mode, quota)
    }
  }, [selections]);

  const stepIds = useMemo(
    () =>
      STEP_IDS.filter((id) => {
        // Hide the "create account" step only once a real (non-anonymous)
        // account exists — e.g. a magic-link returnee. With no account yet
        // (deferred creation) or an anonymous one, keep offering it.
        if (
          id === 'createAccount' &&
          auth?.currentUser &&
          !auth.currentUser.isAnonymous
        )
          return false;
        return true;
      }),
    [],
  );

  const currentId = stepIds[step] ?? stepIds[stepIds.length - 1];

  const ageIndex = stepIds.indexOf('age');
  const unitsAt = (index: number) =>
    index + (ageIndex !== -1 && index > ageIndex ? PROFILE_QUESTION_COUNT - 1 : 0);
  const totalUnits = unitsAt(stepIds.length);
  const doneUnits = currentId === 'age' ? unitsAt(step) + subStep : unitsAt(step);

  const goToStep = (next: number, dir: number) => {
    setDirection(dir);
    setSubStep(stepIds[next] === 'age' && dir < 0 ? PROFILE_QUESTION_COUNT - 1 : 0);
    setStep(next);
  };

  const handleSubStepChange = (index: number) => {
    setDirection(index >= subStep ? 1 : -1);
    setSubStep(index);
  };

  const onSelect = (stepId: string, optionId: string, multiSelect = false) => {
    setSelections((prev) => {
      const existing = prev[stepId] ?? [];
      if (optionId === '__clear__') {
        if (!(stepId in prev)) return prev;
        const { [stepId]: _removed, ...rest } = prev;
        return rest;
      }
      if (multiSelect) {
        return {
          ...prev,
          [stepId]: existing.includes(optionId)
            ? existing.filter((x) => x !== optionId)
            : [...existing, optionId],
        };
      }
      return { ...prev, [stepId]: [optionId] };
    });
  };

  const handleNext = async () => {
    if (step < stepIds.length - 1) {
      goToStep(step + 1, 1);
    } else {
      setSaving(true);
      setCelebrating(true);
      const celebrationStart = Date.now();
      const focusAreaIds = selections.focusAreas ?? [];
      try {
        // Account creation is deferred until onboarding actually completes, so
        // abandoning the flow never leaves a stranded account. If the user
        // hasn't attached an email mid-flow, create the anonymous account now.
        if (!auth?.currentUser) {
          const cred = await signInAnonymously(auth);
          await establishSessionCookie(cred.user);
          await fetch('/api/user', { method: 'POST' });
        }
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const [onboardingRes] = await Promise.all([
          fetch('/api/onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              frogName: selections.frogName?.[0]?.trim() || 'Cookie',
              humanName: selections.humanName?.[0]?.trim() || null,
              ageRange: selections.age?.[0] ?? null,
              aboutGender: selections.aboutGender?.[0] ?? null,
              usedBefore: selections.usedBefore?.[0] ?? null,
              onboardingResponses: selections,
            }),
          }),
          focusAreaIds.length > 0
            ? fetch('/api/quests/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  selectedCategoryIds: focusAreaIds,
                  categoryTagMap: [],
                  createSuggestions: false,
                  timezone,
                }),
              })
            : Promise.resolve(),
        ]);
        // Only drop the local copy once the names are safely persisted; if the
        // save failed (e.g. not yet authenticated), keep them for the retry after
        // the magic-link sign-in.
        if (onboardingRes.ok) {
          try {
            window.localStorage.removeItem(ONBOARDING_SELECTIONS_KEY);
          } catch {
            // ignore
          }
          await mutate(
            '/api/user',
            (cur: Record<string, unknown> | undefined) =>
              cur ? { ...cur, onboardingCompleted: true } : cur,
            { revalidate: false },
          );
        }
      } catch {
        // best-effort
      } finally {
        const remaining = CELEBRATION_MS - (Date.now() - celebrationStart);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        // Drop any stale quests cache (e.g. a pre-onboarding `complete: false`)
        // so the home page fetches fresh data instead of flashing the focus-areas
        // popup before revalidating.
        await mutate(
          (key) => typeof key === 'string' && key.startsWith('/api/quests'),
          undefined,
          { revalidate: false },
        );
        router.push('/');
      }
    }
  };

  const handleBack = async () => {
    if (currentId === 'age' && subStep > 0) {
      setDirection(-1);
      setSubStep((s) => s - 1);
      return;
    }
    if (step === 0) {
      const current = auth?.currentUser;
      if (current && !current.isAnonymous) return;
      try {
        if (current?.isAnonymous) {
          await current.delete();
        } else {
          await auth?.signOut();
        }
      } catch {
        try {
          await auth?.signOut();
        } catch {}
      }
      await clearSessionCookie();
      router.replace('/welcome');
      return;
    }
    goToStep(step - 1, -1);
  };

  const stepProps: OnboardingStepProps = {
    selections,
    onSelect,
    onNext: handleNext,
    onBack: handleBack,
    saving,
    direction,
  };

  return (
    <main
      ref={mainRef}
      className="fixed inset-0 isolate flex flex-col items-center overflow-y-auto overflow-x-hidden bg-background px-5 pt-4"
    >
      <div className="absolute inset-x-0 top-0 h-[390px] overflow-hidden short:h-[342px] md:h-[352px]">
        <OnboardingBackground />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[286px] z-[5] rounded-t-[24px] bg-background short:top-[238px] md:left-1/2 md:right-auto md:top-[278px] md:w-full md:max-w-lg md:-translate-x-1/2 md:rounded-[24px] lg:max-w-xl"
      />
      <div className="relative z-10 flex w-full max-w-none flex-col md:max-w-lg lg:max-w-xl" style={{ minHeight: '100%' }}>
        <OnboardingFrogStage
          indices={hasAccount ? wardrobeIndices : undefined}
          emote={STEP_EMOTES[currentId] ?? null}
        />
        {!celebrating && (
          <OnboardingTopBar
            onBack={step === 0 && hasAccount ? undefined : handleBack}
            done={doneUnits}
            total={totalUnits}
            rightSlot={
              currentId === 'createAccount' ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={saving}
                  className="flex h-10 shrink-0 items-center rounded-full bg-background/90 px-4 text-sm font-black text-primary shadow-md ring-1 ring-border/40 backdrop-blur transition hover:bg-background disabled:opacity-60"
                >
                  Skip
                </button>
              ) : undefined
            }
          />
        )}
        {currentId === 'name' && <FrogNameStep {...stepProps} />}
        {currentId === 'humanName' && <HumanNameStep {...stepProps} />}
        {currentId === 'createAccount' && <CreateAccountStep {...stepProps} />}
        {currentId === 'notifications' && <NotificationStep {...stepProps} />}
        {currentId === 'aboutIntro' && <AboutIntroStep {...stepProps} />}
        {currentId === 'age' && (
          <ProfileQuestionsStep
            {...stepProps}
            subStep={subStep}
            onSubStepChange={handleSubStepChange}
          />
        )}

      </div>
      {celebrating && (
        <CelebrationStep
          frogName={selections.frogName?.[0]?.trim() || 'Cookie'}
          humanName={selections.humanName?.[0]?.trim() || null}
        />
      )}
    </main>
  );
}
