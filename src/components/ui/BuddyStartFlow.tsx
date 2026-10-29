'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  Check,
  ChevronLeft,
  Link2,
  Loader2,
  Plus,
  Repeat,
  Share2,
  Sun,
  X,
} from 'lucide-react';
import useSWR, { mutate as mutateGlobal } from 'swr';
import confetti from 'canvas-confetti';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { BuddyFrogFace } from '@/components/ui/BuddyBadge';
import { GiftOutfitPreview } from '@/components/ui/friends/GiftOutfitPreview';
import { RarityBadge } from '@/components/ui/skins/RarityBadge';
import { checkNotifGranted, requestNotif } from '@/components/ui/BuddyUpFlow';
import type { BuddyGiftOption } from '@/components/ui/buddy/BuddyGoalSheet';
import { useKeyboardInset } from '@/components/ui/quick-add/useKeyboardInset';
import { useBuddyBonusFlies } from '@/hooks/useBuddyState';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { readCachedBackground } from '@/hooks/useBackgrounds';
import { DEFAULT_BACKGROUND_IMAGES } from '@/lib/backgrounds/constants';
import {
  BUDDY_PRESETS,
  buddyRepeatSummary,
  daysForChoice,
  toBuddyCreateParams,
  type BuddyRepeatChoice,
} from '@/lib/buddy/presets';
import { todayYmd } from '@/components/board/helpers';
import { warmFrogStamps } from '@/lib/frogStampEngine';
import { riveDevicePixelRatio } from '@/lib/riveLoader';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { SheetEnteredContext, useEntrance } from '@/lib/sheetEntered';
import type { FriendSummary } from '@/lib/friends/indices';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { hapticSelect, hapticSuccess } from '@/lib/haptics';
import { shareLink, type ShareResult } from '@/lib/share';
import { cn } from '@/lib/utils';

const BUDDY = '#447d3f';
const FROG_W = 170;
const FROG_H = Math.round(FROG_W * 1.125);
const HILL_CREST_PX = 19;
const FROG_SEAT_PX = HILL_CREST_PX - 1 - Math.round(FROG_H * 0.045);
const FROG_HEAD_PX = FROG_SEAT_PX + Math.round(FROG_H * 0.42);
const FACE_PX = 44;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const REPEAT_OPTIONS: [BuddyRepeatChoice, string][] = [
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays'],
  ['once', 'Just once'],
  ['custom', 'Pick days'],
];

type WardrobeIndices = Partial<
  Record<'skin' | 'hat' | 'body' | 'hand_item', number>
>;

type ShareableTask = { id: string; text: string; schedule: string };
type ShareableResponse = { habits?: ShareableTask[]; today?: ShareableTask[] };

type Goal =
  | { kind: 'habit' | 'today'; id: string; text: string; schedule: string }
  | { kind: 'new'; text: string; choice: BuddyRepeatChoice; days: number[] };

type Target = { kind: 'friend'; friend: FriendSummary } | { kind: 'link' };

type Step = 'goal' | 'new' | 'friend' | 'send' | 'sent';

type Sent = { name?: string; url?: string; copiedOnly?: boolean };

const isTallStep = (step: string | null | undefined) => step === 'send' || step === 'sent';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const goalSchedule = (goal: Goal) =>
  goal.kind === 'new' ? buddyRepeatSummary(goal.choice, goal.days) : goal.schedule;

const firstName = (friend: FriendSummary) =>
  (friend.name || friend.frogName || 'your friend').trim().split(/\s+/)[0];

async function shareInviteUrl(url: string, goal: string): Promise<ShareResult> {
  const result = await shareLink({
    title: "Let's chase a goal together on Frogress!",
    text: `I set up "${goal}" as a shared goal for us. Tap to join me and grab a gift.`,
    url,
    dialogTitle: 'Invite your goal buddy',
  });
  if (result === 'shared' || result === 'copied') {
    trackAnalyticsEvent('referral_invite_shared', {
      method: result === 'shared' ? 'native_share' : 'copy_link',
      share_surface: 'buddy_invite',
    });
  }
  return result;
}

export function BuddyStartFlow({
  open,
  onClose,
  friends,
  indices,
  source = 'nudge',
  presetFriend = null,
}: {
  open: boolean;
  onClose: () => void;
  friends: FriendSummary[];
  indices?: WardrobeIndices;
  source?: string;
  presetFriend?: FriendSummary | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <BuddyFlowScreen
          key="buddy-flow"
          onClose={onClose}
          friends={friends}
          indices={indices}
          source={source}
          presetFriend={presetFriend}
        />
      )}
    </AnimatePresence>,
    document.body,
  );
}

function BuddyFlowScreen({
  onClose,
  friends,
  indices,
  source,
  presetFriend,
}: {
  onClose: () => void;
  friends: FriendSummary[];
  indices?: WardrobeIndices;
  source: string;
  presetFriend: FriendSummary | null;
}) {
  const reduceMotion = useReducedMotion();
  const bonusFlies = useBuddyBonusFlies();
  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [target, setTarget] = useState<Target | null>(
    presetFriend
      ? { kind: 'friend', friend: presetFriend }
      : friends.length === 0
        ? { kind: 'link' }
        : null,
  );
  const [draftText, setDraftText] = useState('');
  const [draftChoice, setDraftChoice] = useState<BuddyRepeatChoice>('daily');
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [notifGranted, setNotifGranted] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);
  const [space, setSpace] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  const measureRef = useRef<() => void>(() => {});
  const frogRef = useRef<FrogHandle | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const { inset } = useKeyboardInset(step === 'new');
  const keyboardInset = inputFocused ? inset : 0;
  useRegisterOpenSheet(true);
  const { entered, markEntered } = useEntrance(true);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data: shareable } = useSWR<ShareableResponse>(
    `/api/buddy/shareable?timezone=${encodeURIComponent(timezone)}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const wantsLink = target?.kind === 'link';
  const { data: inviteConfig } = useSWR<{ giftOptions?: BuddyGiftOption[] }>(
    '/api/invite/config',
    fetcher,
    { revalidateOnFocus: false },
  );
  const giftOptions = inviteConfig?.giftOptions;

  useEffect(() => {
    trackAnalyticsEvent('buddy_flow_opened', { source, friend_count: friends.length });
    void checkNotifGranted().then(setNotifGranted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      warmFrogStamps(
        friends.slice(0, 10).map((friend) => friend.indices ?? {}),
        Math.round(FACE_PX * 2.4 * riveDevicePixelRatio()),
      ),
    [friends],
  );

  useEffect(() => {
    if (!giftId && giftOptions?.length) setGiftId(giftOptions[0].id);
  }, [giftOptions, giftId]);

  useEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const footer = footerRef.current;
    if (!root || !body || !footer || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rendered = body.lastElementChild?.getAttribute('data-step');
      if (rendered !== stepRef.current || !isTallStep(rendered)) return;
      setSpace(Math.max(0, root.clientHeight - body.offsetHeight - footer.offsetHeight));
    };
    measureRef.current = measure;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(body);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isTallStep(step)) setSpace(0);
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (step === 'friend') frogRef.current?.fireEmote('hop');
    if (step === 'send') frogRef.current?.fireEmote('love');
    if (step !== 'sent') return;
    hapticSuccess();
    frogRef.current?.fireEmote('loveBurst');
    if (reduceMotion) return;
    confetti({
      particleCount: 90,
      spread: 80,
      startVelocity: 42,
      origin: { y: 0.32 },
      zIndex: 99999,
      colors: ['#447d3f', '#8fc36d', '#ffd166', '#ffffff'],
    });
  }, [step, reduceMotion]);

  const habits = shareable?.habits ?? [];
  const todayTasks = shareable?.today ?? [];
  const draftDaysResolved = useMemo(
    () => daysForChoice(draftChoice, draftDays),
    [draftChoice, draftDays],
  );
  const draftValid =
    !!draftText.trim() && (draftChoice === 'once' || draftDaysResolved.length > 0);

  const goBack = () => {
    setError(null);
    if (step === 'new') setStep('goal');
    else if (step === 'friend') setStep(goal?.kind === 'new' ? 'new' : 'goal');
    else if (step === 'send') {
      if (presetFriend) setStep(goal?.kind === 'new' ? 'new' : 'goal');
      else setStep('friend');
    } else onClose();
  };

  const afterGoal = () => {
    setError(null);
    setStep(presetFriend ? 'send' : 'friend');
  };

  const pickGoal = (next: Goal) => {
    hapticSelect();
    setGoal(next);
  };

  const pickTarget = (next: Target) => {
    hapticSelect();
    setTarget(next);
  };

  const confirmDraft = () => {
    if (!draftValid) return;
    setGoal({ kind: 'new', text: draftText.trim(), choice: draftChoice, days: draftDaysResolved });
    afterGoal();
  };

  const send = async () => {
    if (!goal || !target || sending) return;
    if (target.kind === 'link' && !giftId) return;
    setSending(true);
    setError(null);
    trackAnalyticsEvent('buddy_friend_picked', {
      source,
      method: target.kind === 'link' ? 'invite_link' : 'existing_friend',
    });
    trackAnalyticsEvent('buddy_goal_composed', {
      source,
      method: target.kind === 'link' ? 'invite_link' : 'existing_friend',
      kind: goal.kind,
      ...(goal.kind === 'new'
        ? { repeat_choice: goal.choice, day_count: goal.days.length }
        : {}),
    });
    try {
      if (target.kind === 'friend') {
        const res = await fetch('/api/buddy/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            goal.kind === 'new'
              ? {
                  friendId: target.friend.userId,
                  ...toBuddyCreateParams(goal.text, goal.choice, goal.days, todayYmd()),
                  timezone,
                }
              : { friendId: target.friend.userId, fromTaskId: goal.id, timezone },
          ),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || 'Could not send the invitation');
          return;
        }
        mutateFriendsCaches();
        mutateGlobal((key) => typeof key === 'string' && key.startsWith('/api/tasks'));
        setSent({ name: firstName(target.friend) });
        setStep('sent');
        return;
      }
      const res = await fetch('/api/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          goal.kind === 'new'
            ? {
                giftOptionId: giftId,
                buddyTask: toBuddyCreateParams(goal.text, goal.choice, goal.days, todayYmd()),
              }
            : { giftOptionId: giftId, buddyTaskFromId: goal.id },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not create the invite');
        return;
      }
      mutateFriendsCaches();
      const url = `${window.location.origin}/?ref=${encodeURIComponent(data.code)}`;
      const result = await shareInviteUrl(url, goal.text);
      setSent({ url, copiedOnly: result === 'copied' });
      setStep('sent');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  const tall = step === 'send' || step === 'sent';
  const bubble =
    step === 'sent'
      ? sent?.url
        ? 'Link ready! Send it to\nwhoever you want to team up with.'
        : `Sent! Toes crossed that\n${sent?.name ?? 'they'} says *yes!*`
      : step === 'send' && goal
        ? goal.kind === 'today' || (goal.kind === 'new' && goal.choice === 'once')
          ? "Wanna be my goal buddy?\nLet's get this done *together!*"
          : "Wanna be my goal buddy?\nLet's build this habit *together!*"
        : null;

  const footer = (() => {
    if (step === 'goal') {
      return (
        <PrimaryButton disabled={!goal} onClick={afterGoal}>
          Continue
        </PrimaryButton>
      );
    }
    if (step === 'new') {
      return (
        <PrimaryButton disabled={!draftValid} onClick={confirmDraft}>
          Continue
        </PrimaryButton>
      );
    }
    if (step === 'friend') {
      return (
        <PrimaryButton
          disabled={!target}
          onClick={() => {
            setError(null);
            setStep('send');
          }}
        >
          Continue
        </PrimaryButton>
      );
    }
    if (step === 'send') {
      return (
        <>
          {error && (
            <p className="mb-2 text-center text-[13px] font-bold text-rose-500">{error}</p>
          )}
          <PrimaryButton
            disabled={!goal || !target || sending || (wantsLink && !giftId)}
            onClick={() => void send()}
          >
            {sending && <Loader2 className="h-5 w-5 animate-spin" />}
            {wantsLink ? (
              <>
                {!sending && <Share2 className="h-5 w-5" strokeWidth={2.5} />}
                Share invite link
              </>
            ) : (
              'Send invitation'
            )}
          </PrimaryButton>
          <p className="mt-2.5 text-center text-[12.5px] font-semibold text-muted-foreground">
            {wantsLink ? 'Your link expires in 24 hours' : 'Your invite expires in 24 hours'}
          </p>
        </>
      );
    }
    if (sent?.url) {
      return (
        <>
          <PrimaryButton
            onClick={async () => {
              if (!sent.url || !goal) return;
              const result = await shareInviteUrl(sent.url, goal.text);
              setSent({ ...sent, copiedOnly: result === 'copied' });
            }}
          >
            <Share2 className="h-5 w-5" strokeWidth={2.5} />
            Share the link
          </PrimaryButton>
          <QuietButton onClick={onClose}>Done</QuietButton>
        </>
      );
    }
    return notifGranted ? (
      <PrimaryButton onClick={onClose}>
        <Check className="h-5 w-5" strokeWidth={3} />
        Done
      </PrimaryButton>
    ) : (
      <>
        <PrimaryButton
          onClick={async () => {
            await requestNotif();
            onClose();
          }}
        >
          <Bell className="h-5 w-5" strokeWidth={2.5} />
          Tell me when they accept
        </PrimaryButton>
        <QuietButton onClick={onClose}>Maybe later</QuietButton>
      </>
    );
  })();

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Share a goal with a friend"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={markEntered}
      className="fixed inset-0 z-[1400] flex flex-col overflow-hidden bg-background"
    >
      <SheetEnteredContext.Provider value={entered}>
        <PondHeader
          tall={tall}
          fill={space}
          indices={indices}
          frogRef={frogRef}
          bubble={bubble}
          target={tall ? target : null}
          onBack={step === 'sent' ? null : goBack}
          onClose={onClose}
        />
      </SheetEnteredContext.Provider>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div ref={bodyRef}>
          <AnimatePresence
            mode="wait"
            initial={false}
            onExitComplete={() => requestAnimationFrame(() => measureRef.current())}
          >
            <motion.div
              key={step}
              data-step={step}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -18 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-md px-4 pb-6 pt-2"
            >
              {step === 'goal' && (
                <GoalStep
                  loading={!shareable}
                  habits={habits}
                  todayTasks={todayTasks}
                  goal={goal}
                  onPick={pickGoal}
                  onNew={() => {
                    hapticSelect();
                    setStep('new');
                  }}
                />
              )}
              {step === 'new' && (
                <NewGoalStep
                  text={draftText}
                  choice={draftChoice}
                  customDays={draftDays}
                  onText={setDraftText}
                  onChoice={setDraftChoice}
                  onDays={setDraftDays}
                  onFocusChange={setInputFocused}
                  onSubmit={confirmDraft}
                />
              )}
              {step === 'friend' && (
                <FriendStep friends={friends} target={target} onPick={pickTarget} />
              )}
              {step === 'send' && goal && (
                <SendStep
                  goal={goal}
                  bonusFlies={bonusFlies}
                  wantsLink={wantsLink}
                  giftOptions={giftOptions}
                  giftId={giftId}
                  onGift={(id) => {
                    hapticSelect();
                    setGiftId(id);
                  }}
                />
              )}
              {step === 'sent' && goal && (
                <SentStep goal={goal} sent={sent} bonusFlies={bonusFlies} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div
        ref={footerRef}
        className="shrink-0 border-t border-border/50 bg-background px-4 pt-3"
        style={{
          paddingBottom: keyboardInset
            ? keyboardInset + 12
            : 'calc(env(safe-area-inset-bottom) + 1rem)',
        }}
      >
        <div className="mx-auto w-full max-w-md">{footer}</div>
      </div>
    </motion.div>
  );
}

function PondHeader({
  tall,
  fill,
  indices,
  frogRef,
  bubble,
  target,
  onBack,
  onClose,
}: {
  tall: boolean;
  fill: number;
  indices?: WardrobeIndices;
  frogRef: React.MutableRefObject<FrogHandle | null>;
  bubble: string | null;
  target: Target | null;
  onBack: (() => void) | null;
  onClose: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [landed, setLanded] = useState(false);
  const image = useMemo(
    () => readCachedBackground()?.images?.mobile || DEFAULT_BACKGROUND_IMAGES.mobile,
    [],
  );

  return (
    <div
      className="relative shrink-0 overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        height: tall
          ? `max(calc(env(safe-area-inset-top) + clamp(17rem, 42dvh, 21rem)), min(${fill}px, 66dvh))`
          : 'calc(env(safe-area-inset-top) + clamp(11rem, 26dvh, 13.5rem))',
      }}
    >
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-sky-300 via-emerald-200 to-emerald-300 dark:from-sky-950 dark:via-emerald-950 dark:to-emerald-900">
        {!failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover object-bottom"
          />
        )}
        <div className="absolute inset-0 dark:bg-black/20" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/35 to-transparent" />
      </div>

      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.625rem)]">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="grid h-10 w-10 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.75} />
          </button>
        ) : (
          <span className="h-10 w-10" />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-10 w-10 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" strokeWidth={2.75} />
        </button>
      </div>

      <AnimatePresence>
        {target && (
          <motion.div
            key="to"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 flex flex-col items-center gap-1.5"
          >
            <span className="text-[11px] font-black tracking-[0.14em] text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,0.35)]">
              TO
            </span>
            <span className="flex items-center gap-2 rounded-full bg-black/30 py-1 pl-1 pr-3.5 text-[14px] font-black text-white backdrop-blur-md">
              {target.kind === 'friend' ? (
                <BuddyFrogFace indices={target.friend.indices} size={28} className="bg-white/90" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[#447d3f]">
                  <Link2 className="h-4 w-4" strokeWidth={2.75} />
                </span>
              )}
              {target.kind === 'friend' ? target.friend.name || target.friend.frogName : 'Your invite link'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <svg
        aria-hidden
        preserveAspectRatio="none"
        viewBox="0 0 100 16"
        className="absolute inset-x-0 bottom-[-1px] z-10 h-5 w-full fill-background"
      >
        <path d="M0 8 Q50 -8 100 8 L100 16 L0 16 Z" />
      </svg>
      <span
        aria-hidden
        className="absolute bottom-[10px] left-1/2 z-10 h-3 w-28 -translate-x-1/2 rounded-[50%] bg-black/[0.14] blur-[5px] dark:bg-black/40"
      />

      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
        style={{ bottom: FROG_SEAT_PX }}
      >
        <Frog
          ref={frogRef}
          width={FROG_W}
          height={FROG_H}
          indices={indices}
          arrive="rise"
          greet="hop"
          onArrived={() => setLanded(true)}
        />
      </div>

      {bubble && landed && (
        <div
          className="pointer-events-none absolute inset-x-0 z-30 h-0"
          style={{ bottom: FROG_HEAD_PX + 8 }}
        >
          <FrogSpeechBubble rate={0} done={0} total={0} fixedMessage={bubble} className="!top-0" />
        </div>
      )}
    </div>
  );
}

function StepTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="px-2 pb-4 pt-2 text-center">
      <h2 className="text-balance text-[21px] font-black leading-tight tracking-tight text-foreground">
        {children}
      </h2>
      {sub && (
        <p className="mx-auto mt-1.5 max-w-[20rem] text-balance text-[13.5px] font-semibold leading-snug text-muted-foreground">
          {sub}
        </p>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-5 px-1 text-[12.5px] font-black text-muted-foreground">
      {children}
    </p>
  );
}

function ChoiceRow({
  selected,
  onClick,
  leading,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  leading: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-[20px] border-2 bg-card py-2.5 pl-2.5 pr-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#447d3f]/40',
        selected
          ? 'border-[#447d3f] bg-[#447d3f]/[0.06]'
          : 'border-border/60 [@media(hover:hover)]:hover:border-[#447d3f]/35',
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-black leading-tight tracking-tight text-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-150',
          selected ? 'border-[#447d3f] bg-[#447d3f] text-white' : 'border-border',
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" strokeWidth={4} />}
      </span>
    </button>
  );
}

function IconWell({ tone, children }: { tone: 'green' | 'amber'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-2xl',
        tone === 'green'
          ? 'bg-[#447d3f]/10 text-[#447d3f] dark:bg-emerald-400/15 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300',
      )}
    >
      {children}
    </span>
  );
}

function GoalStep({
  loading,
  habits,
  todayTasks,
  goal,
  onPick,
  onNew,
}: {
  loading: boolean;
  habits: ShareableTask[];
  todayTasks: ShareableTask[];
  goal: Goal | null;
  onPick: (goal: Goal) => void;
  onNew: () => void;
}) {
  const selectedId = goal && goal.kind !== 'new' ? goal.id : null;
  return (
    <>
      <StepTitle>What do you want to do together?</StepTitle>

      <button
        type="button"
        onClick={onNew}
        className="flex w-full items-center gap-3 rounded-[20px] border-2 border-dashed border-[#447d3f]/40 bg-[#447d3f]/[0.04] py-2.5 pl-2.5 pr-3.5 text-left transition-transform active:scale-[0.985]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#447d3f] text-white">
          <Plus className="h-5 w-5" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1 text-[15.5px] font-black tracking-tight text-foreground">
          Start a new goal
        </span>
      </button>

      {loading ? (
        <div className="mt-5 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[66px] rounded-[20px] bg-muted/60" />
          ))}
        </div>
      ) : (
        <div role="radiogroup" aria-label="Your tasks">
          {habits.length > 0 && (
            <>
              <SectionLabel>Your habits</SectionLabel>
              <div className="space-y-2">
                {habits.map((task) => (
                  <ChoiceRow
                    key={task.id}
                    selected={selectedId === task.id}
                    onClick={() => onPick({ kind: 'habit', ...task })}
                    leading={
                      <IconWell tone="green">
                        <Repeat className="h-5 w-5" strokeWidth={2.5} />
                      </IconWell>
                    }
                    title={task.text}
                    subtitle={task.schedule}
                  />
                ))}
              </div>
            </>
          )}
          {todayTasks.length > 0 && (
            <>
              <SectionLabel>Today</SectionLabel>
              <div className="space-y-2">
                {todayTasks.map((task) => (
                  <ChoiceRow
                    key={task.id}
                    selected={selectedId === task.id}
                    onClick={() => onPick({ kind: 'today', ...task })}
                    leading={
                      <IconWell tone="amber">
                        <Sun className="h-5 w-5" strokeWidth={2.5} />
                      </IconWell>
                    }
                    title={task.text}
                    subtitle="Today"
                  />
                ))}
              </div>
            </>
          )}
          {habits.length === 0 && todayTasks.length === 0 && (
            <p className="mt-5 px-4 text-center text-[13.5px] font-semibold text-muted-foreground">
              Nothing on your list to share yet. Start a new goal above.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function NewGoalStep({
  text,
  choice,
  customDays,
  onText,
  onChoice,
  onDays,
  onFocusChange,
  onSubmit,
}: {
  text: string;
  choice: BuddyRepeatChoice;
  customDays: number[];
  onText: (text: string) => void;
  onChoice: (choice: BuddyRepeatChoice) => void;
  onDays: (days: number[]) => void;
  onFocusChange: (focused: boolean) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const presetId = BUDDY_PRESETS.find((preset) => preset.text === text.trim())?.id ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 280);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <StepTitle>What will you both do?</StepTitle>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => onText(event.target.value)}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          enterKeyHint="done"
          maxLength={120}
          placeholder="e.g. Walk 30 minutes"
          aria-label="Goal"
          className="h-[54px] w-full rounded-2xl border-2 border-border/60 bg-card px-4 text-[17px] font-bold tracking-tight text-foreground placeholder:font-semibold placeholder:text-muted-foreground/50 focus:border-[#447d3f]/60 focus:outline-none focus:ring-4 focus:ring-[#447d3f]/10"
        />
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {BUDDY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              hapticSelect();
              onText(preset.text);
              onChoice(preset.repeat);
              onDays(preset.days ?? []);
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-black tracking-tight transition-colors',
              presetId === preset.id
                ? 'border-[#447d3f] bg-[#447d3f]/10 text-[#447d3f]'
                : 'border-border/60 bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <span aria-hidden>{preset.emoji}</span>
            {preset.text}
          </button>
        ))}
      </div>

      <SectionLabel>How often</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {REPEAT_OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            onClick={() => {
              hapticSelect();
              onChoice(value);
            }}
            className={cn(
              'h-11 rounded-2xl border-2 text-[13.5px] font-black tracking-tight transition-colors',
              choice === value
                ? 'border-[#447d3f] bg-[#447d3f]/10 text-[#447d3f]'
                : 'border-border/60 bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {choice === 'custom' && (
        <div className="mt-2 flex justify-between gap-1">
          {DAY_LABELS.map((label, day) => {
            const on = customDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onDays(on ? customDays.filter((d) => d !== day) : [...customDays, day])
                }
                className={cn(
                  'h-10 flex-1 rounded-xl text-[13px] font-black transition-colors',
                  on
                    ? 'bg-[#447d3f] text-white'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function FriendStep({
  friends,
  target,
  onPick,
}: {
  friends: FriendSummary[];
  target: Target | null;
  onPick: (target: Target) => void;
}) {
  const selectedId = target?.kind === 'friend' ? target.friend.userId : null;
  return (
    <>
      <StepTitle sub="You'll see each other's progress on this goal.">
        Who do you want to do it with?
      </StepTitle>
      <div role="radiogroup" aria-label="Friends" className="space-y-2">
        {friends.map((friend) => (
          <ChoiceRow
            key={friend.userId}
            selected={selectedId === friend.userId}
            onClick={() => onPick({ kind: 'friend', friend })}
            leading={<BuddyFrogFace indices={friend.indices} size={FACE_PX} className="shrink-0" />}
            title={friend.name || friend.frogName}
            subtitle={friend.frogName && friend.frogName !== friend.name ? friend.frogName : undefined}
          />
        ))}
        <ChoiceRow
          selected={target?.kind === 'link'}
          onClick={() => onPick({ kind: 'link' })}
          leading={
            <IconWell tone="green">
              <Link2 className="h-5 w-5" strokeWidth={2.5} />
            </IconWell>
          }
          title="Someone not on Frogress"
          subtitle="Send a link with a gift outfit"
        />
      </div>
    </>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const repeating = goal.kind === 'habit' || (goal.kind === 'new' && goal.choice !== 'once');
  return (
    <div className="flex items-center gap-3 rounded-[20px] border-2 border-[#447d3f]/30 bg-card py-2.5 pl-2.5 pr-3.5">
      <IconWell tone={repeating ? 'green' : 'amber'}>
        {repeating ? (
          <Repeat className="h-5 w-5" strokeWidth={2.5} />
        ) : (
          <Sun className="h-5 w-5" strokeWidth={2.5} />
        )}
      </IconWell>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-black leading-tight tracking-tight text-foreground">
          {goal.text}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-muted-foreground">
          {goalSchedule(goal)}
        </span>
      </span>
    </div>
  );
}

function BonusLine({ bonusFlies }: { bonusFlies: number }) {
  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-amber-50 px-3 py-2.5 dark:bg-amber-400/10">
      <span className="grid h-9 w-9 shrink-0 place-items-center">
        <Fly size={34} y={-2} paused interactive={false} />
      </span>
      <p className="text-balance text-[13px] font-semibold leading-snug text-amber-900 dark:text-amber-200">
        When you both finish it, you each get{' '}
        <span className="whitespace-nowrap font-black">+{bonusFlies} flies.</span>
      </p>
    </div>
  );
}

function SendStep({
  goal,
  bonusFlies,
  wantsLink,
  giftOptions,
  giftId,
  onGift,
}: {
  goal: Goal;
  bonusFlies: number;
  wantsLink: boolean;
  giftOptions?: BuddyGiftOption[];
  giftId: string | null;
  onGift: (id: string) => void;
}) {
  return (
    <div className="pt-3">
      <GoalCard goal={goal} />
      <BonusLine bonusFlies={bonusFlies} />
      {wantsLink && (
        <>
          <SectionLabel>Their welcome gift</SectionLabel>
          {giftOptions ? (
            <div className="grid grid-cols-3 gap-2">
              {giftOptions.map((gift) => {
                const selected = giftId === gift.id;
                return (
                  <button
                    key={gift.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={'Choose ' + gift.name}
                    onClick={() => onGift(gift.id)}
                    className={cn(
                      'flex min-w-0 flex-col overflow-hidden rounded-[18px] border-2 bg-card p-1.5 text-left transition-[border-color,transform] active:scale-95',
                      selected ? 'border-[#447d3f] ring-4 ring-inset ring-[#447d3f]/15' : 'border-border/50',
                    )}
                  >
                    <span className="block aspect-square w-full overflow-hidden rounded-xl bg-muted/40">
                      <GiftOutfitPreview item={gift.item} ready />
                    </span>
                    <span className="mt-1.5 truncate text-[11px] font-black leading-tight text-foreground">
                      {gift.name}
                    </span>
                    <RarityBadge rarity={gift.item?.rarity} className="mt-1" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div aria-hidden className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-[18px] border-2 border-border/50 bg-card p-1.5">
                  <div className="skeleton aspect-square w-full rounded-xl bg-muted/60" />
                  <div className="skeleton mt-1.5 h-3 w-3/4 rounded bg-muted/60" />
                  <div className="skeleton mt-1 h-4 w-12 rounded-full bg-muted/60" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SentStep({ goal, sent, bonusFlies }: { goal: Goal; sent: Sent | null; bonusFlies: number }) {
  return (
    <div className="pt-3 text-center">
      <h2 className="text-[21px] font-black leading-tight tracking-tight text-foreground">
        {sent?.url ? 'Invite link ready!' : `Invitation sent to ${sent?.name ?? 'your friend'}!`}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[20rem] text-balance text-[13.5px] font-semibold leading-snug text-muted-foreground">
        {sent?.url
          ? sent.copiedOnly
            ? `We copied it for you. Once they join, you'll do “${goal.text}” together.`
            : `Once they join, you'll do “${goal.text}” together.`
          : `“${goal.text}” is on your list, waiting for ${sent?.name ?? 'them'}. You'll each get +${bonusFlies} flies when you both finish it.`}
      </p>
    </div>
  );
}

const PrimaryButton = React.forwardRef<
  HTMLButtonElement,
  { children: React.ReactNode; onClick?: () => void; disabled?: boolean }
>(function PrimaryButton({ children, onClick, disabled }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#447d3f] text-[17px] font-black tracking-tight text-white shadow-[0_4px_0_#2c511a] transition-all active:translate-y-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-45"
    >
      {children}
    </button>
  );
});

function QuietButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1.5 h-11 w-full rounded-2xl text-[15px] font-black tracking-tight text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}
