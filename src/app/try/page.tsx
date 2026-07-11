'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Loader2,
  ArrowRight,
  Download,
  CheckCircle2,
  EllipsisVertical,
  Check,
  Circle,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import { auth } from '@/lib/firebase';
import {
  getGoogleAuthErrorMessage,
  initNativeGoogleSignIn,
  signInWithGoogle,
} from '@/lib/googleAuth';
import { establishSessionCookie } from '@/lib/authCookie';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { Icon } from '@/components/ui/Icon';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { FROG_TONGUE_MOUTH_OFFSET, type FrogHandle } from '@/components/ui/frog';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useAuth } from '@/components/auth/AuthContext';
import { GiftRevealOverlay } from '@/components/ui/gift-box/GiftRevealOverlay';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import {
  FUNNEL_GIFT_PENDING_KEY,
  mutateFlyCaches,
} from '@/components/providers/CrossGiftProvider';
import { FUNNEL_GIFT_ITEM_ID } from '@/lib/crossGift';
import { byId } from '@/lib/skins/catalog';
import { detectMobileOS } from '@/lib/appStores';
import { trackGrowthEvent } from '@/lib/growthTrack';
import { DEFAULT_BACKGROUND_IMAGES } from '@/hooks/useBackgrounds';
import { cn } from '@/lib/utils';

const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });

const FLY_PX = 40;
const ACTIVE_TASK_ID = 'demo-water';
const HOUR_MS = 3_600_000;
const MAX_HUNGER_MS = 24 * HOUR_MS;
const HUNGRY_MS = Math.round(MAX_HUNGER_MS * 0.14);
const FED_MS = MAX_HUNGER_MS;
const FUNNEL_PRIZE = byId[FUNNEL_GIFT_ITEM_ID];

const DEMO_DONE_TASKS = [
  'Morning stretch',
  'Reply to Maya',
  'Water the plants',
  'Read 10 pages',
];

type Step = 'demo' | 'gift' | 'save' | 'done';

const DEMO_NUDGES = [
  "I'm starving!\nCatch that fly for me?",
  "That glowing fly —\none tap and it's mine!",
  "Feed me once and\nI'll never forget you 🥺",
];

const EQUIP_NUDGES = [
  "It's yours!\nTry it on!",
  'Can I wear it?\nPlease?',
  "I've never worn\na Legendary before…",
  "One tap on Equip —\nI'll do a happy dance!",
];

const SAVE_NUDGES = [
  'How do I look?',
  "Don't let me disappear\nwhen you leave…",
  "One tap on Google\nand I'm yours forever",
];

export default function TryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>('demo');
  const [taskDone, setTaskDone] = useState(false);
  const [catching, setCatching] = useState(false);
  const [flyBalance, setFlyBalance] = useState(DEMO_DONE_TASKS.length);
  const [hunger, setHunger] = useState(HUNGRY_MS);
  const [speech, setSpeech] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [wearing, setWearing] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const mobileOS = typeof navigator !== 'undefined' ? detectMobileOS() : null;

  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const {
    vp,
    grab,
    tipGroupEl,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs,
    trackMovingTarget: true,
    keepTargetHiddenUntilPersist: true,
  });

  useEffect(() => {
    void initNativeGoogleSignIn().catch(() => {
      // The button action retries initialization and surfaces a friendly error.
    });
    trackGrowthEvent('funnel_view');
  }, []);

  useEffect(() => {
    if (step !== 'demo' || taskDone || catching) return;
    let i = 0;
    const first = setTimeout(() => setSpeech(DEMO_NUDGES[0]), 900);
    const timer = setInterval(() => {
      i = (i + 1) % DEMO_NUDGES.length;
      setSpeech(DEMO_NUDGES[i]);
    }, 5200);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [step, taskDone, catching]);

  useEffect(() => {
    if (step !== 'done') return;
    const timer = setTimeout(() => setSpeech('Take me with you?'), 3400);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (step !== 'save') return;
    const nudges = wearing ? SAVE_NUDGES : EQUIP_NUDGES;
    let i = 0;
    setSpeech(nudges[0]);
    const timer = setInterval(() => {
      i = (i + 1) % nudges.length;
      setSpeech(nudges[i]);
    }, 4200);
    return () => clearInterval(timer);
  }, [step, wearing]);

  useEffect(() => {
    if (step !== 'done' || mobileOS || qrUrl) return;
    void QRCode.toDataURL(`${window.location.origin}/get-app`, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#1c4620', light: '#ffffff' },
    })
      .then(setQrUrl)
      .catch(() => {});
  }, [step, mobileOS, qrUrl]);

  const burstConfetti = () => {
    if (reduceMotion) return;
    void confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.55 },
      colors: ['#4f9149', '#5ca355', '#fbbf24', '#38bdf8'],
    });
  };

  const handleCatch = async () => {
    if (taskDone) return;
    trackGrowthEvent('funnel_task_completed');
    setCatching(true);
    setSpeech(null);
    await triggerTongue({
      key: ACTIVE_TASK_ID,
      completed: false,
      onPersist: () => {
        setTaskDone(true);
        setFlyBalance((b) => b + 1);
        setHunger(FED_MS);
        setSpeech('YUM! Best fly ever 😋');
        try {
          localStorage.setItem(FUNNEL_GIFT_PENDING_KEY, '1');
        } catch {}
        setTimeout(() => {
          setSpeech(null);
          setStep('gift');
        }, 1900);
      },
    });
  };

  const claimReward = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/funnel-gift/claim', { method: 'POST' });
      if (!res.ok) throw new Error('Could not save your reward');
      try {
        localStorage.removeItem(FUNNEL_GIFT_PENDING_KEY);
      } catch {}
      mutateFlyCaches();
      trackGrowthEvent('funnel_gift_claimed', { via: 'inline' });
      if (!wearing) {
        setWearing(true);
        burstConfetti();
      }
      setSpeech('How do I look?');
      setStep('done');
    } catch (err: any) {
      showNotification(err?.message || 'Could not save your reward');
    } finally {
      setClaiming(false);
    }
  };

  const handleRevealClaim = () => {
    trackGrowthEvent('funnel_box_opened');
    if (user) {
      void claimReward();
    } else {
      setStep('save');
    }
  };

  const handleGoogle = async () => {
    if (signingIn) return;
    setSigningIn(true);
    trackGrowthEvent('funnel_signin_started', { method: 'google' });
    try {
      await signInWithGoogle();
      const current = auth.currentUser;
      if (!current) throw new Error('Authentication did not complete');
      await establishSessionCookie(current);
      const res = await fetch('/api/user', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setIsNewUser(!!data?.isNewUser);
      trackGrowthEvent('funnel_signup', { isNewUser: !!data?.isNewUser });
      await claimReward();
    } catch (err: any) {
      showNotification(getGoogleAuthErrorMessage(err), undefined, {
        durationMs: 5000,
      });
    } finally {
      setSigningIn(false);
    }
  };

  const handleTryOn = () => {
    if (wearing) return;
    setWearing(true);
    setSpeech('How do I look?');
    trackGrowthEvent('funnel_try_on');
    burstConfetti();
  };

  const continueOnWeb = () => {
    trackGrowthEvent('funnel_continue_web');
    router.push(isNewUser ? '/onboarding' : '/');
  };

  return (
    <main className="fixed inset-0 z-[100] overflow-y-auto overflow-x-hidden bg-background">
      {/* Pond header — same treatment as the home page background. Slightly
          taller than the frog stack so the sheet's rounded top overlaps it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 top-0 -z-10 h-[calc(460px+env(safe-area-inset-top))] w-full overflow-hidden md:h-[500px]"
      >
        <picture className="block h-full w-full">
          {DEFAULT_BACKGROUND_IMAGES.web && (
            <source
              media="(min-width: 1280px)"
              srcSet={DEFAULT_BACKGROUND_IMAGES.web}
            />
          )}
          {DEFAULT_BACKGROUND_IMAGES.tablet && (
            <source
              media="(min-width: 768px)"
              srcSet={DEFAULT_BACKGROUND_IMAGES.tablet}
            />
          )}
          <img
            src={DEFAULT_BACKGROUND_IMAGES.mobile}
            alt=""
            className="h-full w-full object-cover object-top"
          />
        </picture>
        <div className="absolute inset-0 shadow-[rgba(0,0,0,0.06)_0px_2px_4px_0px_inset,rgba(0,0,0,0.15)_0px_-2px_5px_0px_inset]" />
      </div>

      {/* Fly wallet — floats top-right exactly like the app header overlay */}
      <div className="fixed right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[90] flex items-center gap-2 px-2 py-1">
        <FlyCounter balance={flyBalance} variant="mobile" alwaysCelebrate />
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col px-3 pb-4 pt-[calc(3rem+env(safe-area-inset-top))] md:px-6 md:pt-12">
        {/* Frog + hunger deck; sad mood + fixed speech while the demo runs */}
        <div className="relative z-10">
          <FrogDisplay
            frogRef={frogRef}
            frogBoxRef={frogBoxRef}
            mouthOpen={!!grab}
            mouthOffset={FROG_TONGUE_MOUTH_OFFSET}
            indices={{
              skin: wearing ? (FUNNEL_PRIZE?.riveIndex ?? 0) : 0,
              hat: 0,
              body: 0,
              hand_item: 0,
              mood: taskDone ? 0 : 1,
            }}
            openWardrobe={false}
            onOpenChange={() => {}}
            hunger={hunger}
            maxHunger={MAX_HUNGER_MS}
            animateHunger={false}
            isGuest
            showSpeechBubble={false}
            showActionButtons={false}
            fixedSpeech={speech}
          />
        </div>

        {/* The "sheet" — mirrors home's rounded task area, overlapping the pond */}
        <div className="relative z-20 -mx-3 mt-[14px] flex min-h-[45vh] flex-col gap-2 rounded-t-[24px] bg-background px-1.5 pb-24 pt-5 md:mx-auto md:mt-14 md:w-full md:max-w-2xl md:px-8">
          <AnimatePresence mode="wait">
            {(step === 'demo' || step === 'gift') && (
              <motion.div
                key="demo"
                initial={false}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.25 } }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center px-2 py-1">
                  <div className="flex items-center gap-2 ml-3 md:gap-2.5">
                    <Icon name="planner" className="w-7 h-7 md:w-8 md:h-8" />
                    <span className="text-sm font-black tracking-tight lowercase text-foreground md:text-base">
                      {taskDone
                        ? 'all done for today!'
                        : '1 fly left for today!'}
                    </span>
                  </div>
                </div>

                <div className="w-full overflow-hidden rounded-[18px] border border-border/50 bg-card/40 shadow-sm">
                  <div className="space-y-1.5 p-1.5 md:space-y-2 md:p-2">
                    <DemoTaskRow
                      text="Tap here. That's it. That's the task."
                      done={taskDone}
                      caught={visuallyDone.has(ACTIVE_TASK_ID)}
                      active={!taskDone}
                      onCatch={() => void handleCatch()}
                      flyRef={(el) => {
                        flyRefs.current[ACTIVE_TASK_ID] = el;
                      }}
                      reduceMotion={!!reduceMotion}
                    />

                    {DEMO_DONE_TASKS.map((text) => (
                      <DemoTaskRow key={text} text={text} done />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'save' && (
              <motion.div
                key="save"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.25 } }}
                className="mx-auto flex w-full max-w-sm flex-col gap-3 pt-2"
              >
                <div className="px-1 pt-1 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                    Free account · 10 seconds
                  </p>
                  <h1 className="mt-1.5 text-[22px] font-black leading-tight tracking-tight text-foreground">
                    Keep everything
                    <br />
                    you just earned
                  </h1>
                </div>

                <div className="overflow-hidden rounded-[20px] border-2 border-amber-400/60 bg-card shadow-[0_2px_12px_rgba(251,191,36,0.25)]">
                  <div className="flex items-center gap-3 p-2.5 pr-3">
                    <div className="flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-amber-100 to-amber-50 shadow-inner dark:from-amber-900/50 dark:to-amber-950/40">
                      <FrogSnapshot
                        indices={{ skin: FUNNEL_PRIZE?.riveIndex ?? 3 }}
                        width={58}
                        height={52}
                        visualOffsetY={0}
                        className="h-[52px] w-[58px]"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-black leading-tight text-foreground">
                        {FUNNEL_PRIZE?.name ?? 'Legendary skin'}
                      </p>
                      <span className="mt-1 inline-block rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                        Legendary · Skin
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleTryOn}
                      disabled={wearing}
                      className={cn(
                        'shrink-0 rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-wide transition-all',
                        wearing
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-gradient-to-r from-[#4f9149] via-[#5ca355] to-[#4f9149] bg-[length:200%_100%] animate-[shimmer_2.5s_ease-in-out_infinite] text-primary-foreground shadow-[0_4px_0_0_#34631f] hover:brightness-110 active:translate-y-[3px] active:shadow-none',
                      )}
                    >
                      {wearing ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-4 w-4" strokeWidth={3.5} />
                          Equipped
                        </span>
                      ) : (
                        'Equip'
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-4 border-t border-dashed border-amber-400/40 bg-amber-50/60 px-4 py-2 dark:bg-amber-900/10">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-foreground/75">
                      <Check className="h-3.5 w-3.5 text-primary" strokeWidth={4} />
                      {flyBalance} flies caught
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-foreground/75">
                      <Check className="h-3.5 w-3.5 text-primary" strokeWidth={4} />
                      One very full frog
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleGoogle()}
                  disabled={signingIn}
                  className="mt-1 flex h-[52px] w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card text-[15px] font-black tracking-tight text-card-foreground shadow-[0_4px_0_0_rgba(0,0,0,0.12)] transition-all hover:bg-accent active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signingIn ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <GoogleIcon className="h-5 w-5" />
                      Continue with Google
                    </>
                  )}
                </button>
                <Link
                  href="/login"
                  className="flex h-10 w-full items-center justify-center rounded-2xl text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Use email instead
                </Link>

                <p className="text-center text-[11px] font-bold text-muted-foreground">
                  Free forever · No credit card · Works on phone &amp; web
                </p>

                <p className="text-center text-[11px] leading-relaxed text-muted-foreground/80">
                  By continuing, you agree to our{' '}
                  <Link
                    href="/terms"
                    className="font-semibold text-foreground/70 underline-offset-4 hover:underline"
                  >
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link
                    href="/privacy"
                    className="font-semibold text-foreground/70 underline-offset-4 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                </p>
              </motion.div>
            )}

            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto flex w-full max-w-sm flex-col gap-3 pt-2"
              >
                <div className="px-1 pt-2 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                    That felt good, right?
                  </p>
                  <h1 className="mt-1.5 text-[24px] font-black leading-[1.15] tracking-tight text-foreground">
                    Imagine your
                    <br />
                    <span className="relative inline-block text-primary">
                      whole day
                      <svg
                        aria-hidden
                        viewBox="0 0 120 8"
                        preserveAspectRatio="none"
                        className="absolute -bottom-1 left-0 h-2 w-full text-primary/40"
                      >
                        <path
                          d="M2 6 Q 30 2 60 5 T 118 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>{' '}
                    like this.
                  </h1>
                </div>

                <div className="relative mt-1 px-3">
                  <JourneyStep
                    n={1}
                    title="A real planner under the pond"
                    body="Habits, reminders, your week at a glance — a to-do list you'd use even without the frog."
                  />
                  <JourneyStep
                    n={2}
                    title="Every finished task pays you"
                    body="Flies are currency. Feed your frog, unlock a wardrobe of skins, outfits and backgrounds."
                  />
                  <JourneyStep
                    n={3}
                    title="Coming back is the fun part"
                    body="Daily quests, streaks, tasks with friends — and a frog who's always happy to see you."
                    last
                  />
                </div>

                <div className="relative mt-3 overflow-hidden rounded-[28px] bg-gradient-to-b from-emerald-950 via-emerald-900 to-[#1c4620] text-center shadow-xl shadow-emerald-950/30">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-0 h-48 w-72 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent"
                  />

                  <div className="relative flex items-center justify-center gap-2 px-5 pt-4">
                    <div className="h-32 w-auto aspect-[282/381] shrink-0 -translate-y-2 drop-shadow-[0_0_10px_rgba(52,211,153,0.25)]">
                      <GiftRive className="h-full w-full" color={0} />
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300/90">
                        1 gift waiting
                      </p>
                      <p className="mt-1 text-lg font-black leading-tight text-white">
                        One more gift is
                        <br />
                        waiting in the app
                      </p>
                      <p className="mt-1 text-xs font-semibold text-emerald-100/60">
                        Sign in with the same account and unwrap it on the spot
                      </p>
                    </div>
                  </div>

                  <div className="relative px-5 pb-5 pt-4">
                    {mobileOS ? (
                      <a
                        href="/get-app"
                        onClick={() =>
                          trackGrowthEvent('funnel_store_click', {
                            os: mobileOS,
                          })
                        }
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black uppercase tracking-wider text-emerald-950 shadow-[0_4px_0_0_rgba(0,0,0,0.35)] transition-all hover:brightness-95 active:translate-y-[3px] active:shadow-none"
                      >
                        <Download className="h-4 w-4" strokeWidth={3} />
                        Get the app — it&apos;s free
                      </a>
                    ) : (
                      <div className="flex flex-col items-center gap-2.5">
                        {qrUrl && (
                          <div className="relative rounded-3xl bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={qrUrl}
                              alt="QR code to download the Frogress app"
                              className="h-40 w-40 rounded-xl"
                            />
                            <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white shadow-sm">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src="/frogress-icon.png"
                                alt=""
                                className="h-9 w-9 rounded-xl"
                              />
                            </span>
                          </div>
                        )}
                        <p className="text-xs font-bold text-emerald-100/80">
                          Scan to get the app — free on iPhone &amp; Android
                        </p>
                      </div>
                    )}
                    <p className="mt-2.5 text-[11px] font-semibold text-emerald-100/50">
                      Your frog will be there — already wearing its new skin.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={continueOnWeb}
                  className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Keep going on the web
                  <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-auto flex justify-center pb-2 pt-8">
            <svg
              aria-label="Frogress"
              role="img"
              viewBox="0 0 220 34"
              className="h-9 w-[170px] overflow-visible text-muted-foreground/50"
            >
              <path
                id="try-brand-arc"
                d="M 36 22 Q 110 6 184 22"
                fill="none"
              />
              <text
                fill="currentColor"
                fontSize="20"
                fontWeight="800"
                textAnchor="middle"
                style={{
                  fontFamily:
                    '"Arial Rounded MT Bold", "Avenir Next Rounded", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                <textPath href="#try-brand-arc" startOffset="50%">
                  Frogress
                </textPath>
              </text>
            </svg>
          </div>
        </div>
      </div>

      {step === 'gift' && FUNNEL_PRIZE && (
        <GiftRevealOverlay
          eyebrow="All tasks done!"
          headline="You've earned a gift"
          prize={FUNNEL_PRIZE}
          claiming={claiming}
          onClaim={handleRevealClaim}
          contentClassName="-translate-y-10 md:-translate-y-12"
        />
      )}

      {grab && (
        <svg
          key={grab.startAt}
          className="pointer-events-none fixed inset-0 z-40"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
        >
          <defs>
            <linearGradient id="try-tongue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>

          <path
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#try-tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
            <circle r={10} fill="transparent" />
            <image
              href="/fly.svg"
              x={-FLY_PX / 2}
              y={-FLY_PX / 2}
              width={FLY_PX}
              height={FLY_PX}
            />
          </g>
        </svg>
      )}
    </main>
  );
}

function JourneyStep({
  n,
  title,
  body,
  last = false,
}: {
  n: number;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div className={cn('relative flex gap-3.5', !last && 'pb-6')}>
      {!last && (
        <span
          aria-hidden
          className="absolute bottom-0 left-[15px] top-9 w-0 border-l-2 border-dashed border-primary/30"
        />
      )}
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground shadow-[0_3px_0_0_#34631f]">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[15px] font-black leading-tight text-foreground">
          {title}
        </p>
        <p className="mt-1 text-[13px] font-semibold leading-snug text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  );
}

function DemoTaskRow({
  text,
  done,
  caught = false,
  active = false,
  onCatch,
  flyRef,
  reduceMotion = false,
}: {
  text: string;
  done: boolean;
  caught?: boolean;
  active?: boolean;
  onCatch?: () => void;
  flyRef?: (el: HTMLDivElement | null) => void;
  reduceMotion?: boolean;
}) {
  return (
    <div
      onClick={active ? onCatch : undefined}
      className={cn(
        'relative flex w-full items-center gap-1 rounded-xl border border-border/50 bg-card px-2.5 py-2.5 transition-colors duration-200 md:gap-1 md:px-3.5 md:py-3.5',
        active && 'cursor-pointer border-primary/40',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'relative z-10 -ml-1 flex flex-shrink-0 items-center justify-center self-stretch',
          done ? 'text-muted-foreground/20' : 'text-muted-foreground/40',
        )}
      >
        <EllipsisVertical className="h-4 w-4 md:h-[18px] md:w-[18px]" />
      </div>

      <div
        className={cn(
          'relative z-10 min-w-0 flex-1 transition-opacity duration-200',
          done ? 'opacity-60' : 'opacity-100',
        )}
      >
        <span
          className={cn(
            'text-[15px] font-semibold leading-snug break-words md:text-[17px]',
            done ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {text}
        </span>
      </div>

      <div className="relative z-10 h-11 w-11 flex-shrink-0 md:h-12 md:w-12">
        <AnimatePresence initial={false}>
          {done ? (
            <motion.div
              key="check"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <CheckCircle2 className="h-9 w-9 text-green-500 drop-shadow-sm md:h-10 md:w-10" />
            </motion.div>
          ) : caught ? (
            <motion.div
              key="circle"
              className="absolute inset-0 flex items-center justify-center text-muted-foreground/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Circle className="h-9 w-9 md:h-10 md:w-10" />
            </motion.div>
          ) : (
            <motion.div
              key="fly"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {active && (
                <>
                  <span
                    aria-hidden
                    className="absolute -inset-0.5 rounded-full ring-[3px] ring-amber-400/90 animate-[demo-glow-breathe_2.4s_ease-in-out_infinite]"
                  />
                  {!reduceMotion && (
                    <span
                      aria-hidden
                      className="absolute -inset-0.5 rounded-full ring-[3px] ring-amber-400 animate-[demo-sonar_2.4s_cubic-bezier(0,0,0.2,1)_infinite]"
                    />
                  )}
                </>
              )}
              <div
                ref={flyRef}
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-muted-foreground/10 bg-muted md:h-12 md:w-12"
              >
                <Fly size={40} y={-3} x={0} interactive={false} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
