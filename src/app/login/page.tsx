'use client';

import { sendSignInLinkToEmail, type AuthCredential } from 'firebase/auth';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/firebase';
import {
  GoogleAccountExistsError,
  getGoogleAuthErrorMessage,
  initNativeGoogleSignIn,
  signInWithExistingGoogle,
  signInWithGoogle,
} from '@/lib/googleAuth';
import { AccountConflictDialog } from '@/components/auth/AccountConflictDialog';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { establishSessionCookie } from '@/lib/authCookie';
import { createEmailLinkSettings } from '@/lib/emailLinkSettings';
import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import {
  motion,
  AnimatePresence,
  useAnimationControls,
  useReducedMotion,
} from 'framer-motion';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Frog, {
  FROG_TONGUE_MOUTH_OFFSET,
  FROG_TONGUE_MOUTH_OFFSET_TABLET,
  FROG_TONGUE_MOUTH_OFFSET_DESKTOP,
  type FrogHandle,
} from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useAuth } from '@/components/auth/AuthContext';

const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });

const FLY_PX = 40;
const FLY_KEY = 'login-fly';
const LOGIN_TONGUE_MS = 1040;
const FLY_RESPAWN_DELAY_MS = 1500;
const FLY_BUZZ_START = { x: -56, y: 0, rotate: -6 } as const;
const FLY_BUZZ = {
  x: [FLY_BUZZ_START.x, 56, -38, 48, FLY_BUZZ_START.x],
  y: [FLY_BUZZ_START.y, -18, 6, -10, FLY_BUZZ_START.y],
  rotate: [FLY_BUZZ_START.rotate, 6, -4, 8, FLY_BUZZ_START.rotate],
  transition: { duration: 6, ease: 'easeInOut', repeat: Infinity },
} as const;

type Step = 'enter' | 'email-sent';
type FlyState = 'buzzing' | 'hidden' | 'entering';

const slide = {
  enter: (dir: number) => ({ x: dir * 50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -50, opacity: 0 }),
};

const ENTER_CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
} as const;

const ENTER_ITEM = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

const ENTER_FROG = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 220, damping: 17 },
  },
} as const;

const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';
const POST_LOGIN_ROUTE_KEY = 'frogress.post-login-route';

function LoginPageInner() {
  const searchParams = useSearchParams();
  const { user: authUser } = useAuth();
  const { showNotification } = useNotification();
  const reduceMotion = useReducedMotion();
  const navigatedRef = useRef(false);
  const isUpgrade = searchParams?.get('upgrade') === '1';
  const requestedNext = searchParams?.get('next');
  const postLoginRoute =
    requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/';
  const [step, setStep] = useState<Step>('enter');
  const [dir, setDir] = useState(1);

  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [conflict, setConflict] = useState<{
    credential: AuthCredential | null;
  } | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);
  const isTablet = useMediaQuery('(min-width: 768px)');
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const tongueMouthOffset = isDesktop
    ? FROG_TONGUE_MOUTH_OFFSET_DESKTOP
    : isTablet
      ? FROG_TONGUE_MOUTH_OFFSET_TABLET
      : FROG_TONGUE_MOUTH_OFFSET;

  const emailRef = useRef<HTMLInputElement>(null);

  // ── Frog tongue grab (mirrors the home task-list catch) ──
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const flyControls = useAnimationControls();
  const flyRespawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flyState, setFlyState] = useState<FlyState>('buzzing');
  const {
    vp,
    grab,
    tipGroupEl,
    tonguePathEl,
    worldGroupEl,
    fxGroupEl,
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs,
    trackMovingTarget: true,
    durationMs: LOGIN_TONGUE_MS,
    keepTargetHiddenUntilPersist: true,
  });

  // Start or resume buzzing after the fly is rendered in its buzzing state.
  useEffect(() => {
    if (flyState === 'buzzing') {
      void flyControls.start(FLY_BUZZ as any);
    }
  }, [flyControls, flyState]);

  useEffect(() => {
    return () => {
      if (flyRespawnTimerRef.current) {
        clearTimeout(flyRespawnTimerRef.current);
      }
    };
  }, []);

  const flyCaught = visuallyDone.has(FLY_KEY);

  const respawnFly = () => {
    flyControls.stop();
    setFlyState('hidden');
    if (flyRespawnTimerRef.current) {
      clearTimeout(flyRespawnTimerRef.current);
    }
    flyRespawnTimerRef.current = setTimeout(() => {
      setFlyState('entering');
      flyRespawnTimerRef.current = null;
    }, FLY_RESPAWN_DELAY_MS);
  };

  useEffect(() => {
    void initNativeGoogleSignIn().catch(() => {
      // The button action retries initialization and surfaces a friendly error.
    });
  }, []);

  const prepareSignedInRoute = async (route = '/') => {
    const user = auth.currentUser;
    if (!user) throw new Error('Authentication did not complete');
    await establishSessionCookie(user);
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return data?.isNewUser ? '/onboarding' : route;
  };

  const navigateOnce = (route: string) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // Authentication changes both Firebase client state and the server cookie.
    // A document navigation guarantees the next render sees both, avoiding a
    // stale App Router tree after logout/login inside the Capacitor webview.
    window.location.replace(route);
  };

  // Safety net: signInWithPopup's promise can hang in the opener even though
  // the sign-in succeeded (AuthContext still gets the user and the session
  // cookie). If a signed-in, non-anonymous user is somehow still parked on
  // this page, route them out instead of waiting for a manual refresh.
  useEffect(() => {
    if (!authUser || authUser.isAnonymous || navigatedRef.current) return;
    const timer = setTimeout(async () => {
      if (navigatedRef.current) return;
      try {
        navigateOnce(await prepareSignedInRoute(postLoginRoute));
      } catch {
        navigateOnce('/');
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const current = auth.currentUser;
      const shouldLink = isUpgrade && current?.isAnonymous;
      await signInWithGoogle({ linkTo: shouldLink ? current : null });
      const route = await prepareSignedInRoute(postLoginRoute);
      // The decorative tongue animation uses requestAnimationFrame, which can
      // pause around a native Google popup. Never gate authentication on it.
      navigateOnce(route);
    } catch (err: any) {
      if (err instanceof GoogleAccountExistsError) {
        setConflict({ credential: err.credential });
      } else {
        showNotification(getGoogleAuthErrorMessage(err), undefined, {
          durationMs: 5000,
        });
      }
      setLoading(false);
    }
  };

  const handleSwitchToExisting = async () => {
    if (!conflict || switching) return;
    setSwitching(true);
    try {
      await signInWithExistingGoogle(conflict.credential);
      const route = await prepareSignedInRoute(postLoginRoute);
      navigateOnce(route);
    } catch (err: any) {
      setConflict(null);
      setSwitching(false);
      showNotification(getGoogleAuthErrorMessage(err), undefined, {
        durationMs: 5000,
      });
    }
  };

  const handleSendEmailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);

    await triggerTongue({
      key: FLY_KEY,
      completed: false,
      onPersist: async () => {
        try {
          const origin =
            typeof window !== 'undefined' ? window.location.origin : '';
          await sendSignInLinkToEmail(
            auth,
            trimmed,
            createEmailLinkSettings(`${origin}/auth/email-callback`),
          );
          window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, trimmed);
          window.localStorage.setItem(POST_LOGIN_ROUTE_KEY, postLoginRoute);
          setDir(1);
          setStep('email-sent');
          setResendIn(30);
        } catch (err: any) {
          showNotification(err?.message || 'Could not send email link');
          respawnFly();
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const back = () => {
    setDir(-1);
    setStep('enter');
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      await sendSignInLinkToEmail(
        auth,
        email.trim(),
        createEmailLinkSettings(`${origin}/auth/email-callback`),
      );
      setResendIn(30);
    } catch (err: any) {
      showNotification(err?.message || 'Could not resend the link');
    }
  };

  return (
    <main className="fixed inset-0 flex flex-col items-center overflow-x-hidden overflow-y-auto bg-background px-6 py-10">
      <motion.div
        variants={ENTER_CONTAINER}
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
        className="my-auto flex w-full max-w-sm shrink-0 origin-center flex-col items-center md:scale-110 xl:scale-125"
      >
        {/* Frogress wordmark — curved, matching the loading screen */}
        <motion.div variants={ENTER_ITEM}>
          <svg
            aria-label="Frogress"
            role="img"
            viewBox="0 0 220 34"
            className="mb-2 h-12 w-[300px] overflow-visible text-foreground"
          >
            <path id="login-brand-arc" d="M 36 22 Q 110 6 184 22" fill="none" />
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
              <textPath href="#login-brand-arc" startOffset="50%">
                Frogress
              </textPath>
            </text>
          </svg>
        </motion.div>

        {/* Frog mascot — sits on top of the email input, fly buzzing above. No container. */}
        <motion.div variants={ENTER_FROG} className="relative z-10 w-full">
        <div className="pointer-events-none relative z-10 flex w-full translate-y-[11px] flex-col items-center">
          {!flyCaught && flyState !== 'hidden' && (
            <motion.div
              aria-hidden
              className="absolute left-1/2 z-10 -translate-x-1/2"
              style={{ top: '-6%' }}
              initial={
                flyState === 'entering'
                  ? { x: '55vw', y: -16, rotate: 12 }
                  : false
              }
              animate={
                flyState === 'entering'
                  ? FLY_BUZZ_START
                  : flyControls
              }
              transition={
                flyState === 'entering'
                  ? { duration: 0.75, ease: [0.22, 1, 0.36, 1] }
                  : undefined
              }
              onAnimationComplete={() => {
                if (flyState !== 'entering') return;
                setFlyState('buzzing');
              }}
            >
              <div
                ref={(el) => {
                  flyRefs.current[FLY_KEY] = el;
                }}
              >
                <Fly size={38} interactive={false} />
              </div>
            </motion.div>
          )}
          <div ref={frogBoxRef}>
            <Frog
              ref={frogRef}
              mouthOpen={!!grab}
              mouthOffset={tongueMouthOffset}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>
        </div>
        </motion.div>

        {isUpgrade && (
          <motion.div
            variants={ENTER_ITEM}
            className="mt-5 w-full rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-center shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10"
          >
            <p className="text-sm font-black text-amber-900 dark:text-amber-200">
              You&apos;re in Guest Mode
            </p>
            <p className="mt-0.5 text-xs font-medium text-amber-800/90 dark:text-amber-100/80">
              Create an account to save your progress — your pet and data will be kept.
            </p>
          </motion.div>
        )}

        {/* Step content */}
        <motion.div variants={ENTER_ITEM} className="relative z-0 w-full">
          <AnimatePresence mode="wait" custom={dir}>
            {step === 'enter' && (
              <motion.div
                key="enter"
                custom={dir}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  onClick={handleGoogle}
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card/60 text-sm font-bold tracking-wide transition-all hover:bg-muted/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <GoogleIcon /> Continue with Google
                    </>
                  )}
                </button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 font-bold tracking-widest text-muted-foreground">
                      Or
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSendEmailLink} className="space-y-3">
                  <Input
                    ref={emailRef}
                    id="email"
                    type="email"
                    aria-label="Email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-2xl border-border/60 bg-card/60 px-4 text-base focus-visible:ring-primary/30"
                    required
                  />
                  <button
                    type="submit"
                    disabled={!email.trim() || loading}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Continue with email <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'email-sent' && (
              <motion.div
                key="emailsent"
                custom={dir}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center pt-8 text-center"
              >
                <h1 className="text-xl font-black uppercase tracking-tight text-foreground">
                  Check your email
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  We sent a sign-in link to
                  <br />
                  <span className="font-bold text-foreground">{email}</span>
                </p>
                <button
                  onClick={handleResend}
                  disabled={resendIn > 0}
                  className="mt-6 text-xs font-bold tracking-wide text-primary hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
                >
                  {resendIn > 0 ? `Resend link in ${resendIn}s` : 'Resend link'}
                </button>
                <button
                  onClick={back}
                  className="mt-3 text-xs font-bold tracking-wide text-primary hover:underline"
                >
                  Use a different email
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.p
          variants={ENTER_ITEM}
          className="mt-8 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          No frog yet?{' '}
          <Link
            href="/welcome"
            className="ml-1 text-primary decoration-2 underline-offset-4 hover:underline"
          >
            Adopt one
          </Link>
        </motion.p>
      </motion.div>

      <AccountConflictDialog
        open={!!conflict}
        busy={switching}
        title="You already have a frog!"
        message="That Google account is already connected to a Frogress account. Switch to it? Your guest progress on this device will be left behind."
        confirmLabel="Switch to my account"
        onConfirm={handleSwitchToExisting}
        onCancel={() => setConflict(null)}
      />

      {/* Tongue overlay — driven directly by the RAF loop in useFrogTongue */}
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
            <linearGradient id="login-tongue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>

          <g ref={worldGroupEl}>
            <path
              ref={tonguePathEl}
              d="M0 0 L0 0"
              fill="none"
              stroke="url(#login-tongue-grad)"
              strokeWidth={TONGUE_STROKE}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            <g ref={fxGroupEl} />

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
          </g>
        </svg>
      )}
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary during prerender (Next 16).
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
