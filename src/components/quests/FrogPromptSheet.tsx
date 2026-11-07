'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Lock, Share2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { SheetEnteredContext, useEntrance } from '@/lib/sheetEntered';
import Frog, { type WardrobeSlot } from '@/components/ui/frog';
import { BuddyFrogFace } from '@/components/ui/BuddyBadge';
import { useKeyboardInset } from '@/components/ui/quick-add/useKeyboardInset';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { readCachedBackground } from '@/hooks/useBackgrounds';
import { DEFAULT_BACKGROUND_IMAGES } from '@/lib/backgrounds/constants';
import type { FrogIndices } from '@/lib/friends/indices';
import { hapticSelect, hapticSuccess } from '@/lib/haptics';
import type {
  QuestPromptKind,
  QuestPromptOption,
} from '@/lib/quests/types';

export type FrogPromptBlock = {
  id: string;
  promptId?: string;
  promptKind?: QuestPromptKind;
  promptQuestion?: string;
  promptPlaceholder?: string;
  promptOptions?: QuestPromptOption[];
  promptAnswered?: boolean;
};

type PromptResults = {
  total: number;
  counts: Record<string, number>;
  mine: string | null;
  friends: Array<{ name: string; optionId: string }>;
};

type FrogLook = Partial<Record<WardrobeSlot, number>>;

const TEXT_MAX = 1000;
const EASE = [0.22, 1, 0.36, 1] as const;

const BAR_COLORS = ['#4a9a37', '#1f8fd0', '#e2791f', '#d9558f', '#7c5bd6', '#129a8c'];

function isCommunity(kind?: QuestPromptKind) {
  return kind === 'poll' || kind === 'this_or_that';
}

function todayLabel() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
}

function PondScene({
  look,
  frogWidth,
  seat,
  image,
  className,
  children,
  showFrog = true,
}: {
  look: FrogLook;
  frogWidth: number;
  seat: string;
  image: 'mobile' | 'tablet';
  className?: string;
  children?: React.ReactNode;
  showFrog?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => {
    const cached = readCachedBackground()?.images;
    return cached?.[image] || cached?.mobile || DEFAULT_BACKGROUND_IMAGES[image];
  }, [image]);
  const frogHeight = Math.round(frogWidth * 1.125);
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-sky-300 via-emerald-200 to-emerald-300 dark:from-sky-950 dark:via-emerald-950 dark:to-emerald-900"
      >
        {!failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover object-bottom"
          />
        )}
        <div className="absolute inset-0 dark:bg-black/25" />
      </div>
      {children}
      {showFrog && (
      <div
        className="pointer-events-none absolute inset-x-0 flex justify-center"
        style={{ bottom: seat }}
      >
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 h-3.5 w-[46%] max-w-[9rem] -translate-x-1/2 rounded-[50%] bg-black/20 blur-[6px]"
        />
        <div style={{ marginBottom: -Math.round(frogHeight * 0.045) }}>
          <Frog
            width={frogWidth}
            height={frogHeight}
            indices={look}
            arrive="rise"
            greet="hop"
          />
        </div>
      </div>
      )}
    </div>
  );
}

function AskEyebrow({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-black uppercase tracking-[0.1em] text-primary dark:bg-primary/20">
      {name} asks
    </span>
  );
}

function OptionList({
  kind,
  options,
  picked,
  disabled,
  onPick,
}: {
  kind: QuestPromptKind;
  options: QuestPromptOption[];
  picked: string | null;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  if (kind === 'checkin') {
    return (
      <div className="grid grid-cols-5 gap-2">
        {options.map((option) => {
          const active = picked === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(option.id)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-[18px] border-2 px-1 pb-2.5 pt-3 transition-[transform,border-color,background-color] duration-150 active:scale-95',
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border/70 bg-card hover:border-primary/30',
              )}
            >
              <span
                className={cn(
                  'text-[30px] leading-none transition-transform duration-200',
                  active ? 'scale-[1.18]' : picked ? 'opacity-55 grayscale-[0.4]' : '',
                )}
              >
                {option.emoji}
              </span>
              <span
                className={cn(
                  'text-[12px] font-black',
                  active ? 'text-primary' : 'text-foreground/75',
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (kind === 'this_or_that') {
    return (
      <div className="relative grid grid-cols-2 gap-3">
        {options.map((option) => {
          const active = picked === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(option.id)}
              aria-pressed={active}
              className={cn(
                'flex min-h-[9.5rem] flex-col items-center justify-center gap-2.5 rounded-[22px] border-2 bg-card px-3 py-4 text-center shadow-[0_4px_0_rgba(15,23,42,0.08)] transition-[transform,border-color,box-shadow,background-color] duration-150 active:translate-y-[3px] active:shadow-none',
                active
                  ? 'border-primary bg-primary/[0.07] shadow-[0_4px_0_hsl(var(--primary)/0.35)]'
                  : 'border-border/70 hover:border-primary/40',
              )}
            >
              {option.emoji && (
                <span className={cn('text-[44px] leading-none transition-transform', active && 'scale-110')}>
                  {option.emoji}
                </span>
              )}
              <span className="text-balance text-[15.5px] font-black leading-tight text-foreground">
                {option.label}
              </span>
            </button>
          );
        })}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-border/70 bg-background text-[11px] font-black uppercase text-muted-foreground"
        >
          or
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {options.map((option) => {
        const active = picked === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.id)}
            aria-pressed={active}
            className={cn(
              'flex min-h-[64px] items-center gap-3.5 rounded-[20px] border-2 bg-card px-4 py-2.5 text-left shadow-[0_3px_0_rgba(15,23,42,0.07)] transition-[transform,border-color,box-shadow,background-color] duration-150 active:translate-y-[2px] active:shadow-none',
              active
                ? 'border-primary bg-primary/[0.07] shadow-[0_3px_0_hsl(var(--primary)/0.35)]'
                : 'border-border/70 hover:border-primary/40',
            )}
          >
            {option.emoji && (
              <span className="w-8 shrink-0 text-center text-[28px] leading-none">{option.emoji}</span>
            )}
            <span className="min-w-0 flex-1 text-[16px] font-black leading-snug text-foreground">
              {option.label}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
            >
              {active && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ResultBars({
  options,
  results,
  picked,
  face,
}: {
  options: QuestPromptOption[];
  results: PromptResults;
  picked: string | null;
  face: FrogIndices;
}) {
  const total = Math.max(1, results.total);
  const ordered = useMemo(() => {
    const colored = options.map((option, index) => ({
      option,
      color: BAR_COLORS[index % BAR_COLORS.length],
    }));
    return [
      ...colored.filter((entry) => entry.option.id === picked),
      ...colored.filter((entry) => entry.option.id !== picked),
    ];
  }, [options, picked]);

  return (
    <ul className="flex flex-col gap-3.5">
      {ordered.map(({ option, color }, index) => {
        const count = results.counts[option.id] ?? 0;
        const percent = Math.round((count / total) * 100);
        const mine = picked === option.id;
        const friends = results.friends.filter((friend) => friend.optionId === option.id);
        return (
          <motion.li
            key={option.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 + index * 0.07, ease: EASE }}
            className="flex flex-col items-center gap-2"
          >
            <div
              className="relative w-full overflow-hidden rounded-[22px] text-white"
              style={{ backgroundColor: color, boxShadow: `0 4px 0 ${color}66` }}
            >
              <motion.div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-black/[0.16]"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(percent, 0)}%` }}
                transition={{ duration: 0.8, delay: 0.2 + index * 0.07, ease: EASE }}
              />
              <div className="relative flex min-h-[68px] items-center gap-3.5 py-2.5 pl-3 pr-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/95 text-[24px] leading-none shadow-[0_2px_0_rgba(0,0,0,0.12)]">
                  {option.emoji || '•'}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[16.5px] font-black leading-tight">{option.label}</span>
                  <span className="text-[12.5px] font-bold text-white/85">
                    {percent}% of frogs
                  </span>
                </span>
              </div>
            </div>
            {mine && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[11.5px] font-black uppercase tracking-[0.08em] text-white"
                style={{ backgroundColor: color }}
              >
                <BuddyFrogFace indices={face} size={24} className="bg-white/90" />
                You
              </span>
            )}
            {friends.length > 0 && (
              <p className="max-w-full truncate px-2 text-[12px] font-black uppercase tracking-[0.06em] text-muted-foreground">
                {friends.slice(0, 3).map((friend) => friend.name).join(', ')}
                {friends.length > 3 ? ` +${friends.length - 3}` : ''}
              </p>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

function ShareCard({ shared, onShare }: { shared: boolean; onShare: () => void }) {
  return (
    <div className="relative mx-auto w-full max-w-[22rem]">
      <div className="rounded-[24px] bg-muted/70 px-5 pb-5 pt-4 text-center dark:bg-white/[0.06]">
        <p className="text-[15.5px] font-black text-foreground">Your friends need to answer this…</p>
        <p className="mt-0.5 text-[13px] font-semibold text-muted-foreground">
          Send them the question and compare picks.
        </p>
        <button
          type="button"
          onClick={onShare}
          className="mt-3.5 inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-[15px] font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary)/0.55)] transition-transform active:translate-y-[3px] active:shadow-none"
        >
          {shared ? <Check className="h-4 w-4" strokeWidth={3} /> : <Share2 className="h-4 w-4" strokeWidth={2.75} />}
          {shared ? 'Link copied' : 'Ask your friends'}
        </button>
      </div>
      <svg
        aria-hidden="true"
        viewBox="0 0 28 18"
        className="absolute -bottom-[15px] left-[38%] h-[18px] w-7 fill-muted/70 dark:fill-white/[0.06]"
      >
        <path d="M0 0 H28 C20 4 14 10 6 18 C8 10 6 4 0 0 Z" />
      </svg>
    </div>
  );
}

export function FrogPromptSheet({
  open,
  questId,
  block,
  frogName,
  timezone,
  onClose,
  onAnswered,
}: {
  open: boolean;
  questId: string | null;
  block: FrogPromptBlock | null;
  frogName?: string | null;
  timezone: string;
  onClose: () => void;
  onAnswered: (payload: { rewardSummary?: unknown }) => void | Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PromptResults | null>(null);
  const [shared, setShared] = useState(false);
  const [typing, setTyping] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingReward = useRef<unknown>(null);
  const submitted = useRef(false);
  const { entered, markEntered } = useEntrance(open);
  const { indices } = useWardrobeIndices(open);
  const look = useMemo(
    () => ({ ...(indices ?? {}), mood: 0 }) as FrogLook,
    [indices],
  );

  useEffect(() => setMounted(true), []);
  useRegisterOpenSheet(open);

  const kind = block?.promptKind ?? 'journal';
  const options = block?.promptOptions ?? [];
  const answered = !!block?.promptAnswered;
  const { inset } = useKeyboardInset(open && kind === 'journal' && typing && !isDesktop);

  useEffect(() => {
    if (!open) return;
    setText('');
    setPicked(null);
    setError(null);
    setResults(null);
    setShared(false);
    setTyping(false);
    pendingReward.current = null;
    submitted.current = false;
    if (answered && block?.promptId && isCommunity(block.promptKind)) {
      void fetch(`/api/quests/prompt/results?promptId=${encodeURIComponent(block.promptId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setResults(data);
            setPicked(data.mine ?? null);
          }
        })
        .catch(() => {});
    }
  }, [open, block?.promptId]);

  useEffect(() => {
    if (!open || kind !== 'journal' || answered) return;
    const timer = window.setTimeout(() => {
      textRef.current?.focus({ preventScroll: true });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [open, kind, answered]);

  const finish = async () => {
    const reward = pendingReward.current;
    pendingReward.current = null;
    submitted.current = false;
    onClose();
    await onAnswered({ rewardSummary: reward ?? undefined });
  };

  const close = () => {
    if (submitted.current) {
      void finish();
      return;
    }
    onClose();
  };

  const submit = async () => {
    if (!block || !questId || saving) return;
    const optionId = kind === 'journal' ? undefined : picked ?? undefined;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/quests/prompt/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questId,
          objectiveId: block.id,
          timezone,
          text: kind === 'journal' ? text : undefined,
          optionId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Could not save your answer');
      hapticSuccess();
      pendingReward.current = payload.rewardSummary ?? null;
      submitted.current = true;
      if (payload.results) {
        setResults(payload.results);
        return;
      }
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answer');
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    if (!block?.promptQuestion) return;
    const choice = options.find((option) => option.id === picked);
    const message = choice
      ? `${block.promptQuestion} I picked ${choice.emoji ? `${choice.emoji} ` : ''}${choice.label}. What would you pick?`
      : block.promptQuestion;
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      if (navigator.share) {
        await navigator.share({ text: message, url });
      } else {
        await navigator.clipboard.writeText(`${message} ${url}`);
        setShared(true);
      }
    } catch {}
  };

  if (!mounted) return null;

  const showResults = !!results && isCommunity(kind);
  const askName = frogName?.trim() || 'Your frog';
  const question = block?.promptQuestion ?? '';
  const canSubmit = kind === 'journal' ? text.trim().length > 0 : !!picked;

  const pick = (id: string) => {
    hapticSelect();
    setPicked(id);
  };

  const errorLine = error && (
    <p role="alert" className="mt-3 text-center text-[13px] font-bold text-red-500">
      {error}
    </p>
  );

  const submitButton = answered ? null : (
    <button
      type="button"
      disabled={saving || !canSubmit}
      onClick={() => void submit()}
      className="h-[52px] w-full rounded-[16px] bg-primary text-[16.5px] font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary)/0.55)] transition-[transform,opacity,box-shadow] active:translate-y-[3px] active:shadow-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
    >
      {saving ? 'Saving…' : isCommunity(kind) ? 'Submit' : 'Done'}
    </button>
  );

  const roundClose = (tone: 'light' | 'dark') => (
    <button
      type="button"
      onClick={close}
      aria-label="Close question"
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors active:scale-95',
        tone === 'light'
          ? 'bg-white/20 text-white hover:bg-white/30'
          : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <X className="h-5 w-5" strokeWidth={2.75} />
    </button>
  );

  const privacyNote = (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
      <Lock className="h-3 w-3" strokeWidth={2.75} />
      Only you can see this
    </span>
  );

  const journalBody = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5">
        <BuddyFrogFace indices={indices} size={34} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] font-black text-primary">{askName} asks</span>
          <span className="text-[11.5px] font-black uppercase tracking-[0.08em] text-muted-foreground">
            {todayLabel()}
          </span>
        </div>
      </div>
      <h2
        id="frog-prompt-question"
        className="mt-4 text-balance text-[26px] font-black leading-[1.15] text-foreground lg:text-[32px]"
      >
        {question}
      </h2>
      <textarea
        ref={textRef}
        value={text}
        disabled={answered}
        maxLength={TEXT_MAX}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => setTyping(true)}
        onBlur={() => setTyping(false)}
        placeholder={answered ? 'Answered today' : block?.promptPlaceholder || 'Write anything…'}
        className="mt-4 min-h-[8rem] w-full flex-1 resize-none bg-transparent text-[18px] font-semibold leading-relaxed text-foreground caret-primary outline-none placeholder:text-muted-foreground/60 lg:min-h-[14rem] lg:flex-none lg:rounded-[20px] lg:border-2 lg:border-border/70 lg:bg-card lg:px-4 lg:py-3.5 lg:focus:border-primary/60"
      />
      {errorLine}
      <div className="mt-3 flex shrink-0 flex-col items-center gap-3">
        {privacyNote}
        {submitButton}
      </div>
    </div>
  );

  const choiceOptions = (
    <>
      <OptionList
          kind={kind}
          options={options}
          picked={picked}
          disabled={answered || saving}
          onPick={pick}
        />
      {kind === 'checkin' && <div className="mt-3 flex justify-center">{privacyNote}</div>}
      {errorLine}
    </>
  );

  const choiceBody = (
    <>
      <div className="flex flex-col items-center text-center">
        <AskEyebrow name={askName} />
        <h2
          id="frog-prompt-question"
          className="mt-3 max-w-[24rem] text-balance text-[23px] font-black leading-[1.18] text-foreground lg:text-[30px]"
        >
          {question}
        </h2>
      </div>
      <div className="mt-5">{choiceOptions}</div>
    </>
  );

  const resultsList = results && (
    <>
      <p className="mb-4 text-center text-[13px] font-bold text-muted-foreground">
        {results.total <= 1
          ? 'You’re the first frog to answer'
          : `${results.total.toLocaleString()} frogs have answered`}
      </p>
      <ResultBars options={options} results={results} picked={picked} face={indices} />
    </>
  );

  const doneButton = (
    <button
      type="button"
      onClick={() => void finish()}
      className="h-[52px] w-full rounded-[16px] bg-primary text-[16.5px] font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary)/0.55)] transition-transform active:translate-y-[3px] active:shadow-none"
    >
      Done
    </button>
  );

  const phaseMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 18 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
      };

  const mobileResults = (
    <motion.div
      key="results"
      {...phaseMotion}
      transition={{ duration: 0.32, ease: EASE }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="relative shrink-0 overflow-hidden rounded-b-[50%_32px] bg-[#447d3f] px-5 pb-9 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white dark:bg-[#2f5f2b]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_50%_0%,rgba(255,255,255,0.22),transparent_65%)]"
        />
        <div className="relative flex items-center">{roundClose('light')}</div>
        <h2
          id="frog-prompt-question"
          className="relative mx-auto mt-1 max-w-[22rem] text-balance text-center text-[22px] font-black leading-[1.18]"
        >
          {question}
        </h2>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5">
        {resultsList}
        <div className="mt-9">
          <ShareCard shared={shared} onShare={() => void share()} />
        </div>
        <div className="mt-1 flex justify-center">
          <Frog width={170} height={191} indices={look} arrive="hop" greet="hop" />
        </div>
      </div>
      <div className="shrink-0 border-t border-border/50 bg-[hsl(var(--board-list))] px-5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-3 dark:bg-background">
        {doneButton}
      </div>
    </motion.div>
  );

  const mobileJournal = (
    <motion.div
      key="journal"
      {...phaseMotion}
      transition={{ duration: 0.32, ease: EASE }}
      className="flex min-h-0 flex-1 flex-col px-6 pt-[calc(0.75rem+env(safe-area-inset-top))] transition-[padding] duration-200"
      style={{ paddingBottom: `calc(${inset}px + 1rem + ${inset ? '0px' : 'env(safe-area-inset-bottom)'})` }}
    >
      <div className="mb-3 flex justify-end">{roundClose('dark')}</div>
      {journalBody}
    </motion.div>
  );

  const mobileChoice = (
    <motion.div
      key="ask"
      {...phaseMotion}
      transition={{ duration: 0.32, ease: EASE }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PondScene
        look={look}
        frogWidth={200}
        image="mobile"
        seat="0px"
        showFrog={false}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="absolute right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-20">
          {roundClose('light')}
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+4rem)] [justify-content:safe_center]">
          <div className="relative z-20 mx-auto w-full max-w-[22rem] shrink-0 px-2">
            <div className="rounded-[26px] bg-white px-5 py-4 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.45)] dark:bg-card">
              <h2
                id="frog-prompt-question"
                className="text-balance text-center text-[21px] font-black leading-[1.2] text-foreground"
              >
                {question}
              </h2>
            </div>
            <svg
              aria-hidden="true"
              viewBox="0 0 44 30"
              className="absolute -bottom-[22px] left-1/2 h-6 w-9 -translate-x-1/2 fill-white dark:fill-card"
            >
              <path d="M2 0 H42 C32 5 26 14 22 30 C18 14 12 5 2 0 Z" />
            </svg>
          </div>
          <div className="pointer-events-none relative z-10 flex shrink-0 justify-center" style={{ marginTop: -106 }}>
            <Frog width={196} height={221} indices={look} arrive="rise" greet="hop" />
          </div>
          <div className="relative flex min-h-0 shrink flex-col rounded-[30px] bg-[hsl(var(--board-list))] shadow-[0_14px_34px_-14px_rgba(0,0,0,0.45)] dark:bg-background" style={{ marginTop: -10 }}>
            <div className="no-scrollbar min-h-0 overflow-y-auto px-5 pb-2 pt-6">{choiceOptions}</div>
            {submitButton && <div className="shrink-0 px-5 pb-5 pt-3">{submitButton}</div>}
            {!submitButton && <div className="h-5 shrink-0" />}
          </div>
        </div>
      </PondScene>
    </motion.div>
  );

  const desktopContent = (
    <AnimatePresence mode="wait" initial={false}>
      {showResults ? (
        <motion.div
          key="results"
          {...phaseMotion}
          transition={{ duration: 0.32, ease: EASE }}
          className="flex w-full flex-col"
        >
          <div className="text-center">
            <AskEyebrow name={askName} />
            <h2
              id="frog-prompt-question"
              className="mx-auto mt-3 max-w-[26rem] text-balance text-[28px] font-black leading-[1.15] text-foreground"
            >
              {question}
            </h2>
          </div>
          <div className="mt-6">{resultsList}</div>
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border-2 border-border/70 bg-card text-[15.5px] font-black text-foreground shadow-[0_3px_0_rgba(15,23,42,0.08)] transition-transform active:translate-y-[2px] active:shadow-none"
            >
              {shared ? <Check className="h-4 w-4" strokeWidth={3} /> : <Share2 className="h-4 w-4" strokeWidth={2.75} />}
              {shared ? 'Link copied' : 'Ask your friends'}
            </button>
            {doneButton}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="ask"
          {...phaseMotion}
          transition={{ duration: 0.32, ease: EASE }}
          className="flex w-full flex-col"
        >
          {kind === 'journal' ? (
            journalBody
          ) : (
            <>
              {choiceBody}
              {submitButton && <div className="mt-6">{submitButton}</div>}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(
    <AnimatePresence>
      {open && block && (
        <motion.div
          key="frog-prompt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="frog-prompt-question"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
          transition={{ duration: 0.28, ease: EASE }}
          onAnimationComplete={markEntered}
          className="fixed inset-0 z-[1300] flex flex-col overflow-hidden bg-[hsl(var(--board-list))] dark:bg-background"
        >
          <SheetEnteredContext.Provider value={entered}>
            {isDesktop ? (
              <div className="flex min-h-0 flex-1">
                <PondScene
                  look={look}
                  frogWidth={300}
                  image="tablet"
                  seat="2.5rem"
                  className="m-5 w-[44%] max-w-[38rem] rounded-[36px]"
                />
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div className="absolute right-6 top-6 z-10">{roundClose('dark')}</div>
                  <div className="no-scrollbar flex min-h-0 flex-1 overflow-y-auto px-10 py-16">
                    <div className="m-auto flex w-full max-w-[30rem]">{desktopContent}</div>
                  </div>
                </div>
              </div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {showResults ? mobileResults : kind === 'journal' ? mobileJournal : mobileChoice}
              </AnimatePresence>
            )}
          </SheetEnteredContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
