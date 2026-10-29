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
import {
  AppleAccountExistsError,
  getAppleAuthErrorMessage,
  initNativeAppleSignIn,
  signInWithApple,
  signInWithExistingApple,
} from '@/lib/appleAuth';
import {
  getPasswordAuthErrorMessage,
  signInWithPassword,
} from '@/lib/passwordAuth';
import { AccountConflictDialog } from '@/components/auth/AccountConflictDialog';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { AppleIcon } from '@/components/ui/AppleIcon';
import { establishSessionCookie } from '@/lib/authCookie';
import {
  createEmailLinkSettings,
  setEmailLinkIntent,
} from '@/lib/emailLinkSettings';
import { describeSignInMethod, lookupAccountByEmail } from '@/lib/accountLookup';
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Loader2, ArrowRight, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
const CATCH_SWALLOW_HOLD_MS = 320;
const CATCH_BAILOUT_MS = 3200;

type Step = 'enter' | 'email-sent';
type FlyState = 'buzzing' | 'hidden' | 'entering';

const slide = {
  enter: (dir: number) => ({ x: dir * 50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -50, opacity: 0 }),
};

const PASSWORD_LOGIN_ENABLED = true;
const EMAIL_LINK_STORAGE_KEY = 'emailForSignIn';
const POST_LOGIN_ROUTE_KEY = 'frogress.post-login-route';

function LoginPageInner() {
  const searchParams = useSearchParams();
  const { user: authUser } = useAuth();
  const { showNotification } = useNotification();
  const navigatedRef = useRef(false);
  const googleFlowRef = useRef(false);
  const isUpgrade = searchParams?.get('upgrade') === '1';
  const requestedNext = searchParams?.get('next');
  const postLoginRoute =
    requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/';
  const [step, setStep] = useState<Step>('enter');
  const [dir, setDir] = useState(1);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [appleFirst, setAppleFirst] = useState(false);
  const showEmailForm = emailOpen || usePassword || email.length > 0;

  useEffect(() => {
    setAppleFirst(Capacitor.getPlatform() === 'ios');
  }, []);

  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [conflict, setConflict] = useState<{
    credential: AuthCredential | null;
    provider: 'google' | 'apple';
  } | null>(null);
  const [existingEmail, setExistingEmail] = useState<{
    email: string;
    method: string | null;
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
  const flyRespawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyFirstArrivalRef = useRef(true);
  const [flyState, setFlyState] = useState<FlyState>('entering');
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

  useEffect(() => {
    return () => {
      if (flyRespawnTimerRef.current) {
        clearTimeout(flyRespawnTimerRef.current);
      }
    };
  }, []);

  const flyCaught = visuallyDone.has(FLY_KEY);

  const respawnFly = () => {
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
    void initNativeAppleSignIn().catch(() => {
      // Same here — the button retries and reports its own error.
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

  const catchFlyThenNavigate = async (route: string) => {
    if (!flyRefs.current[FLY_KEY]) {
      navigateOnce(route);
      return;
    }
    let settled = false;
    const go = () => {
      if (settled) return;
      settled = true;
      clearTimeout(bailout);
      navigateOnce(route);
    };
    const bailout = setTimeout(go, CATCH_BAILOUT_MS);
    await triggerTongue({
      key: FLY_KEY,
      completed: false,
      onPersist: () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            setFlyState('hidden');
            go();
            resolve();
          }, CATCH_SWALLOW_HOLD_MS);
        }),
    });
  };

  // Safety net: signInWithPopup's promise can hang in the opener even though
  // the sign-in succeeded (AuthContext still gets the user and the session
  // cookie). If a signed-in, non-anonymous user is somehow still parked on
  // this page, route them out instead of waiting for a manual refresh.
  useEffect(() => {
    if (!authUser || authUser.isAnonymous || navigatedRef.current) return;
    const timer = setTimeout(async () => {
      if (navigatedRef.current || googleFlowRef.current) return;
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
    googleFlowRef.current = true;
    try {
      const current = auth.currentUser;
      const shouldLink = isUpgrade && current?.isAnonymous;
      await signInWithGoogle({ linkTo: shouldLink ? current : null });
      const route = await prepareSignedInRoute(postLoginRoute);
      await catchFlyThenNavigate(route);
    } catch (err: any) {
      googleFlowRef.current = false;
      if (err instanceof GoogleAccountExistsError) {
        setConflict({ credential: err.credential, provider: 'google' });
      } else {
        showNotification(getGoogleAuthErrorMessage(err), undefined, {
          durationMs: 5000,
        });
      }
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setLoading(true);
    googleFlowRef.current = true;
    try {
      const current = auth.currentUser;
      const shouldLink = isUpgrade && current?.isAnonymous;
      await signInWithApple({ linkTo: shouldLink ? current : null });
      const route = await prepareSignedInRoute(postLoginRoute);
      await catchFlyThenNavigate(route);
    } catch (err: any) {
      googleFlowRef.current = false;
      if (err instanceof AppleAccountExistsError) {
        setConflict({ credential: err.credential, provider: 'apple' });
      } else {
        showNotification(getAppleAuthErrorMessage(err), undefined, {
          durationMs: 5000,
        });
      }
      setLoading(false);
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password || loading) return;
    setLoading(true);
    googleFlowRef.current = true;
    try {
      await signInWithPassword(trimmed, password);
      const route = await prepareSignedInRoute(postLoginRoute);
      await catchFlyThenNavigate(route);
    } catch (err) {
      googleFlowRef.current = false;
      showNotification(getPasswordAuthErrorMessage(err), undefined, {
        durationMs: 5000,
      });
      setLoading(false);
    }
  };

  const handleSwitchToExisting = async () => {
    if (!conflict || switching) return;
    const isApple = conflict.provider === 'apple';
    setSwitching(true);
    try {
      if (isApple) {
        await signInWithExistingApple(conflict.credential);
      } else {
        await signInWithExistingGoogle(conflict.credential);
      }
      const route = await prepareSignedInRoute(postLoginRoute);
      navigateOnce(route);
    } catch (err: any) {
      setConflict(null);
      setSwitching(false);
      showNotification(
        isApple
          ? getAppleAuthErrorMessage(err)
          : getGoogleAuthErrorMessage(err),
        undefined,
        { durationMs: 5000 },
      );
    }
  };

  const sendEmailLink = async (
    address: string,
    intent: 'new-account' | 'existing-account' | null,
  ) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    await sendSignInLinkToEmail(
      auth,
      address,
      createEmailLinkSettings(`${origin}/auth/email-callback`),
    );
    window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, address);
    window.localStorage.setItem(POST_LOGIN_ROUTE_KEY, postLoginRoute);
    setEmailLinkIntent(intent);
    setDir(1);
    setStep('email-sent');
    setResendIn(30);
  };

  const handleConfirmExistingEmail = async () => {
    if (!existingEmail || switching) return;
    setSwitching(true);
    try {
      await sendEmailLink(existingEmail.email, 'existing-account');
      setExistingEmail(null);
    } catch (err: any) {
      setExistingEmail(null);
      showNotification(err?.message || 'Could not send email link');
    } finally {
      setSwitching(false);
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
          // A guest upgrading loses this device's progress if the email turns out
          // to belong to an existing account, so warn before sending the link.
          if (isUpgrade) {
            const lookup = await lookupAccountByEmail(trimmed);
            if (lookup.exists) {
              setExistingEmail({
                email: trimmed,
                method: describeSignInMethod(lookup.providers),
              });
              respawnFly();
              return;
            }
          }
          await sendEmailLink(trimmed, isUpgrade ? 'new-account' : null);
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

  const existingEmailMessage = (
    <>
      <span className="font-bold text-foreground">{existingEmail?.email}</span>{' '}
      already has a Frogress account
      {existingEmail?.method ? ` you set up with ${existingEmail.method}` : ''}.
      We&apos;ll send a link to sign back into it — your guest progress on this
      device will be left behind.
    </>
  );

  return (
    <main className="fixed inset-0 flex flex-col items-center overflow-x-hidden overflow-y-auto bg-background px-6 py-10">
      <div className="my-auto flex w-full max-w-sm shrink-0 origin-center flex-col items-center md:scale-110 xl:scale-125">
        <div
          className="auth-enter-brand text-center"
          style={{ '--auth-i': 0 } as any}
        >
          <h1 className="text-[26px] font-black tracking-tight text-foreground">
            {isUpgrade ? 'Save your frog' : 'Welcome back!'}
          </h1>
          <p className="mt-1 text-[15px] font-medium text-muted-foreground">
            {isUpgrade
              ? 'Sign in so it’s never lost.'
              : 'Sign in to get back to your frog.'}
          </p>
        </div>

        {/* Frog mascot — sits on top of the email input, fly buzzing above. No container. */}
        <div
          className="auth-enter-frog relative z-10 w-full"
          style={{ '--auth-i': 1 } as any}
        >
        <div className="pointer-events-none relative z-10 flex w-full translate-y-[11px] flex-col items-center">
          {!flyCaught && flyState !== 'hidden' && (
            <div
              aria-hidden
              className={`absolute left-1/2 z-10 -translate-x-1/2 ${
                flyState === 'entering' ? 'auth-fly-arrive' : 'auth-fly-drift'
              }`}
              style={
                {
                  top: '14%',
                  '--auth-i': flyFirstArrivalRef.current ? 8 : 0,
                } as any
              }
              onAnimationEnd={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.animationName !== 'auth-fly-arrive') return;
                flyFirstArrivalRef.current = false;
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
            </div>
          )}
          <div ref={frogBoxRef}>
            <Frog
              ref={frogRef}
              mouthOpen={!!grab}
              mouthOffset={tongueMouthOffset}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
              greet="hop"
            />
          </div>
        </div>
        </div>


        {/* Step content */}
        <div
          className="auth-enter relative z-0 w-full"
          style={{ '--auth-i': isUpgrade ? 3 : 2 } as any}
        >
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
                <div className={cn('flex gap-3', appleFirst ? 'flex-col-reverse' : 'flex-col')}>
                  <button
                    onClick={handleGoogle}
                    disabled={loading}
                    className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-card text-[15px] font-black text-foreground ring-1 ring-border shadow-[0_3px_0_0_hsl(var(--border))] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <GoogleIcon /> Continue with Google
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleApple}
                    disabled={loading}
                    className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-black text-[15px] font-black text-white shadow-[0_3px_0_0_#3f3f46] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:shadow-[0_3px_0_0_#a1a1aa]"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <AppleIcon /> Continue with Apple
                      </>
                    )}
                  </button>
                </div>

                {showEmailForm ? (
                  <motion.form
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    onSubmit={usePassword ? handlePasswordSignIn : handleSendEmailLink}
                    className="mt-5 space-y-3 border-t border-border/60 pt-5"
                  >
                    <Input
                      ref={emailRef}
                      id="email"
                      type="email"
                      aria-label="Email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoFocus={emailOpen}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 rounded-2xl border-border bg-card px-4 text-base focus-visible:ring-primary/30"
                      required
                    />
                    {usePassword && (
                      <Input
                        id="password"
                        type="password"
                        aria-label="Password"
                        placeholder="Password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-12 rounded-2xl border-border bg-card px-4 text-base focus-visible:ring-primary/30"
                        required
                      />
                    )}
                    <button
                      type="submit"
                      disabled={
                        !email.trim() || (usePassword && !password) || loading
                      }
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#2c511a] transition-[transform,box-shadow,opacity] active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {usePassword ? 'Sign in' : 'Send sign-in link'}{' '}
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                    {PASSWORD_LOGIN_ENABLED && (
                      <button
                        type="button"
                        onClick={() => setUsePassword((value) => !value)}
                        className="mx-auto block text-xs font-bold tracking-wide text-primary hover:underline"
                      >
                        {usePassword
                          ? 'Email me a sign-in link instead'
                          : 'Use a password instead'}
                      </button>
                    )}
                  </motion.form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEmailOpen(true)}
                    disabled={loading}
                    className="mt-3 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-card text-[15px] font-black text-foreground ring-1 ring-border shadow-[0_3px_0_0_hsl(var(--border))] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Mail className="h-[18px] w-[18px]" strokeWidth={2.5} /> Continue with email
                  </button>
                )}
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
                <h1 className="text-xl font-black tracking-tight text-foreground">
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
        </div>

        <p
          className="auth-enter mt-8 text-[13px] font-bold text-muted-foreground"
          style={{ '--auth-i': isUpgrade ? 4 : 3 } as any}
        >
          No frog yet?{' '}
          <Link
            href="/welcome"
            className="ml-1 text-primary decoration-2 underline-offset-4 hover:underline"
          >
            Adopt one
          </Link>
        </p>
      </div>

      <AccountConflictDialog
        open={!!conflict}
        busy={switching}
        title="You already have a frog!"
        message={`That ${conflict?.provider === 'apple' ? 'Apple' : 'Google'} account is already connected to a Frogress account. Switch to it? Your guest progress on this device will be left behind.`}
        confirmLabel="Switch to my account"
        onConfirm={handleSwitchToExisting}
        onCancel={() => setConflict(null)}
      />

      <AccountConflictDialog
        open={!!existingEmail}
        busy={switching}
        title="You already have a frog!"
        message={existingEmailMessage}
        confirmLabel="Sign in to my account"
        cancelLabel="Use a different email"
        onConfirm={handleConfirmExistingEmail}
        onCancel={() => setExistingEmail(null)}
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
