'use client';

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Loader2,
  ArrowRight,
  ArrowUp,
  Download,
  CheckCircle2,
  Circle,
  EllipsisVertical,
  Shuffle,
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
import {
  getAppleAuthErrorMessage,
  initNativeAppleSignIn,
  signInWithApple,
} from '@/lib/appleAuth';
import { establishSessionCookie } from '@/lib/authCookie';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { AppleIcon } from '@/components/ui/AppleIcon';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { FROG_TONGUE_MOUTH_OFFSET, type FrogHandle } from '@/components/ui/frog';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useAuth } from '@/components/auth/AuthContext';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import {
  FUNNEL_GIFT_PENDING_KEY,
  mutateFlyCaches,
} from '@/components/providers/CrossGiftProvider';
import {
  FUNNEL_GIFT_ITEM_ID,
  FUNNEL_GIFT_NAME,
  FUNNEL_GIFT_RIVE_INDEX,
} from '@/lib/crossGift';
import type { ItemDef } from '@/lib/skins/catalog';
import { detectMobileOS, PLAY_STORE_URL, type MobileOS } from '@/lib/appStores';
import { trackGrowthEvent } from '@/lib/growthTrack';
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from '@/lib/onboardingDraft';
import { DEFAULT_BACKGROUND_IMAGES } from '@/hooks/useBackgrounds';
import { cn, getZonedToday } from '@/lib/utils';
import { GiftMoment } from './GiftMoment';

const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });

const FLY_PX = 40;
const TASK_KEY = 'try-task';
const HOUR_MS = 3_600_000;
const MAX_HUNGER_MS = 24 * HOUR_MS;
const HUNGRY_MS = Math.round(MAX_HUNGER_MS * 0.12);
const FED_MS = MAX_HUNGER_MS;
const FALLBACK_PRIZE: ItemDef = {
  id: FUNNEL_GIFT_ITEM_ID,
  name: FUNNEL_GIFT_NAME,
  slot: 'skin',
  rarity: 'rare',
  riveIndex: FUNNEL_GIFT_RIVE_INDEX,
  icon: '',
};
const NAME_MAX = 16;

type Scene = 'pick' | 'catch' | 'name' | 'keep' | 'go';
type Method = 'google' | 'apple';

const STARTER_TASKS = [
  { emoji: '💧', text: 'Drink a glass of water' },
  { emoji: '🚶', text: 'Take a 10-minute walk' },
  { emoji: '📬', text: 'Answer that one email' },
  { emoji: '📖', text: 'Read 10 pages' },
];

const APP_FEATURES = [
  { icon: '/icons/Planner.svg', text: 'Plan your day and your whole week' },
  { icon: '/icons/Repeat.svg', text: 'Repeating habits with reminders' },
  { icon: '/icons/GoogleCalendar.svg', text: 'Syncs with Google and Apple Calendar' },
];

const USER_QUOTES: { quote: string; author: string }[] = [];

const FROG_NAMES = [
  'Pickle',
  'Mochi',
  'Noodle',
  'Clover',
  'Waffles',
  'Kiwi',
  'Bean',
  'Pebble',
  'Dumpling',
  'Sprout',
];

type LookIndices = Partial<Record<'hat' | 'body' | 'hand_item', number>>;

const LOOKS: { id: string; indices: LookIndices }[] = [
  { id: 'wizard', indices: { hat: 1, hand_item: 1 } },
  { id: 'pirate', indices: { hat: 4, hand_item: 3 } },
  { id: 'gamer', indices: { hat: 3, hand_item: 2 } },
  { id: 'ninja', indices: { body: 5, hand_item: 5 } },
  { id: 'sailor', indices: { hat: 6, body: 1 } },
  { id: 'pilot', indices: { hat: 9, hand_item: 4 } },
];

const LOOK_LINES = [
  'Ooh, fancy!',
  'Okay this\nis so me',
  'I NEED this one',
  'Do I look cool?',
  'Best. Outfit. Ever.',
];

const HUNGRY_LINES = [
  "I'm sooo hungry…\nGot a task for me?",
  'Pick one!\nAny one!',
];

function randomName(current?: string) {
  const pool = FROG_NAMES.filter((n) => n !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function TryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const reduceMotion = useReducedMotion();
  const mainRef = useRef<HTMLElement>(null);

  const [scene, setScene] = useState<Scene>('pick');
  const [prize, setPrize] = useState<ItemDef>(FALLBACK_PRIZE);
  const [taskSaved, setTaskSaved] = useState(false);
  const [task, setTask] = useState('');
  const [draftTask, setDraftTask] = useState('');
  const [taskDone, setTaskDone] = useState(false);
  const [catching, setCatching] = useState(false);
  const [lit, setLit] = useState(false);
  const [flyBalance, setFlyBalance] = useState(0);
  const [hunger, setHunger] = useState(HUNGRY_MS);
  const [speech, setSpeech] = useState<string | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [wearing, setWearing] = useState(false);
  const [lookId, setLookId] = useState<string | null>(null);
  const [frogName, setFrogName] = useState('');
  const [signingIn, setSigningIn] = useState<Method | null>(null);
  const [savedWith, setSavedWith] = useState<Method | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [mobileOS, setMobileOS] = useState<MobileOS>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const lookLineRef = useRef(0);

  const signedIn = !!user && !user.isAnonymous;
  const name = frogName.trim() || 'your frog';
  const look = LOOKS.find((l) => l.id === lookId);

  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
    keepTargetHiddenUntilPersist: true,
  });

  useEffect(() => {
    void initNativeGoogleSignIn().catch(() => {});
    void initNativeAppleSignIn().catch(() => {});
    setMobileOS(detectMobileOS());
    setFrogName(randomName());
    trackGrowthEvent('funnel_view');
    void fetch('/api/skins/catalog')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const live = (data?.items as ItemDef[] | undefined)?.find(
          (item) => item.id === FUNNEL_GIFT_ITEM_ID,
        );
        if (live) setPrize((p) => ({ ...p, ...live }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo({
      top: 0,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [scene, reduceMotion]);

  useEffect(() => {
    if (scene !== 'pick') return;
    let i = 0;
    const first = setTimeout(() => setSpeech(HUNGRY_LINES[0]), 900);
    const timer = setInterval(() => {
      i = (i + 1) % HUNGRY_LINES.length;
      setSpeech(HUNGRY_LINES[i]);
    }, 4800);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [scene]);

  useEffect(() => {
    if (scene !== 'keep') return;
    const lines = [
      'Take me\nwith you?',
      "Don't leave me\nin a browser tab 🥺",
    ];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % lines.length;
      setSpeech(lines[i]);
    }, 5200);
    return () => clearInterval(timer);
  }, [scene]);

  useEffect(() => {
    if (scene !== 'go' || mobileOS || qrUrl) return;
    void QRCode.toDataURL(`${window.location.origin}/get-app`, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#1c4620', light: '#ffffff' },
    })
      .then(setQrUrl)
      .catch(() => {});
  }, [scene, mobileOS, qrUrl]);

  const burstConfetti = (originY?: number) => {
    if (reduceMotion) return;
    const box = frogBoxRef.current?.getBoundingClientRect();
    const y =
      originY ??
      (box ? (box.top + box.height * 0.45) / window.innerHeight : 0.35);
    void confetti({
      particleCount: 110,
      spread: 80,
      startVelocity: 38,
      origin: { y },
      colors: ['#4f9149', '#5ca355', '#fbbf24', '#38bdf8', '#f472b6'],
    });
  };

  const chooseTask = (text: string, source: 'chip' | 'custom') => {
    const clean = text.trim().slice(0, 60);
    if (!clean) return;
    trackGrowthEvent('funnel_task_added', { source });
    setTask(clean);
    setSpeech('Ooh, good one!\nNow tap the fly 👀');
    setScene('catch');
  };

  const handleCatch = async () => {
    if (taskDone || catching) return;
    trackGrowthEvent('funnel_task_completed');
    setCatching(true);
    setSpeech(null);
    await triggerTongue({
      key: TASK_KEY,
      completed: false,
      onPersist: () => {
        setTaskDone(true);
        setLit(true);
        setFlyBalance(1);
        setHunger(FED_MS);
        setSpeech('YUM! 😋');
        try {
          localStorage.setItem(FUNNEL_GIFT_PENDING_KEY, '1');
        } catch {}
        setTimeout(() => {
          setSpeech(null);
          setGiftOpen(true);
        }, 2200);
      },
    });
  };

  const claimReward = async () => {
    const res = await fetch('/api/funnel-gift/claim', { method: 'POST' });
    if (!res.ok) throw new Error('Could not save your reward');
    try {
      localStorage.removeItem(FUNNEL_GIFT_PENDING_KEY);
    } catch {}
    mutateFlyCaches();
    trackGrowthEvent('funnel_gift_claimed', { via: 'inline' });
  };

  const handleGiftClaim = () => {
    trackGrowthEvent('funnel_box_opened');
    setGiftOpen(false);
    setWearing(true);
    burstConfetti();
    if (signedIn) {
      void claimReward().catch((err: any) =>
        showNotification(err?.message || 'Could not save your reward'),
      );
      setSpeech('How do I look?');
      setScene('go');
      return;
    }
    setSpeech('How do I look?\nDo I get a name?');
    setScene('name');
  };

  const confirmName = () => {
    const clean = frogName.trim().slice(0, NAME_MAX);
    if (!clean) return;
    setFrogName(clean);
    saveOnboardingDraft({ ...loadOnboardingDraft(), frogName: [clean] });
    setSpeech(`${clean}!\nI love it 💚`);
    setScene('keep');
  };

  const tryLook = (id: string) => {
    const next = lookId === id ? null : id;
    setLookId(next);
    if (!next) return;
    trackGrowthEvent('funnel_try_on');
    setSpeech(LOOK_LINES[lookLineRef.current % LOOK_LINES.length]);
    lookLineRef.current += 1;
  };

  const signInAndSave = async (method: Method) => {
    if (signingIn) return;
    setSigningIn(method);
    trackGrowthEvent('funnel_signin_started', { method });
    try {
      if (method === 'apple') {
        await signInWithApple();
      } else {
        await signInWithGoogle();
      }
      const current = auth.currentUser;
      if (!current) throw new Error('Authentication did not complete');
      await establishSessionCookie(current);
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const fresh = !!data?.isNewUser;
      setIsNewUser(fresh);
      trackGrowthEvent('funnel_signup', { isNewUser: fresh });
      if (data?.alreadyOnboarded) {
        clearOnboardingDraft();
        if (typeof data.frogName === 'string' && data.frogName.trim()) {
          setFrogName(data.frogName.trim().slice(0, NAME_MAX));
        }
      } else {
        await fetch('/api/user', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frogName: frogName.trim() }),
        }).catch(() => {});
      }
      if (fresh && task) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const saved = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: task,
            repeat: 'this-week',
            dates: [getZonedToday(timezone)],
            timezone,
          }),
        }).catch(() => null);
        setTaskSaved(!!saved?.ok);
      }
      await claimReward();
      setSavedWith(method);
      setSpeech('See you\nin the app!');
      burstConfetti(0.35);
      setScene('go');
    } catch (err: any) {
      showNotification(
        method === 'apple'
          ? getAppleAuthErrorMessage(err)
          : getGoogleAuthErrorMessage(err),
        undefined,
        { durationMs: 5000 },
      );
    } finally {
      setSigningIn(null);
    }
  };

  const skipSignIn = () => {
    trackGrowthEvent('funnel_signin_skipped');
    setSpeech('Come find me\nin the app!');
    setScene('go');
  };

  const continueOnWeb = () => {
    trackGrowthEvent('funnel_continue_web');
    router.push(signedIn && !isNewUser ? '/' : '/onboarding');
  };

  const hasStore =
    mobileOS === 'ios' || (mobileOS === 'android' && !!PLAY_STORE_URL);
  const authOrder: Method[] =
    mobileOS === 'ios' ? ['apple', 'google'] : ['google', 'apple'];

  return (
    <main
      ref={mainRef}
      className="fixed inset-0 z-[100] overflow-y-auto overflow-x-hidden bg-background"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 top-0 -z-10 h-[calc(460px+env(safe-area-inset-top))] w-full overflow-hidden md:h-[500px]"
      >
        <picture
          className={cn(
            'block h-full w-full transition-[filter] duration-[1800ms] ease-out',
            lit
              ? '[filter:none]'
              : '[filter:saturate(0.4)_brightness(0.55)_contrast(1.05)]',
          )}
        >
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
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-b from-[#071a33]/80 via-[#0c2440]/45 to-[#0c2440]/10 transition-opacity duration-[1800ms] ease-out',
            lit ? 'opacity-0' : 'opacity-100',
          )}
        />
        {lit && !reduceMotion && (
          <motion.div
            className="absolute left-1/2 top-[58%] h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,240,180,0.9)_0%,rgba(255,226,140,0.35)_30%,rgba(255,226,140,0)_62%)]"
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, 1, 1.25] }}
            transition={{ duration: 1.6, ease: 'easeOut', times: [0, 0.3, 1] }}
          />
        )}
        <div className="absolute inset-0 shadow-[rgba(0,0,0,0.06)_0px_2px_4px_0px_inset,rgba(0,0,0,0.15)_0px_-2px_5px_0px_inset]" />
      </div>

      <div className="fixed left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[90] flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/frogress-icon.png"
          alt=""
          className="h-8 w-8 rounded-[10px] shadow-[0_2px_0_0_rgba(0,0,0,0.25)]"
        />
        <span className="font-display text-xl leading-none tracking-wide text-white [filter:drop-shadow(0_2px_0_rgba(8,52,33,0.8))]">
          Frogress
        </span>
      </div>

      <div className="fixed right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[90] flex items-center gap-2">
        <FlyCounter balance={flyBalance} variant="mobile" alwaysCelebrate />
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col px-3 pb-4 pt-[calc(3rem+env(safe-area-inset-top))] md:px-6 md:pt-12">
        <div className="relative z-10">
          <FrogDisplay
            frogRef={frogRef}
            frogBoxRef={frogBoxRef}
            mouthOpen={!!grab}
            mouthOffset={FROG_TONGUE_MOUTH_OFFSET}
            indices={{
              skin: wearing ? prize.riveIndex : 0,
              hat: look?.indices.hat ?? 0,
              body: look?.indices.body ?? 0,
              hand_item: look?.indices.hand_item ?? 0,
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

        <div className="relative z-20 -mx-3 mt-[14px] flex min-h-[48vh] flex-col rounded-t-[28px] bg-background px-4 pb-16 pt-8 md:mx-auto md:mt-16 md:w-full md:max-w-xl md:rounded-[28px] md:px-8 md:pb-10">
          <AnimatePresence mode="wait" initial={false}>
            {scene === 'pick' && (
              <SceneShell key="pick">
                <SceneTitle
                  title="Your frog is starving"
                  body="Frogress is a to-do list with a frog who eats when you get things done. Pick one thing you'll do today."
                />
                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  {STARTER_TASKS.map((t) => (
                    <button
                      key={t.text}
                      type="button"
                      onClick={() => chooseTask(t.text, 'chip')}
                      className="flex min-h-[76px] flex-col items-start justify-between gap-1.5 rounded-2xl border border-border/70 bg-card px-3.5 py-3 text-left shadow-[0_3px_0_0_rgba(0,0,0,0.08)] transition-all hover:border-primary/50 active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span aria-hidden className="text-xl leading-none">
                        {t.emoji}
                      </span>
                      <span className="text-[14px] font-bold leading-tight text-foreground">
                        {t.text}
                      </span>
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    chooseTask(draftTask, 'custom');
                  }}
                  className="mt-2.5 flex items-center gap-2 rounded-2xl border border-border/70 bg-card py-1.5 pl-4 pr-1.5 shadow-[0_3px_0_0_rgba(0,0,0,0.08)] focus-within:border-primary/60"
                >
                  <input
                    value={draftTask}
                    onChange={(e) => setDraftTask(e.target.value)}
                    maxLength={60}
                    enterKeyHint="done"
                    placeholder="Or type your own…"
                    aria-label="Type your own task"
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!draftTask.trim()}
                    aria-label="Add task"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4f9149] text-white shadow-[0_3px_0_0_#34631f] transition-all active:translate-y-[2px] active:shadow-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                  >
                    <ArrowUp className="h-5 w-5" strokeWidth={3} />
                  </button>
                </form>
              </SceneShell>
            )}

            {scene === 'catch' && (
              <SceneShell key="catch">
                <SceneTitle
                  title={taskDone ? "That's Frogress" : "Pretend it's done"}
                  body={
                    taskDone
                      ? 'Every task you finish feeds your frog. Leave them undone and they go hungry.'
                      : 'Then tap the fly on your task.'
                  }
                />
                <div className="mt-5">
                  <TaskRow
                    text={task}
                    done={taskDone}
                    caught={visuallyDone.has(TASK_KEY)}
                    onCatch={() => void handleCatch()}
                    flyRef={(el) => {
                      flyRefs.current[TASK_KEY] = el;
                    }}
                    reduceMotion={!!reduceMotion}
                  />
                </div>
              </SceneShell>
            )}

            {scene === 'name' && (
              <SceneShell key="name">
                <SceneTitle
                  title="Name your frog"
                  body={`They're yours now, ${prize.name} skin and all.`}
                />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    confirmName();
                  }}
                  className="mx-auto mt-5 flex w-full max-w-sm flex-col gap-3"
                >
                  <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card py-1.5 pl-4 pr-1.5 shadow-[0_3px_0_0_rgba(0,0,0,0.08)] focus-within:border-primary/60">
                    <input
                      value={frogName}
                      onChange={(e) =>
                        setFrogName(e.target.value.slice(0, NAME_MAX))
                      }
                      maxLength={NAME_MAX}
                      enterKeyHint="done"
                      aria-label="Frog name"
                      className="min-w-0 flex-1 bg-transparent font-display text-2xl tracking-wide text-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setFrogName((n) => randomName(n))}
                      aria-label="Suggest another name"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/70 transition-all hover:text-foreground active:scale-90"
                    >
                      <Shuffle className="h-[18px] w-[18px]" strokeWidth={2.5} />
                    </button>
                  </div>
                  <ChunkyButton type="submit" disabled={!frogName.trim()}>
                    Meet {frogName.trim() || 'your frog'}
                  </ChunkyButton>
                </form>
              </SceneShell>
            )}

            {scene === 'keep' && (
              <SceneShell key="keep">
                <SceneTitle
                  title={`Keep ${name}`}
                  body={`${name} lives in the Frogress app and counts on you to finish what you planned.`}
                />

                <ul className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-3">
                  {APP_FEATURES.map((f) => (
                    <li key={f.text} className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.icon} alt="" className="h-6 w-6" />
                      </span>
                      <span className="text-[15px] font-bold leading-tight text-foreground">
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <p className="px-1 text-[13px] font-bold text-muted-foreground">
                    Flies unlock outfits. Tap one to try it on.
                  </p>
                  <div className="-mx-4 mt-2 flex snap-x gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
                    {LOOKS.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => tryLook(l.id)}
                        aria-pressed={lookId === l.id}
                        aria-label={`Try on outfit ${LOOKS.indexOf(l) + 1}`}
                        className={cn(
                          'flex h-[80px] w-[84px] shrink-0 snap-start items-center justify-center overflow-hidden rounded-2xl border bg-card transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          lookId === l.id
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border/70',
                        )}
                      >
                        <FrogSnapshot
                          indices={{ skin: prize.riveIndex, ...l.indices }}
                          width={80}
                          height={64}
                          visualOffsetY={0}
                          className="h-16 w-20"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {USER_QUOTES.length > 0 && (
                  <div className="-mx-4 mt-8 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
                    {USER_QUOTES.map((q) => (
                      <figure
                        key={q.author}
                        className="w-[260px] shrink-0 snap-start rounded-2xl bg-muted/60 p-4 text-left"
                      >
                        <blockquote className="text-[14px] font-semibold leading-snug text-foreground">
                          &ldquo;{q.quote}&rdquo;
                        </blockquote>
                        <figcaption className="mt-2 text-[12px] font-bold text-muted-foreground">
                          {q.author}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}

                <div className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-3">
                  <p className="text-center text-[13px] font-bold text-foreground/70">
                    A free account saves {name}, the {prize.name} skin and your task.
                  </p>
                  {authOrder.map((method) => (
                    <AuthButton
                      key={method}
                      method={method}
                      busy={signingIn === method}
                      disabled={!!signingIn}
                      onClick={() => void signInAndSave(method)}
                    />
                  ))}
                  <div className="flex items-center justify-between px-1 pt-0.5">
                    <Link
                      href="/login"
                      className="py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Use email instead
                    </Link>
                    <button
                      type="button"
                      onClick={skipSignIn}
                      className="py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Skip for now
                    </button>
                  </div>
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
                </div>
              </SceneShell>
            )}

            {scene === 'go' && (
              <SceneShell key="go">
                <SceneTitle
                  title={
                    signedIn || savedWith
                      ? `${frogName.trim() ? name : 'Your frog'} is saved`
                      : `Take ${name} with you`
                  }
                  body={
                    savedWith
                      ? taskSaved
                        ? `"${task}" is on today's list. Sign in to the app with ${savedWith === 'apple' ? 'Apple' : 'Google'}, do it for real, and ${name} gets the fly.`
                        : `Get the app and sign in with ${savedWith === 'apple' ? 'Apple' : 'Google'}. ${name} will be there, wearing the ${prize.name} skin.`
                      : signedIn
                        ? `Open the app with this account and the ${prize.name} skin is in your wardrobe.`
                        : `${name} is waiting for you in the app.`
                  }
                />

                <div className="mx-auto mt-6 w-full max-w-md overflow-hidden rounded-[28px] bg-card ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.12)]">
                  <div className="flex items-center gap-3.5 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/frogress-icon.png"
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-[18px] shadow-[0_2px_0_0_rgba(0,0,0,0.15)]"
                    />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="font-display text-2xl leading-none tracking-wide text-foreground">
                        Frogress
                      </p>
                      <p className="mt-1.5 text-[13px] font-bold leading-tight text-muted-foreground">
                        To-do list and planner
                      </p>
                      <p className="mt-0.5 text-[13px] font-bold leading-tight text-primary">
                        Free on iPhone and Android
                      </p>
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    {mobileOS && hasStore ? (
                      <a
                        href="/get-app"
                        onClick={() =>
                          trackGrowthEvent('funnel_store_click', {
                            os: mobileOS,
                          })
                        }
                        className="flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[17px] font-black tracking-tight text-white shadow-[0_4px_0_0_#34631f] transition-all hover:brightness-110 active:translate-y-[3px] active:shadow-none"
                      >
                        <Download className="h-5 w-5" strokeWidth={3} />
                        Get Frogress, it&apos;s free
                      </a>
                    ) : mobileOS ? (
                      <ChunkyButton type="button" onClick={continueOnWeb}>
                        Start using Frogress
                        <ArrowRight className="h-5 w-5" strokeWidth={3} />
                      </ChunkyButton>
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/60 p-4 text-center sm:flex-row sm:gap-4 sm:p-3 sm:text-left">
                        <div className="relative flex h-36 w-36 flex-none items-center justify-center rounded-xl bg-white p-2 ring-1 ring-black/5">
                          {qrUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={qrUrl}
                                alt="QR code to download the Frogress app"
                                width={128}
                                height={128}
                                className="block h-32 w-32"
                              />
                              <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-white">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src="/frogress-icon.png"
                                  alt=""
                                  className="h-7 w-7 rounded-lg"
                                />
                              </span>
                            </>
                          ) : (
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[16px] font-black leading-tight text-foreground">
                            Scan to download
                          </p>
                          <p className="mt-1 text-[13px] font-semibold leading-snug text-muted-foreground">
                            Point your phone&apos;s camera at the code.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 border-t border-dashed border-amber-300/70 bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
                    <div className="-my-3 aspect-[282/381] h-[72px] w-auto shrink-0">
                      <GiftRive className="h-full w-full" color={0} />
                    </div>
                    <p className="text-left text-[13px] font-bold leading-snug text-amber-900 dark:text-amber-200">
                      Another gift is waiting in the app. Unwrap it the first
                      time you sign in there.
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-col items-center gap-1">
                  {!signedIn && !savedWith && (
                    <button
                      type="button"
                      onClick={() => setScene('keep')}
                      className="flex h-11 items-center justify-center text-sm font-bold text-primary transition-colors hover:text-primary/80"
                    >
                      Save {name} to an account first
                    </button>
                  )}
                  {(hasStore || !mobileOS) && (
                    <button
                      type="button"
                      onClick={continueOnWeb}
                      className="flex h-11 items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Keep going on the web
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </SceneShell>
            )}
          </AnimatePresence>
        </div>
      </div>

      {giftOpen && (
        <GiftMoment prize={prize} onWear={handleGiftClaim} />
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

          <g ref={worldGroupEl}>
            <path
              ref={tonguePathEl}
              d="M0 0 L0 0"
              fill="none"
              stroke="url(#try-tongue-grad)"
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

function SceneShell({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="flex flex-col"
    >
      {children}
    </motion.div>
  );
}

function SceneTitle({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-1 text-center">
      <h1 className="font-display text-[30px] leading-[1.05] tracking-wide text-foreground md:text-[34px]">
        {title}
      </h1>
      {body && (
        <p className="mx-auto mt-2 max-w-[24rem] text-[15px] font-semibold leading-snug text-muted-foreground">
          {body}
        </p>
      )}
    </div>
  );
}

function ChunkyButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-base font-black tracking-tight text-white shadow-[0_4px_0_0_#34631f] transition-all hover:brightness-110 active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none',
        className,
      )}
    >
      {children}
    </button>
  );
}

function AuthButton({
  method,
  busy,
  disabled,
  onClick,
}: {
  method: Method;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card text-[15px] font-black tracking-tight text-card-foreground shadow-[0_4px_0_0_rgba(0,0,0,0.12)] transition-all hover:bg-accent active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : method === 'apple' ? (
        <>
          <AppleIcon className="h-5 w-5" />
          Continue with Apple
        </>
      ) : (
        <>
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </>
      )}
    </button>
  );
}

function TaskRow({
  text,
  done,
  caught,
  onCatch,
  flyRef,
  reduceMotion,
}: {
  text: string;
  done: boolean;
  caught: boolean;
  onCatch: () => void;
  flyRef: (el: HTMLDivElement | null) => void;
  reduceMotion: boolean;
}) {
  const active = !done && !caught;
  return (
    <div
      onClick={active ? onCatch : undefined}
      role={active ? 'button' : undefined}
      tabIndex={active ? 0 : undefined}
      aria-label={active ? `Complete "${text}" and feed the frog` : undefined}
      onKeyDown={(e) => {
        if (active && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onCatch();
        }
      }}
      className={cn(
        'relative flex w-full items-center gap-1 rounded-2xl border bg-card px-2.5 py-3 shadow-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:px-3.5 md:py-3.5',
        active ? 'cursor-pointer border-primary/40' : 'border-border/50',
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
          'relative z-10 min-w-0 flex-1 transition-opacity duration-300',
          done ? 'opacity-60' : 'opacity-100',
        )}
      >
        <span
          className={cn(
            'break-words text-[16px] font-semibold leading-snug md:text-[17px]',
            done ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {text}
        </span>
      </div>

      <div className="relative z-10 h-12 w-12 flex-shrink-0">
        <AnimatePresence initial={false}>
          {done ? (
            <motion.div
              key="check"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <CheckCircle2 className="h-10 w-10 text-green-500 drop-shadow-sm" />
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
              <Circle className="h-10 w-10" />
            </motion.div>
          ) : (
            <motion.div
              key="fly"
              className="absolute inset-0"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: -150, y: -110, rotate: -30, scale: 0.5 }
              }
              animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 110,
                damping: 13,
                delay: reduceMotion ? 0 : 0.25,
              }}
            >
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
              <div
                ref={flyRef}
                className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/20 bg-muted"
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
