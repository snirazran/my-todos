'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { mutate, preload } from 'swr';
import { format } from 'date-fns';
import type { OnboardingStepProps } from './steps/types';
import AdoptFrogStep, { KEYBOARD_EASE } from './steps/AdoptFrogStep';
import HumanNameStep from './steps/HumanNameStep';
import NotificationStep from './steps/NotificationStep';
import AboutIntroStep from './steps/AboutIntroStep';
import TraitStep from './steps/TraitStep';
import ProfileQuestionsStep, {
  PROFILE_PROGRESS_UNITS,
  preloadFocusAreas,
  useProfileQuestions,
} from './steps/ProfileQuestionsStep';
import CreateAccountStep from './steps/CreateAccountStep';
import StarterPlanStep, {
  preloadStarterPlan,
  starterPlanParams,
  starterPlanUrl,
} from './steps/StarterPlanStep';
import CelebrationStep from './steps/CelebrationStep';
import PlusStep from './steps/PlusStep';
import { OnboardingTopBar } from './steps/OnboardingTopBar';
import {
  OnboardingFrogStage,
  OnboardingProgressDock,
  ONBOARDING_FROG_WIDE_POSITION_CLASS,
  ONBOARDING_SPLIT_BAR_CLASS,
  ONBOARDING_SPLIT_CONTAINER_CLASS,
  SCENE_GLIDE_TRANSITION,
  type FrogPose,
} from './steps/OnboardingFrogHeader';
import { cn } from '@/lib/utils';
import type { FrogEmote, FrogHandle } from '@/components/ui/frog';
import { pickEmote } from '@/lib/frogEmotes';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { clearSessionCookie, establishSessionCookie } from '@/lib/authCookie';
import { OnboardingBackground } from '@/components/ui/OnboardingBackground';
import { resetBootstrapCache } from '@/lib/bootstrapFetcher';
import { useAuth } from '@/components/auth/AuthContext';
import { primeWardrobeIndicesCache, useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { findStarterSkin } from '@/lib/skins/starterSkins';
import { prewarmStreakCheckIn } from '@/hooks/useLoginStreak';
import { todayTasksKey } from '@/hooks/useTaskData';
import { preloadBackgrounds } from '@/hooks/useBackgrounds';
import { markFirstRunPending } from '@/hooks/useFirstRun';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { BARRIER_QUESTION_PREFIX } from '@/lib/quests/starterPlan';
import { useAutoPopupHold } from '@/lib/popupGate';
// Answers are drafted before sign-in, so they're persisted locally to survive the
// email magic-link round trip (which reloads onto a fresh /onboarding). They are
// dropped the moment the flow lands on an account that already finished onboarding.
import {
  clearOnboardingDraft,
  saveOnboardingDraft,
  takeOnboardingDraft,
} from '@/lib/onboardingDraft';

const STEP_IDS = [
  'name',
  'trait',
  'humanName',
  'aboutIntro',
  'age',
  'notifications',
  'createAccount',
  'plan',
] as const;

type StepId = (typeof STEP_IDS)[number];

const STEP_UNITS: Record<StepId, number> = {
  name: 2,
  trait: 2,
  humanName: 1,
  aboutIntro: 1,
  age: PROFILE_PROGRESS_UNITS,
  notifications: 1,
  createAccount: 1,
  plan: 1,
};

const STEP_ANALYTICS_INDEX: Record<StepId, number> = {
  name: 0,
  trait: 0.5,
  humanName: 1,
  aboutIntro: 2,
  age: 3,
  notifications: 4,
  createAccount: 5,
  plan: 6,
};

const CELEBRATION_MS = 3000;

const STEP_ENTRY_EMOTES: Partial<Record<StepId, FrogEmote>> = {
  trait: 'question',
  humanName: 'loveShy',
  aboutIntro: 'hop',
  notifications: 'question',
  createAccount: 'loveHeartbeat',
  plan: 'hop',
};
const STEP_ENTRY_DELAY_MS = 380;
const FREE_TEXT_ANSWERS = new Set(['humanName', 'frogName', 'frogSkin', 'starterPlan', 'starterPlanChoice']);

export default function OnboardingPage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();
  const hasAccount = !!authUser && !authUser.isAnonymous;
  const { indices: wardrobeIndices } = useWardrobeIndices(hasAccount);
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState(1);
  const [subStep, setSubStep] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationReady, setCelebrationReady] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [frogPose, setFrogPose] = useState<FrogPose | null>(null);
  const [giftOpened, setGiftOpened] = useState(false);
  const starterSkin = findStarterSkin(selections.frogSkin?.[0]);
  const starterSkinIndex = starterSkin.riveIndex;
  const stageIndices = useMemo(() => {
    if (hasAccount) {
      return starterSkinIndex ? { ...wardrobeIndices, skin: starterSkinIndex } : wardrobeIndices;
    }
    return starterSkinIndex
      ? { skin: starterSkinIndex, hat: 0, body: 0, hand_item: 0 }
      : undefined;
  }, [hasAccount, wardrobeIndices, starterSkinIndex]);
  const mainRef = useRef<HTMLElement | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  useAutoPopupHold('onboarding-celebration', celebrating);
  const arrivalCheckedRef = useRef(false);
  const [arrivedWithAccount, setArrivedWithAccount] = useState(
    () => !!auth?.currentUser && !auth.currentUser.isAnonymous,
  );

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [step, subStep]);

  useLayoutEffect(() => {
    const draft = takeOnboardingDraft();
    if (Object.keys(draft).length) setSelections((prev) => ({ ...draft, ...prev }));
  }, []);

  // Keep the local copy in sync so it can be restored after the magic-link reload.
  useEffect(() => {
    saveOnboardingDraft(selections);
  }, [selections]);

  // Arriving on /onboarding with an account that already finished the flow must
  // bounce home — replaying the draft would overwrite its real name and frog
  // name. Only the arrival state is checked: a sign-in that happens later in the
  // flow is owned by CreateAccountStep, which shows its own "welcome back" step.
  useEffect(() => {
    if (authLoading || arrivalCheckedRef.current) return;
    arrivalCheckedRef.current = true;
    if (!authUser || authUser.isAnonymous) return;
    setArrivedWithAccount(true);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/user');
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (data?.onboardingCompleted !== true) {
          const savedFrogName =
            typeof data?.frogName === 'string' ? data.frogName.trim() : '';
          if (savedFrogName && savedFrogName !== 'Cookie') {
            setSelections((prev) =>
              prev.frogName?.[0] ? prev : { ...prev, frogName: [savedFrogName] },
            );
          }
          return;
        }
        clearOnboardingDraft();
        resetBootstrapCache();
        await mutate('/api/user', data, { revalidate: false });
        router.replace('/');
      } catch {
        // offline or transient — the save-time guard still protects the account
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser, router]);

  const stepIds = useMemo(
    () =>
      STEP_IDS.filter((id) => {
        // Hide the "create account" step only once a real (non-anonymous)
        // account exists — e.g. a magic-link returnee. With no account yet
        // (deferred creation) or an anonymous one, keep offering it.
        if (id === 'createAccount' && arrivedWithAccount) return false;
        return true;
      }),
    [arrivedWithAccount],
  );

  const currentId = stepIds[step] ?? stepIds[stepIds.length - 1];
  const frogRef = useRef<FrogHandle>(null);

  useEffect(() => {
    const emote = STEP_ENTRY_EMOTES[currentId];
    if (!emote || celebrating) return;
    const t = window.setTimeout(() => frogRef.current?.fireEmote(emote), STEP_ENTRY_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [currentId, celebrating]);

  useEffect(() => {
    if (celebrating) frogRef.current?.fireEmote('tada');
  }, [celebrating]);

  useEffect(() => {
    trackAnalyticsEvent('onboarding_step_viewed', {
      step: currentId,
      step_index: STEP_ANALYTICS_INDEX[currentId],
    });
  }, [currentId]);

  useEffect(() => {
    if (currentId === 'humanName') preloadFocusAreas();
  }, [currentId]);

  const starterPlanKey = starterPlanUrl(selections);
  useEffect(() => {
    if (currentId === 'notifications' || currentId === 'createAccount') {
      preloadStarterPlan(starterPlanKey);
    }
  }, [currentId, starterPlanKey]);

  const { questions: profileQuestions } = useProfileQuestions(selections, currentId !== 'name');
  const profileQuestion = currentId === 'age' ? profileQuestions[subStep] : undefined;
  const subScreenName = useMemo(() => {
    if (currentId === 'trait') return subStep > 0 ? 'gained' : null;
    if (currentId !== 'age' || subStep === 0 || !profileQuestion) return null;
    if (!profileQuestion.id.startsWith(BARRIER_QUESTION_PREFIX)) return profileQuestion.id;
    const barrierNumber = profileQuestions
      .slice(0, subStep + 1)
      .filter((q) => q.id.startsWith(BARRIER_QUESTION_PREFIX)).length;
    return `barrier-${barrierNumber}`;
  }, [currentId, subStep, profileQuestion, profileQuestions]);

  useEffect(() => {
    if (!subScreenName) return;
    trackAnalyticsEvent('onboarding_step_viewed', {
      step: `${currentId}/${subScreenName}`,
      step_index: STEP_ANALYTICS_INDEX[currentId] + (currentId === 'trait' ? 0.25 : subStep / 100),
    });
  }, [currentId, subScreenName, subStep]);

  useEffect(() => {
    if (currentId !== 'trait' || subStep === 0) return;
    const t = window.setTimeout(() => frogRef.current?.fireEmote('celebrate'), 200);
    return () => window.clearTimeout(t);
  }, [currentId, subStep]);

  const unitsAt = (index: number) =>
    stepIds.slice(0, index).reduce((sum, id) => sum + STEP_UNITS[id], 0);
  const totalUnits = unitsAt(stepIds.length);
  const doneUnits =
    unitsAt(step) + (currentId === 'age' || currentId === 'trait' ? subStep : 0);
  const goToStep = (next: number, dir: number) => {
    setDirection(dir);
    setSubStep(stepIds[next] === 'age' && dir < 0 ? profileQuestions.length - 1 : 0);
    setStep(next);
  };

  const handleSubStepChange = (index: number) => {
    setDirection(index >= subStep ? 1 : -1);
    setSubStep(index);
  };

  const onSelect = (stepId: string, optionId: string, multiSelect = false) => {
    const answering =
      optionId !== '__clear__' &&
      !FREE_TEXT_ANSWERS.has(stepId) &&
      !(selections[stepId] ?? []).includes(optionId);
    if (answering) frogRef.current?.fireEmote(pickEmote('pick'), { soft: multiSelect });
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
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let offerPlus = true;
      try {
        // Account creation is deferred until onboarding actually completes, so
        // abandoning the flow never leaves a stranded account. If the user
        // hasn't attached an email mid-flow, create the anonymous account now.
        if (!auth?.currentUser) {
          const cred = await signInAnonymously(auth);
          await establishSessionCookie(cred.user);
          await fetch('/api/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone }),
          });
        } else if (!auth.currentUser.isAnonymous) {
          // The session may have switched to a pre-existing account mid-flow (a
          // magic link or Google sign-in resolved in another tab). Saving here
          // would rename that account and its frog, so bail out instead.
          const res = await fetch('/api/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone }),
          });
          const data = await res.json().catch(() => ({}));
          if (data?.alreadyOnboarded) {
            clearOnboardingDraft();
            await finishOnboarding(Promise.resolve());
            return;
          }
        }
      } catch {
        offerPlus = false;
      }

      savePromiseRef.current = saveOnboarding(timezone);
      if (offerPlus) {
        setPaywallOpen(true);
        return;
      }
      await finishOnboarding(savePromiseRef.current);
    }
  };

  const saveOnboarding = async (timezone: string) => {
    const { areas: focusAreaIds, barriers, profile } = starterPlanParams(selections);
    try {
      const starterPlanIds = selections.starterPlan ?? [];
      let starterCategoryTagMap: Array<{ categoryId: string; tagIds: string[] }> = [];
      if (starterPlanIds.length > 0) {
        try {
          const planRes = await fetch('/api/onboarding/starter-plan', {
            signal: AbortSignal.timeout(15000),
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemIds: starterPlanIds,
              selectedCategoryIds: focusAreaIds,
              barriers,
              profile,
              timezone,
            }),
          });
          const planData = await planRes.json().catch(() => null);
          if (Array.isArray(planData?.categoryTagMap)) {
            starterCategoryTagMap = planData.categoryTagMap;
          }
        } catch {}
      }
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
            starterSkin: starterSkin.key,
            frogTrait: selections.frogTrait?.[0] ?? null,
          }),
        }),
        focusAreaIds.length > 0
          ? fetch('/api/quests/onboarding', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                selectedCategoryIds: focusAreaIds,
                categoryTagMap: starterCategoryTagMap,
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
        clearOnboardingDraft();
        resetBootstrapCache();
        if (starterSkinIndex && !hasAccount) {
          primeWardrobeIndicesCache({ skin: starterSkinIndex, hat: 0, body: 0, hand_item: 0 });
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
    }
  };

  const prewarmHome = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const loadJson = (url: string) =>
      fetch(url, { cache: 'no-store' }).then((res) => res.json());
    preload(todayTasksKey(format(new Date(), 'yyyy-MM-dd'), timezone), loadJson).catch(() => {});
    preload('/api/tasks?view=board&day=-1', loadJson).catch(() => {});
    preloadBackgrounds();
  };

  const finishOnboarding = async (pendingSave: Promise<void>) => {
    setCelebrating(true);
    const celebrationStart = Date.now();
    await pendingSave;
    prewarmStreakCheckIn();
    prewarmHome();
    setCelebrationReady(true);
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
    markFirstRunPending();
    await mutate(
      '/api/user/intros',
      (cur: { seenIntros?: Record<string, boolean> } | undefined) => ({
        seenIntros: { ...(cur?.seenIntros ?? {}), firstRun: false },
      }),
      { revalidate: false },
    );
    router.push('/');
  };

  const handleBack = async () => {
    if ((currentId === 'age' || currentId === 'trait') && subStep > 0) {
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
      clearOnboardingDraft();
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

  const split = paywallOpen || celebrating || currentId !== 'name' || giftOpened;
  const planScreen = currentId === 'plan' && !celebrating;
  const nameLift = currentId === 'name' && !celebrating ? (frogPose?.lift ?? 0) : 0;
  const backdropLift: CSSProperties = {
    transform: nameLift ? `translate3d(0, ${-nameLift}px, 0)` : undefined,
    transition: `${KEYBOARD_EASE}, ${SCENE_GLIDE_TRANSITION}`,
  };

  return (
    <main
      ref={mainRef}
      className="fixed inset-0 isolate flex flex-col items-center overflow-y-auto overflow-x-hidden bg-background px-5 pt-4 lg:px-0 lg:pt-0"
    >
      <OnboardingBackground
        style={backdropLift}
        wide={!split}
        className={paywallOpen ? 'hidden lg:block' : undefined}
      />
      {!paywallOpen && (
        <>
          <div
            aria-hidden
            style={backdropLift}
            className="pointer-events-none absolute inset-x-0 bottom-0 top-[calc(252px+env(safe-area-inset-top))] z-[4] bg-[linear-gradient(to_bottom,transparent,hsl(var(--background))_44px)] short:top-[calc(220px+env(safe-area-inset-top))] md:top-[292px] lg:hidden"
          />
          <OnboardingProgressDock
            done={celebrating ? totalUnits : doneUnits}
            total={totalUnits}
            className={cn(
              'z-[5] transition-opacity duration-300',
              currentId === 'name' && !celebrating && 'opacity-0',
              planScreen && 'opacity-0 lg:opacity-100',
            )}
          />
        </>
      )}
      <div
        className={cn(
          'relative z-10 flex w-full max-w-none flex-col md:max-w-lg lg:max-w-xl',
          split && ONBOARDING_SPLIT_CONTAINER_CLASS,
        )}
        style={{ minHeight: '100%' }}
      >
        <OnboardingFrogStage
          indices={stageIndices}
          frogRef={frogRef}
          hidden={paywallOpen || (!celebrating && currentId === 'name' && !frogPose)}
          pose={currentId === 'name' && !celebrating ? frogPose : null}
          emote={currentId === 'age' && !celebrating && !paywallOpen ? 'question' : null}
          positionClassName={split ? undefined : ONBOARDING_FROG_WIDE_POSITION_CLASS}
        />
        {!celebrating && !paywallOpen && currentId !== 'name' && (
          <OnboardingTopBar
            onBack={step === 0 && hasAccount ? undefined : handleBack}
            className={split ? ONBOARDING_SPLIT_BAR_CLASS : undefined}
          />
        )}
        {celebrating ? (
          <CelebrationStep
            humanName={selections.humanName?.[0]?.trim() || null}
            frogName={selections.frogName?.[0]?.trim() || 'Cookie'}
            habitCount={selections.starterPlan?.length ?? 0}
            ready={celebrationReady}
          />
        ) : paywallOpen ? (
          <PlusStep
            frogName={selections.frogName?.[0]?.trim() || 'Cookie'}
            indices={stageIndices}
            onDone={() => {
              setPaywallOpen(false);
              void finishOnboarding(savePromiseRef.current ?? Promise.resolve());
            }}
          />
        ) : (
          <>
            {currentId === 'name' && (
              <AdoptFrogStep
                {...stepProps}
                canGoBack={!hasAccount}
                giftOpened={giftOpened}
                onGiftOpened={() => setGiftOpened(true)}
                onFrogPose={setFrogPose}
                progressTotal={totalUnits}
              />
            )}
            {currentId === 'trait' && (
              <TraitStep {...stepProps} subStep={subStep} onSubStepChange={handleSubStepChange} />
            )}
            {currentId === 'humanName' && <HumanNameStep {...stepProps} />}
            {currentId === 'createAccount' && <CreateAccountStep {...stepProps} />}
            {currentId === 'plan' && <StarterPlanStep {...stepProps} />}
            {currentId === 'notifications' && <NotificationStep {...stepProps} />}
            {currentId === 'aboutIntro' && <AboutIntroStep {...stepProps} />}
            {currentId === 'age' && (
              <ProfileQuestionsStep
                {...stepProps}
                subStep={subStep}
                onSubStepChange={handleSubStepChange}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
