'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import type { OnboardingStepProps } from './steps/types';
import FrogNameStep from './steps/FrogNameStep';
import HumanNameStep from './steps/HumanNameStep';
import NotificationStep from './steps/NotificationStep';
import AboutIntroStep from './steps/AboutIntroStep';
import ProfileQuestionsStep from './steps/ProfileQuestionsStep';
import CreateAccountStep from './steps/CreateAccountStep';
import { auth } from '@/lib/firebase';
import { clearAuthTokenCookie } from '@/lib/authCookie';
import { OnboardingBackground } from '@/components/ui/OnboardingBackground';

const STEP_IDS = ['name', 'humanName', 'createAccount', 'notifications', 'aboutIntro', 'age'] as const;

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

function isMobileDevice() {
  const userAgent = navigator.userAgent || '';
  const isMobileUserAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(userAgent);
  const isTouchPhoneWidth = navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 768px)').matches;
  return isMobileUserAgent || isTouchPhoneWidth;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>(
    loadStoredSelections,
  );
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState(1);
  const [showNotificationStep, setShowNotificationStep] = useState(false);

  useEffect(() => {
    setShowNotificationStep(isMobileDevice());
  }, []);

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
        if (id === 'notifications' && !showNotificationStep) return false;
        if (id === 'createAccount' && !auth?.currentUser?.isAnonymous) return false;
        return true;
      }),
    [showNotificationStep],
  );

  const currentId = stepIds[step] ?? stepIds[stepIds.length - 1];

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
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      setSaving(true);
      const focusAreaIds = selections.focusAreas ?? [];
      try {
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
        }
      } catch {
        // best-effort
      } finally {
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
    if (step === 0) {
      const current = auth?.currentUser;
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
      clearAuthTokenCookie();
      router.replace('/welcome');
      return;
    }
    setDirection(-1);
    setStep((s) => s - 1);
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
    <main className="fixed inset-0 isolate flex flex-col items-center overflow-y-auto bg-background px-5 pt-4">
      <div className="absolute inset-x-0 top-0 h-[312px] overflow-hidden md:h-[352px]">
        <OnboardingBackground />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[222px] z-[5] rounded-t-[24px] bg-background md:left-1/2 md:right-auto md:top-[278px] md:w-full md:max-w-lg md:-translate-x-1/2 md:rounded-[24px] lg:max-w-xl"
      />
      <div className="relative z-10 flex w-full max-w-none flex-col md:max-w-lg lg:max-w-xl" style={{ minHeight: '100%' }}>
        {currentId === 'name' && <FrogNameStep {...stepProps} />}
        {currentId === 'humanName' && <HumanNameStep {...stepProps} />}
        {currentId === 'createAccount' && <CreateAccountStep {...stepProps} />}
        {currentId === 'notifications' && <NotificationStep {...stepProps} />}
        {currentId === 'aboutIntro' && <AboutIntroStep {...stepProps} />}
        {currentId === 'age' && <ProfileQuestionsStep {...stepProps} />}

      </div>
    </main>
  );
}
