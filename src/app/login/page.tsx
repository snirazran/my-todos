'use client';

import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithCredential,
  linkWithPopup,
  linkWithCredential,
  sendSignInLinkToEmail,
} from 'firebase/auth';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { auth } from '@/lib/firebase';
import { setAuthTokenCookie } from '@/lib/authCookie';
import { createEmailLinkSettings } from '@/lib/emailLinkSettings';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft, ArrowRight, MailCheck } from 'lucide-react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useNotification } from '@/components/providers/NotificationProvider';

const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });

const FLY_PX = 40;
const FLY_KEY = 'login-fly';
const LOGIN_TONGUE_MS = 1040;
const LOGIN_TONGUE_ORIGIN_Y = -9;
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

const GOOGLE_ICON = (
  <svg
    className="w-4 h-4 shrink-0"
    viewBox="0 0 488 512"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill="currentColor"
      d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
    />
  </svg>
);

const slide = {
  enter: (dir: number) => ({ x: dir * 50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -50, opacity: 0 }),
};

const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showNotification } = useNotification();
  const isUpgrade = searchParams?.get('upgrade') === '1';
  const [step, setStep] = useState<Step>('enter');
  const [dir, setDir] = useState(1);

  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(false);

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
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs,
    trackMovingTarget: true,
    durationMs: LOGIN_TONGUE_MS,
    originYOffset: LOGIN_TONGUE_ORIGIN_Y,
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
    if (Capacitor.isNativePlatform()) {
      void SocialLogin.initialize({
        google: {
          webClientId:
            '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com',
          iOSClientId:
            '324868480648-qv2h2spg5jl3mmhek4u6vvefm7k7m0f4.apps.googleusercontent.com',
          iOSServerClientId:
            '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com',
          mode: 'online',
        },
      });
    }
  }, []);

  const prepareSignedInRoute = async (route = '/') => {
    const user = auth.currentUser;
    if (!user) throw new Error('Authentication did not complete');
    const token = await user.getIdToken();
    setAuthTokenCookie(token);
    const res = await fetch('/api/user', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    return data?.isNewUser ? '/onboarding' : route;
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const current = auth.currentUser;
      const shouldLink = isUpgrade && current?.isAnonymous;
      if (Capacitor.isNativePlatform()) {
        const googleUser = await SocialLogin.login({
          provider: 'google',
          options: { scopes: ['email', 'profile'] },
        });
        const idToken =
          googleUser.result.responseType === 'online'
            ? googleUser.result.idToken
            : null;
        if (!idToken) throw new Error('Failed to get Google token');
        const cred = GoogleAuthProvider.credential(idToken);
        if (shouldLink && current) {
          await linkWithCredential(current, cred);
        } else {
          await signInWithCredential(auth, cred);
        }
      } else {
        const provider = new GoogleAuthProvider();
        if (shouldLink && current) {
          await linkWithPopup(current, provider);
        } else {
          await signInWithPopup(auth, provider);
        }
      }
      const route = await prepareSignedInRoute();
      await triggerTongue({
        key: FLY_KEY,
        completed: false,
        onPersist: () => {
          // Keep the fly hidden after the catch and let it re-enter with a
          // delay (matches the error flow) instead of snapping back instantly.
          respawnFly();
          router.push(route);
        },
      });
    } catch (err: any) {
      const map: Record<string, string> = {
        'auth/credential-already-in-use':
          'That Google account is already linked to another user.',
        'auth/email-already-in-use':
          'That email is already linked to another account.',
      };
      showNotification(
        map[err?.code ?? ''] ?? err?.message ?? 'Google sign-in failed',
      );
      setLoading(false);
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
          setDir(1);
          setStep('email-sent');
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

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-background px-6 py-10">
      {/* Back to welcome */}
      <Link
        href="/welcome"
        aria-label="Back"
        className="absolute left-5 top-[calc(1.25rem+env(safe-area-inset-top))] z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground transition hover:bg-muted"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="flex w-full max-w-sm origin-center flex-col items-center md:scale-110 xl:scale-125">
        {/* Frogress wordmark — curved, matching the loading screen */}
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

        {/* Frog mascot — sits on top of the email input, fly buzzing above. No container. */}
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
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>
        </div>

        {isUpgrade && (
          <div className="mt-5 w-full rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-center shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-sm font-black text-amber-900 dark:text-amber-200">
              You&apos;re in Guest Mode
            </p>
            <p className="mt-0.5 text-xs font-medium text-amber-800/90 dark:text-amber-100/80">
              Create an account to save your progress — your pet and data will be kept.
            </p>
          </div>
        )}

        {/* Step content */}
        <div className="w-full">
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
                    autoFocus
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
                        Login <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

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

                <button
                  onClick={handleGoogle}
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card/60 text-sm font-bold tracking-wide transition-all hover:bg-muted/50 active:scale-[0.98]"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>{GOOGLE_ICON} Continue with Google</>
                  )}
                </button>
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
                className="flex flex-col items-center text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <MailCheck className="h-7 w-7" />
                </div>
                <h1 className="mt-4 text-xl font-black uppercase tracking-tight text-foreground">
                  Check your email
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  We sent a sign-in link to
                  <br />
                  <span className="font-bold text-foreground">{email}</span>
                </p>
                <button
                  onClick={back}
                  className="mt-6 text-xs font-bold tracking-wide text-primary hover:underline"
                >
                  Use a different email
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-8 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          No frog yet?{' '}
          <Link
            href="/welcome"
            className="ml-1 text-primary decoration-2 underline-offset-4 hover:underline"
          >
            Adopt one
          </Link>
        </p>
      </div>

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

          <path
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#login-tongue-grad)"
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

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary during prerender (Next 16).
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
