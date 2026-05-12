'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingStepProps } from './steps/types';
import GenderStep from './steps/GenderStep';
import FrogNameStep from './steps/FrogNameStep';
import HumanNameStep from './steps/HumanNameStep';
import NotificationStep from './steps/NotificationStep';
import AboutIntroStep from './steps/AboutIntroStep';
import ProfileQuestionsStep from './steps/ProfileQuestionsStep';
import CreateAccountStep from './steps/CreateAccountStep';
import { auth } from '@/lib/firebase';
import { clearAuthTokenCookie } from '@/lib/authCookie';

const STEP_IDS = ['gender', 'name', 'humanName', 'createAccount', 'notifications', 'aboutIntro', 'age'] as const;

function isMobileDevice() {
  const userAgent = navigator.userAgent || '';
  const isMobileUserAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(userAgent);
  const isTouchPhoneWidth = navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 768px)').matches;
  return isMobileUserAgent || isTouchPhoneWidth;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState(1);
  const [showNotificationStep, setShowNotificationStep] = useState(false);

  useEffect(() => {
    setShowNotificationStep(isMobileDevice());
  }, []);

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
      try {
        await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frogName: selections.frogName?.[0]?.trim() || 'Cookie',
            frogPronouns: selections.gender?.[0] ?? null,
            humanName: selections.humanName?.[0]?.trim() || null,
            ageRange: selections.age?.[0] ?? null,
            aboutGender: selections.aboutGender?.[0] ?? null,
            usedBefore: selections.usedBefore?.[0] ?? null,
            onboardingResponses: selections,
          }),
        });
      } catch {
        // best-effort
      } finally {
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
    <main className="fixed inset-0 flex flex-col items-center bg-background px-5 pt-4 overflow-y-auto">
      <div className="relative z-10 w-full max-w-sm md:max-w-md lg:max-w-lg flex flex-col" style={{ minHeight: '100%' }}>
        {currentId === 'gender' && <GenderStep {...stepProps} />}
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
