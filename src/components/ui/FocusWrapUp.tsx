'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR, { mutate as mutateCache } from 'swr';
import { format } from 'date-fns';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { Check, ChevronsUpDown, Coffee, Play, Plus, Sparkles, X, Zap } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { FlyIcon } from '@/components/ui/FlyAmount';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useInventory } from '@/hooks/useInventory';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { hapticSelect, hapticSuccess, hapticTick } from '@/lib/haptics';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { BREAK_PRESETS, FOCUS_PRESETS, useFrogodoroStore } from '@/lib/frogodoroStore';
import { fliesCaughtFor, priorDayFocusSeconds } from '@/lib/focusFlies';
import { subjectHeadline, type FocusSubjectKind } from '@/lib/focusSubject';
import { openingBeat, pickWrapUpLine } from '@/lib/focusWrapUpVoice';
import type { Claimable, Trackable } from '@/lib/questClaims';
import { cn } from '@/lib/utils';

export type PendingReview = {
  id: string;
  date: string;
  subjectKind: FocusSubjectKind;
  subjectId: string;
  subjectLabel: string;
  subjectTags: string[];
  focusSeconds: number;
  breakSeconds: number;
};

export type ReviewOutcome =
  | { kind: 'break'; seconds: number }
  | { kind: 'focus'; seconds: number }
  | { kind: 'done' };

export type WrapUpOrigin = { top: number; right: number; bottom: number; left: number };

export type WrapUpScene = {
  later: boolean;
  origin: WrapUpOrigin | null;
  sessionFocusSeconds: number | null;
  bonusFly: boolean;
  nextLocked: boolean;
};

type ReviewTask = { id: string; text: string; completed: boolean; tags?: string[] };

type QuestHome = { claimables?: Claimable[]; trackables?: Trackable[] };

const Z_INDEX = 10060;
const WIDE_QUERY = '(min-width: 1024px)';
const CLOSE_SHIELD_MS = 450;
const OTHERS_SHOWN = 4;
const BREAK_IDEA_DELAY_MS = 6500;
const CHEER_MS = 2600;
const LONG_FOCUS_SECONDS = 45 * 60;
const EXPAND_EASE = [0.32, 0.72, 0, 1] as const;
const SOFT_EASE = [0.22, 1, 0.36, 1] as const;
const POP = { type: 'spring', stiffness: 420, damping: 22 } as const;

function questHomeKey() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return `/api/quests?view=home&timezone=${encodeURIComponent(tz)}`;
}

function focusAmount(seconds: number) {
  if (seconds < 60) {
    const value = Math.max(1, Math.round(seconds));
    return { value, unit: 'sec', spoken: value === 1 ? 'second' : 'seconds' };
  }
  const value = Math.round(seconds / 60);
  return { value, unit: 'min', spoken: value === 1 ? 'minute' : 'minutes' };
}

function nextPreset(presets: number[], current: number) {
  return presets.find((preset) => preset > current) ?? presets[0];
}

function clipFrom(origin: WrapUpOrigin) {
  return `inset(${origin.top}px ${origin.right}px ${origin.bottom}px ${origin.left}px round 28px)`;
}

function CountUp({ value, run }: { value: number; run: boolean }) {
  const count = useMotionValue(run ? 0 : value);
  const shown = useTransform(count, (v) => Math.round(v).toString());
  useEffect(() => {
    if (!run) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, {
      duration: Math.min(1.1, 0.45 + value / 90),
      delay: 0.25,
      ease: SOFT_EASE,
    });
    return () => controls.stop();
  }, [count, value, run]);
  return <motion.span>{shown}</motion.span>;
}

function Ripples() {
  return (
    <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-[50%] border-[3px] border-white/60"
          style={{ width: 240, height: 48, left: -120, top: -24 }}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 1.3], opacity: [0, 0.9, 0] }}
          transition={{
            delay: 0.55 + i * 0.17,
            duration: 1.15,
            ease: 'easeOut',
            opacity: { delay: 0.55 + i * 0.17, duration: 1.15, times: [0, 0.18, 1] },
          }}
        />
      ))}
    </div>
  );
}

const BURST_COLORS = ['bg-white', 'bg-amber-300', 'bg-white', 'bg-sky-200'];

function Burst({ count = 10, radius = 96, delay = 0.55, size = 8 }) {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-[72%] h-0 w-0">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const reach = radius * (0.75 + ((i * 37) % 10) / 40);
        return (
          <motion.span
            key={i}
            className={cn('absolute rounded-full', BURST_COLORS[i % BURST_COLORS.length])}
            style={{ width: size, height: size, left: -size / 2, top: -size / 2 }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
            animate={{
              x: Math.cos(angle) * reach,
              y: Math.sin(angle) * reach * 0.8,
              scale: [0.4, 1, 0.3],
              opacity: [0, 1, 0],
            }}
            transition={{ delay, duration: 0.85, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

function TaskCheckRow({
  task,
  done,
  big = false,
  onToggle,
}: {
  task: ReviewTask;
  done: boolean;
  big?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-[20px] border-2 px-3.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:translate-y-[2px] active:shadow-none',
        big ? 'min-h-[64px] py-3' : 'min-h-[54px] py-2',
        done
          ? 'border-primary/45 bg-primary/10 shadow-[0_3px_0_0_hsl(var(--primary)/0.25)]'
          : 'border-border bg-card shadow-[0_3px_0_0_hsl(var(--border))] hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'relative grid shrink-0 place-items-center rounded-full border-[2.5px] transition-colors duration-150',
          big ? 'h-8 w-8' : 'h-7 w-7',
          done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
        )}
      >
        <AnimatePresence initial={false}>
          {done && (
            <motion.span
              key="check"
              initial={{ scale: 0, rotate: -35 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 640, damping: 24 }}
            >
              <Check className={big ? 'h-[18px] w-[18px]' : 'h-4 w-4'} strokeWidth={3.5} />
            </motion.span>
          )}
        </AnimatePresence>
        {done && <Burst count={6} radius={big ? 26 : 22} delay={0} size={5} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="relative inline-block max-w-full align-middle">
          <span
            className={cn(
              'block truncate transition-colors duration-200',
              big ? 'text-[17px] font-black' : 'text-[15px] font-bold',
              done ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {task.text}
          </span>
          <motion.span
            aria-hidden
            className="absolute left-0 top-1/2 h-[2px] w-full rounded-full bg-muted-foreground/70"
            style={{ originX: 0 }}
            initial={false}
            animate={{ scaleX: done ? 1 : 0 }}
            transition={{ duration: 0.28, ease: SOFT_EASE }}
          />
        </span>
      </span>
    </button>
  );
}

function NextButton({
  tone,
  primary,
  icon,
  label,
  minutes,
  onCycle,
  onStart,
}: {
  tone: 'break' | 'focus';
  primary: boolean;
  icon: React.ReactNode;
  label: string;
  minutes: number;
  onCycle: () => void;
  onStart: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const surface =
    tone === 'break'
      ? primary
        ? 'bg-sky-500 text-white shadow-[0_5px_0_0_#0369a1] dark:bg-sky-600 dark:shadow-[0_5px_0_0_#075985]'
        : 'bg-sky-500/10 text-sky-700 shadow-[0_3px_0_0_rgba(2,132,199,0.22)] dark:bg-sky-400/15 dark:text-sky-300'
      : primary
        ? 'bg-primary text-primary-foreground shadow-[0_5px_0_0_#2c511a]'
        : 'bg-primary/10 text-primary shadow-[0_3px_0_0_hsl(var(--primary)/0.25)] dark:bg-primary/15';
  const release = () => setPressed(false);
  return (
    <div
      className={cn(
        'flex w-full items-center rounded-2xl transition-[transform,box-shadow] duration-100',
        primary ? 'h-[58px]' : 'h-[52px]',
        surface,
        pressed && (primary ? 'translate-y-[5px] !shadow-none' : 'translate-y-[3px] !shadow-none'),
      )}
    >
      <button
        type="button"
        onClick={onStart}
        onPointerDown={() => setPressed(true)}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-l-2xl pl-4 text-left text-[17px] font-black tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current"
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={onCycle}
        aria-label={`${label} length: ${minutes} minutes. Tap to change.`}
        className={cn(
          'mr-2 flex h-10 shrink-0 items-center gap-1 rounded-xl pl-3 pr-2 text-[15px] font-black tabular-nums transition-[background-color,transform] active:scale-95',
          primary ? 'bg-white/20 hover:bg-white/30' : 'bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15',
        )}
      >
        <span className="relative inline-flex h-5 min-w-[1.3em] justify-end overflow-hidden leading-5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={minutes}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 34 }}
            >
              {minutes}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="text-[13px] opacity-80">min</span>
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
      </button>
    </div>
  );
}

export function FocusWrapUp({
  open,
  review,
  scene,
  onAcknowledge,
  onOutcome,
}: Readonly<{
  open: boolean;
  review: PendingReview | null;
  scene: WrapUpScene | null;
  onAcknowledge: () => void;
  onOutcome: (outcome: ReviewOutcome) => void;
}>) {
  const reduceMotion = !!useReducedMotion();
  const wide = useMediaQuery(WIDE_QUERY);
  const compact = useMediaQuery('(max-height: 740px)');
  const [mounted, setMounted] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [finishedIds, setFinishedIds] = useState<Set<string>>(new Set());
  const [othersOpen, setOthersOpen] = useState(false);
  const [showAllOthers, setShowAllOthers] = useState(false);
  const [entered, setEntered] = useState(false);
  const [frogDressed, setFrogDressed] = useState(false);
  const [cheering, setCheering] = useState(false);
  const [openingLine, setOpeningLine] = useState('');
  const [line, setLine] = useState('');
  const [shielded, setShielded] = useState(false);
  const finishedRef = useRef(false);
  const acknowledgedRef = useRef(false);
  const interactedRef = useRef(false);
  const frogRef = useRef<FrogHandle>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = open && !!review && !!scene;

  useEffect(() => setMounted(true), []);
  useEffect(
    () => () => {
      if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current);
    },
    [],
  );

  useRegisterOpenSheet(visible);
  const { indices: wardrobeIndices } = useWardrobeIndices(visible);
  const frogIndices = useMemo(() => ({ ...wardrobeIndices, mood: 0 }), [wardrobeIndices]);

  useEffect(() => {
    if (!visible || !review || !scene) return;
    finishedRef.current = false;
    acknowledgedRef.current = false;
    interactedRef.current = false;
    setFinishedIds(new Set());
    setOthersOpen(false);
    setShowAllOthers(false);
    setEntered(false);
    setFrogDressed(false);
    setCheering(false);
    setLine('');
    setOpeningLine(
      pickWrapUpLine(
        openingBeat(review.focusSeconds, scene.later),
        review.subjectKind === 'task' ? review.subjectLabel : null,
      ),
    );
    const settings = useFrogodoroStore.getState().settings;
    setBreakMinutes(Math.max(1, Math.round(settings.breakDuration)) || 5);
    setFocusMinutes(Math.max(1, Math.round(settings.focusDuration)) || 25);
    const t = window.setTimeout(() => setEntered(true), reduceMotion ? 200 : 650);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, review?.id]);

  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => dialogRef.current?.focus({ preventScroll: true }), 60);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [visible]);

  useEffect(() => {
    if (!frogDressed) return;
    setCheering(true);
    const t = window.setTimeout(() => setCheering(false), CHEER_MS);
    return () => window.clearTimeout(t);
  }, [frogDressed]);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: taskData } = useSWR<{ tasks?: ReviewTask[] }>(
    visible ? `/api/tasks?date=${today}&timezone=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const { data: questData } = useSWR<QuestHome>(
    visible ? questHomeKey() : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const sessionFocusSeconds = scene?.sessionFocusSeconds ?? null;
  const { data: inventory } = useInventory(visible && sessionFocusSeconds !== null, true);

  const fliesCaught = useMemo(() => {
    if (sessionFocusSeconds === null || !inventory) return 0;
    return fliesCaughtFor(
      sessionFocusSeconds,
      priorDayFocusSeconds(inventory.wardrobe?.focusFlyDaily, sessionFocusSeconds),
    );
  }, [inventory, sessionFocusSeconds]);

  const { subjectTask, others } = useMemo(() => {
    if (!review) return { subjectTask: null, others: [] as ReviewTask[] };
    const pending = (taskData?.tasks ?? []).filter(
      (t) => !t.completed || finishedIds.has(t.id),
    );
    const subject =
      review.subjectKind === 'task'
        ? pending.find((t) => t.id === review.subjectId) ?? null
        : null;
    const tags = review.subjectTags.length > 0 ? review.subjectTags : subject?.tags ?? [];
    const related = (t: ReviewTask) => (tags.some((tag) => t.tags?.includes(tag)) ? 0 : 1);
    const rest = pending
      .filter((t) => t.id !== subject?.id)
      .sort((a, b) => related(a) - related(b));
    return { subjectTask: subject, others: rest };
  }, [taskData?.tasks, review, finishedIds]);

  const focusQuest = useMemo(() => {
    const quests = (questData?.trackables ?? []).filter(
      (t) => t.objectiveType === 'focus_minutes' && !t.needsFocusTags && t.target > 0,
    );
    quests.sort((a, b) => b.progress / b.target - a.progress / a.target);
    return quests[0] ?? null;
  }, [questData?.trackables]);
  const questReady = useMemo(
    () =>
      (questData?.claimables ?? []).some((c) =>
        (c.objectiveLabel ?? '').startsWith('Focus for'),
      ),
    [questData?.claimables],
  );

  const breakFirst = (review?.breakSeconds ?? 0) <= 0;
  const breakIdeaAllowed = visible && breakFirst && !scene?.nextLocked;

  useEffect(() => {
    if (!frogDressed || !breakIdeaAllowed) return;
    const t = window.setTimeout(() => {
      if (interactedRef.current) return;
      setLine(pickWrapUpLine('breakIdea', null));
    }, BREAK_IDEA_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [frogDressed, breakIdeaAllowed]);

  const raiseShield = () => {
    if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current);
    setShielded(true);
    shieldTimerRef.current = setTimeout(() => {
      shieldTimerRef.current = null;
      setShielded(false);
    }, CLOSE_SHIELD_MS);
  };

  const acknowledge = useCallback(() => {
    if (acknowledgedRef.current) return;
    acknowledgedRef.current = true;
    onAcknowledge();
  }, [onAcknowledge]);

  const toggleFinished = (task: ReviewTask, isSubject: boolean) => {
    interactedRef.current = true;
    const nowDone = !finishedIds.has(task.id);
    const next = new Set(finishedIds);
    if (nowDone) next.add(task.id);
    else next.delete(task.id);
    setFinishedIds(next);
    if (nowDone) {
      hapticSuccess();
      frogRef.current?.fireEmote(isSubject ? 'celebrate' : 'hop');
      setLine(
        isSubject
          ? pickWrapUpLine('subjectDone', task.text)
          : pickWrapUpLine('otherDone', null),
      );
    } else {
      hapticTick();
      if (next.size === 0) setLine('');
    }
  };

  const completeFinishedTasks = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return;
      for (const taskId of taskIds) {
        try {
          await fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, date: today, completed: true, timezone }),
          });
        } catch {}
      }
      void mutateCache(
        (key) => typeof key === 'string' && key.startsWith('/api/tasks'),
      );
    },
    [today, timezone],
  );

  const settleReview = useCallback(
    async (taskIds: string[]) => {
      if (!review) return;
      try {
        await fetch('/api/frogodoro/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: review.id, taskIds }),
        });
      } catch {}
    },
    [review],
  );

  const finish = (outcome: ReviewOutcome) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    acknowledge();
    hapticSelect();
    raiseShield();
    const taskIds = Array.from(finishedIds);
    void completeFinishedTasks(taskIds);
    void settleReview(taskIds);
    onOutcome(outcome);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishRef.current({ kind: 'done' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!mounted) return null;

  const content = (() => {
    if (!review || !scene) return null;
    const amount = focusAmount(review.focusSeconds);
    const headline = subjectHeadline(review.subjectKind, review.subjectLabel);
    const subtitle = review.subjectKind === 'open' ? 'of focus' : `on ${headline}`;
    const frogWidth = !wide && compact ? 168 : 200;
    const frogHeight = Math.round(frogWidth * 1.125);
    const spokenLine = line || openingLine;
    const checkedOthers = others.filter((t) => finishedIds.has(t.id)).length;
    const visibleOthers = showAllOthers ? others : others.slice(0, OTHERS_SHOWN);
    const hiddenOthers = others.length - visibleOthers.length;
    const tasksLoading = !taskData;
    const showFly = fliesCaught > 0;
    const questTarget = focusQuest ? Math.max(1, focusQuest.target) : 1;
    const questTo = focusQuest ? Math.min(1, focusQuest.progress / questTarget) : 0;
    const questFrom = focusQuest
      ? Math.min(
          questTo,
          Math.max(0, (focusQuest.progress - Math.max(1, Math.floor(review.focusSeconds / 60))) / questTarget),
        )
      : 0;
    const rise = (delay: number) =>
      reduceMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
        : {
            initial: { opacity: 0, y: 12 },
            animate: { opacity: 1, y: 0 },
            transition: { delay, duration: 0.42, ease: SOFT_EASE },
          };

    const breakButton = (
      <NextButton
        tone="break"
        primary={breakFirst}
        icon={<Coffee className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
        label="Take a break"
        minutes={breakMinutes}
        onCycle={() => {
          interactedRef.current = true;
          hapticTick();
          setBreakMinutes((m) => nextPreset(BREAK_PRESETS, m));
        }}
        onStart={() => finish({ kind: 'break', seconds: breakMinutes * 60 })}
      />
    );
    const focusButton = (
      <NextButton
        tone="focus"
        primary={!breakFirst}
        icon={<Play className="h-[18px] w-[18px] shrink-0 fill-current" aria-hidden="true" />}
        label="Keep going"
        minutes={focusMinutes}
        onCycle={() => {
          interactedRef.current = true;
          hapticTick();
          setFocusMinutes((m) => nextPreset(FOCUS_PRESETS, m));
        }}
        onStart={() => finish({ kind: 'focus', seconds: focusMinutes * 60 })}
      />
    );

    const othersList = (
      <div className="flex flex-col gap-2 pb-1">
        {visibleOthers.map((task) => (
          <TaskCheckRow
            key={task.id}
            task={task}
            done={finishedIds.has(task.id)}
            onToggle={() => toggleFinished(task, false)}
          />
        ))}
        {hiddenOthers > 0 && (
          <button
            type="button"
            onClick={() => {
              hapticTick();
              setShowAllOthers(true);
            }}
            className="h-10 rounded-xl text-[13px] font-black text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            Show {hiddenOthers} more
          </button>
        )}
      </div>
    );

    const closeButton = (
      <button
        type="button"
        onClick={() => finish({ kind: 'done' })}
        aria-label="Close"
        className={cn(
          'grid place-items-center rounded-full bg-white/20 text-white transition-[background-color,transform] hover:bg-white/30 active:scale-95',
          wide ? 'h-11 w-11' : 'h-10 w-10',
        )}
      >
        <X className="h-5 w-5" strokeWidth={2.75} />
      </button>
    );

    const heroStats = (
      <>
        <motion.h2
          id="focus-wrapup-title"
          aria-label={`${amount.value} ${amount.spoken} ${subtitle}`}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0.2 } : { ...POP, delay: 0.18 }}
          className={cn(
            'flex items-baseline',
            wide ? 'origin-left gap-3' : 'justify-center gap-2',
          )}
        >
          <span
            className={cn(
              'font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums',
              wide ? 'text-[136px]' : compact ? 'text-[68px]' : 'text-[84px]',
            )}
          >
            <CountUp value={amount.value} run={!reduceMotion} />
          </span>
          <span
            className={cn(
              'font-black leading-none tracking-tight text-white/80 drop-shadow-lg',
              wide ? 'text-[40px]' : compact ? 'text-[24px]' : 'text-[28px]',
            )}
          >
            {amount.unit}
          </span>
        </motion.h2>
        <motion.p
          {...rise(0.3)}
          className={cn(
            'font-black text-white/85',
            wide
              ? 'mt-1 line-clamp-2 max-w-[26rem] text-[22px] leading-snug'
              : 'mt-2.5 max-w-[19rem] truncate text-[15px]',
          )}
          aria-hidden="true"
        >
          {subtitle}
        </motion.p>

        {(showFly || scene.bonusFly || questReady) && (
          <div
            className={cn(
              'flex flex-wrap items-center gap-2',
              wide ? 'mt-6' : 'mt-3 justify-center',
            )}
          >
            {showFly && (
              <motion.span
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduceMotion ? { duration: 0.2 } : { ...POP, delay: 0.8 }}
                className="flex h-8 items-center gap-1.5 rounded-full bg-black/20 pl-2.5 pr-3 text-[13px] font-black text-white"
              >
                <FlyIcon textPx={14} />+{fliesCaught} {fliesCaught === 1 ? 'fly' : 'flies'} caught
              </motion.span>
            )}
            {scene.bonusFly && (
              <motion.span
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduceMotion ? { duration: 0.2 } : { ...POP, delay: 0.92 }}
                className="flex h-8 items-center gap-1.5 rounded-full bg-amber-300 pl-2.5 pr-3 text-[13px] font-black text-amber-950"
              >
                <Zap className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                +1 fly · Deep focus
              </motion.span>
            )}
            {questReady && (
              <motion.span
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduceMotion ? { duration: 0.2 } : { ...POP, delay: 1.02 }}
                className="flex h-8 items-center gap-1.5 rounded-full bg-amber-300 pl-2.5 pr-3 text-[13px] font-black text-amber-950"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Quest reward ready!
              </motion.span>
            )}
          </div>
        )}

        {focusQuest && (wide || !compact) && !questReady && (
          <motion.div
            {...rise(0.95)}
            className={cn(
              'w-full rounded-2xl bg-black/15 px-3.5 py-2.5 text-left',
              wide ? 'mt-6 max-w-[360px]' : 'mt-3 max-w-[300px]',
            )}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="truncate text-[12px] font-black text-white/90">
                {focusQuest.objectiveLabel}
              </p>
              <p className="shrink-0 text-[12px] font-black tabular-nums text-white">
                {Math.min(focusQuest.progress, questTarget)}/{questTarget}
              </p>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/25">
              <motion.div
                className="h-full w-full rounded-full bg-white"
                style={{ originX: 0 }}
                initial={{ scaleX: reduceMotion ? questTo : questFrom }}
                animate={{ scaleX: questTo }}
                transition={{ delay: 1.1, duration: 0.9, ease: SOFT_EASE }}
              />
            </div>
          </motion.div>
        )}
      </>
    );

    const frogStage = (
      <div
        className="pointer-events-none relative z-20"
        style={{
          width: frogWidth,
          height: frogHeight,
          marginTop: wide ? 0 : -Math.round(frogHeight * 0.22),
          marginBottom: -10,
        }}
      >
        {frogDressed && spokenLine && (
          <FrogSpeechBubble
            rate={0}
            done={0}
            total={0}
            fixedMessage={spokenLine}
            className={frogWidth === 168 ? '!top-[105px]' : '!top-[125px]'}
          />
        )}
        {!reduceMotion && <Burst />}
        <motion.div
          className="absolute inset-0"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -40, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : { delay: 0.42, type: 'spring', stiffness: 380, damping: 19 }
          }
        >
          {!frogDressed && (
            <FrogSnapshot
              indices={frogIndices}
              width={frogWidth}
              height={frogHeight}
              className="absolute inset-0"
            />
          )}
          {entered && (
            <div className="absolute inset-0">
              <Frog
                ref={frogRef}
                width={frogWidth}
                height={frogHeight}
                indices={frogIndices}
                emote={cheering ? 'love' : null}
                greet={(review?.focusSeconds ?? 0) >= LONG_FOCUS_SECONDS ? 'tada' : 'celebrate'}
                ignoreIdlePause
                onDressed={() => setFrogDressed(true)}
              />
            </div>
          )}
        </motion.div>
      </div>
    );

    const panelBody = (
      <>
        {(tasksLoading || subjectTask || others.length > 0) && (
          <motion.section {...rise(0.4)} aria-labelledby="focus-wrapup-tasks" className="mb-5">
            <h3
              id="focus-wrapup-tasks"
              className="mb-3 px-0.5 text-[19px] font-black tracking-[-0.01em] text-foreground"
            >
              {subjectTask || (tasksLoading && review.subjectKind === 'task')
                ? 'Did you finish?'
                : 'Did you finish anything?'}
            </h3>

            {tasksLoading ? (
              <div className="h-16 animate-pulse rounded-[20px] bg-muted" />
            ) : subjectTask ? (
              <>
                <TaskCheckRow
                  task={subjectTask}
                  done={finishedIds.has(subjectTask.id)}
                  big
                  onToggle={() => toggleFinished(subjectTask, true)}
                />
                {others.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        hapticTick();
                        setOthersOpen((v) => !v);
                      }}
                      aria-expanded={othersOpen}
                      className="flex h-11 w-full items-center gap-2.5 rounded-2xl px-1 text-[14px] font-black text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <motion.span
                        animate={{ rotate: othersOpen ? 45 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                        className="grid h-7 w-7 place-items-center rounded-full bg-muted"
                      >
                        <Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                      </motion.span>
                      {!othersOpen && checkedOthers > 0
                        ? `${checkedOthers} more done`
                        : 'Finished something else?'}
                    </button>
                    <AnimatePresence initial={false}>
                      {othersOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.26, ease: SOFT_EASE }}
                          className="overflow-hidden"
                        >
                          <div className="pt-1">{othersList}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </>
            ) : (
              othersList
            )}
          </motion.section>
        )}

        <motion.div {...rise(0.5)} className="flex flex-col gap-3">
          {scene.nextLocked ? (
            <button
              type="button"
              onClick={() => finish({ kind: 'done' })}
              className="flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-black text-primary-foreground shadow-[0_5px_0_0_#2c511a] transition-[transform,box-shadow] duration-100 active:translate-y-[5px] active:shadow-none"
            >
              <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
              Done
            </button>
          ) : (
            <>
              {breakFirst ? (
                <>
                  {breakButton}
                  {focusButton}
                </>
              ) : (
                <>
                  {focusButton}
                  {breakButton}
                </>
              )}
              <button
                type="button"
                onClick={() => finish({ kind: 'done' })}
                className="h-11 w-full rounded-2xl text-[15px] font-black text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                I&apos;m done for now
              </button>
            </>
          )}
        </motion.div>
      </>
    );

    if (wide) {
      return (
        <div className="relative flex min-h-full px-12 py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_45%,rgba(255,255,255,0.13),transparent_55%)]"
          />
          <div className="relative m-auto grid w-full max-w-[64rem] grid-cols-[1.1fr_1fr] items-center gap-16">
            <div className="flex min-w-0 flex-col items-start text-left">{heroStats}</div>
            <div className="flex w-full max-w-[26rem] flex-col items-center justify-self-center">
              <div className="relative flex w-full justify-center">
                {!reduceMotion && <Ripples />}
                {frogStage}
              </div>
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0.2 }
                    : { type: 'spring', stiffness: 300, damping: 30, delay: 0.2 }
                }
                className="relative z-10 w-full rounded-[32px] bg-background px-7 pb-6 pt-7 text-foreground shadow-[0_28px_60px_-24px_rgba(10,40,16,0.6)]"
              >
                {panelBody}
              </motion.div>
            </div>
          </div>
          <div className="absolute right-6 top-6 z-30">{closeButton}</div>
        </div>
      );
    }

    return (
      <div className="flex min-h-full flex-col">
        <div className="relative flex flex-1 flex-col items-center px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="relative z-30 flex w-full justify-end">{closeButton}</div>
          <div className="flex w-full flex-1 flex-col items-center justify-center pb-2 text-center">
            {heroStats}
          </div>
          {!reduceMotion && <Ripples />}
          {frogStage}
        </div>
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
          animate={{ y: 0, opacity: 1 }}
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : { type: 'spring', stiffness: 300, damping: 34, delay: 0.2 }
          }
          className="relative z-10 rounded-t-[32px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-7 text-foreground shadow-[0_-14px_32px_-14px_rgba(10,40,16,0.5)]"
        >
          <div className="mx-auto w-full max-w-[28rem]">{panelBody}</div>
        </motion.div>
      </div>
    );
  })();

  const defaultOrigin = (): WrapUpOrigin => {
    if (typeof window === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
    const { innerWidth: w, innerHeight: h } = window;
    if (!wide) return { top: Math.round(h * 0.45), right: 12, bottom: 16, left: 12 };
    const side = Math.max(24, Math.round((w - 440) / 2));
    const edge = Math.max(24, Math.round(h * 0.16));
    return { top: edge, right: side, bottom: edge, left: side };
  };
  const origin: WrapUpOrigin = scene?.origin ?? defaultOrigin();

  return createPortal(
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="wrapup-sheet"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="focus-wrapup-title"
            tabIndex={-1}
            onPointerDownCapture={acknowledge}
            onKeyDownCapture={acknowledge}
            initial={reduceMotion ? { opacity: 0 } : { clipPath: clipFrom(origin) }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { clipPath: 'inset(0px 0px 0px 0px round 0px)' }
            }
            exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeOut' } }}
            transition={reduceMotion ? { duration: 0.2 } : { duration: 0.5, ease: EXPAND_EASE }}
            className="fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-primary text-primary-foreground outline-none dark:bg-green-700 dark:text-white"
            style={{ zIndex: Z_INDEX }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>

      {shielded && (
        <div
          aria-hidden
          className="fixed inset-0"
          style={{ zIndex: Z_INDEX + 2 }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        />
      )}
    </>,
    document.body,
  );
}

export default FocusWrapUp;
