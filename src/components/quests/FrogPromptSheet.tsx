'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Lock, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { CloseButton } from '@/components/ui/CloseButton';
import Frog, { type WardrobeSlot } from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
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

const TEXT_MAX = 1000;

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

function PromptFrog({ size }: { size: number }) {
  const { indices } = useWardrobeIndices(true);
  const look = useMemo(
    () => ({ ...(indices ?? {}), mood: 0 }) as Partial<Record<WardrobeSlot, number>>,
    [indices],
  );
  const [dressed, setDressed] = useState(false);
  const [underlay, setUnderlay] = useState(true);
  useEffect(() => {
    if (!dressed) return;
    const timer = window.setTimeout(() => setUnderlay(false), 220);
    return () => window.clearTimeout(timer);
  }, [dressed]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {underlay && (
        <div className="pointer-events-none absolute inset-0">
          <FrogSnapshot width={size} height={size} indices={look} />
        </div>
      )}
      <Frog
        className="relative"
        width={size}
        height={size}
        indices={look}
        greet="hop"
        onDressed={() => setDressed(true)}
      />
    </div>
  );
}

function ResultBars({
  options,
  results,
  picked,
}: {
  options: QuestPromptOption[];
  results: PromptResults;
  picked: string | null;
}) {
  const total = Math.max(1, results.total);
  return (
    <ul className="flex flex-col gap-2.5">
      {options.map((option, index) => {
        const count = results.counts[option.id] ?? 0;
        const percent = Math.round((count / total) * 100);
        const mine = picked === option.id;
        const friends = results.friends.filter((friend) => friend.optionId === option.id);
        return (
          <li key={option.id}>
            <div
              className={cn(
                'relative overflow-hidden rounded-[16px] border-2 bg-card',
                mine ? 'border-primary' : 'border-border/70',
              )}
            >
              <motion.div
                aria-hidden="true"
                className={cn('absolute inset-y-0 left-0', mine ? 'bg-primary/20' : 'bg-muted')}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.7, delay: 0.1 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              />
              <div className="relative flex min-h-[52px] items-center gap-3 px-3.5 py-2">
                {option.emoji && <span className="text-[22px] leading-none">{option.emoji}</span>}
                <span className="min-w-0 flex-1 truncate text-[15px] font-black text-foreground">
                  {option.label}
                </span>
                {mine && (
                  <span className="rounded-[7px] bg-primary px-1.5 py-0.5 text-[10.5px] font-black uppercase tracking-[0.06em] text-primary-foreground">
                    You
                  </span>
                )}
                <span className="w-11 text-right text-[15px] font-black tabular-nums text-foreground">
                  {percent}%
                </span>
              </div>
            </div>
            {friends.length > 0 && (
              <p className="mt-1 truncate px-1 text-[12px] font-bold text-muted-foreground">
                {friends.slice(0, 3).map((friend) => friend.name).join(', ')}
                {friends.length > 3 ? ` +${friends.length - 3}` : ''} picked this
              </p>
            )}
          </li>
        );
      })}
    </ul>
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
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PromptResults | null>(null);
  const [shared, setShared] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingReward = useRef<unknown>(null);

  useEffect(() => setMounted(true), []);
  useRegisterOpenSheet(open);

  const kind = block?.promptKind ?? 'journal';
  const options = block?.promptOptions ?? [];
  const answered = !!block?.promptAnswered;

  useEffect(() => {
    if (!open) return;
    setText('');
    setPicked(null);
    setError(null);
    setResults(null);
    setShared(false);
    pendingReward.current = null;
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
    onClose();
    await onAnswered({ rewardSummary: reward ?? undefined });
  };

  const submit = async (optionId?: string) => {
    if (!block || !questId || saving) return;
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
  const canSubmitJournal = text.trim().length > 0;
  const askName = frogName?.trim() || 'Your frog';

  const answerArea = showResults ? (
    <div className="flex flex-col gap-4">
      <ResultBars options={options} results={results} picked={picked} />
      <p className="text-center text-[12.5px] font-bold text-muted-foreground">
        {results.total === 1
          ? 'You’re the first frog friend to answer'
          : `${results.total.toLocaleString()} answers so far`}
      </p>
    </div>
  ) : kind === 'journal' ? (
    <div className="flex flex-col gap-2">
      <textarea
        ref={textRef}
        value={text}
        disabled={answered}
        maxLength={TEXT_MAX}
        onChange={(event) => setText(event.target.value)}
        placeholder={answered ? 'Answered today' : block?.promptPlaceholder || 'Write anything…'}
        rows={6}
        className="min-h-[9.5rem] w-full resize-none rounded-[18px] border-2 border-border/70 bg-card px-4 py-3.5 text-[16px] font-semibold leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60"
      />
      <span className="inline-flex items-center gap-1.5 px-1 text-[12px] font-bold text-muted-foreground">
        <Lock className="h-3 w-3" strokeWidth={2.75} />
        Only you can see this
      </span>
    </div>
  ) : kind === 'checkin' ? (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-2">
        {options.map((option) => {
          const active = picked === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={answered || saving}
              onClick={() => {
                hapticSelect();
                setPicked(option.id);
              }}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-[16px] border-2 px-1 pb-2 pt-2.5 transition-[transform,border-color,background-color] duration-150 active:scale-95',
                active
                  ? 'border-primary bg-primary/12'
                  : 'border-border/70 bg-card hover:border-primary/30',
              )}
            >
              <span
                className={cn(
                  'grid h-11 w-11 place-items-center rounded-full text-[24px] leading-none transition-transform',
                  active ? 'scale-110 bg-[#9bd682]' : 'bg-[#dcedcf] dark:bg-white/10',
                )}
              >
                {option.emoji}
              </span>
              <span className="text-[11.5px] font-black text-foreground/80">{option.label}</span>
            </button>
          );
        })}
      </div>
      <span className="inline-flex items-center gap-1.5 px-1 text-[12px] font-bold text-muted-foreground">
        <Lock className="h-3 w-3" strokeWidth={2.75} />
        Only you can see this
      </span>
    </div>
  ) : (
    <div className={cn('grid gap-2.5', kind === 'this_or_that' ? 'grid-cols-2' : 'grid-cols-1')}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={answered || saving}
          onClick={() => {
            hapticSelect();
            setPicked(option.id);
            void submit(option.id);
          }}
          className={cn(
            'flex items-center gap-3 rounded-[16px] border-2 border-border/70 bg-card text-left shadow-[0_3px_0_rgba(15,23,42,0.08)] transition-[transform,border-color,box-shadow] duration-150 hover:border-primary/40 active:translate-y-[2px] active:shadow-none disabled:opacity-70',
            kind === 'this_or_that'
              ? 'min-h-[8.5rem] flex-col justify-center px-3 py-4 text-center'
              : 'min-h-[56px] px-4 py-2.5',
            picked === option.id && 'border-primary',
          )}
        >
          {option.emoji && (
            <span className={cn('leading-none', kind === 'this_or_that' ? 'text-[40px]' : 'text-[24px]')}>
              {option.emoji}
            </span>
          )}
          <span className="text-[15.5px] font-black text-foreground">{option.label}</span>
        </button>
      ))}
    </div>
  );

  const primary = showResults ? (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-2 border-border/70 bg-card text-[15px] font-black text-foreground shadow-[0_3px_0_rgba(15,23,42,0.08)] transition-transform active:translate-y-[2px] active:shadow-none"
      >
        {shared ? <Check className="h-4 w-4" strokeWidth={3} /> : <Share2 className="h-4 w-4" strokeWidth={2.75} />}
        {shared ? 'Link copied' : 'Ask your friends'}
      </button>
      <button
        type="button"
        onClick={() => void finish()}
        className="h-12 w-full rounded-[14px] bg-primary text-[16px] font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary)/0.55)] transition-transform active:translate-y-[3px] active:shadow-none"
      >
        Done
      </button>
    </div>
  ) : kind === 'journal' || kind === 'checkin' ? (
    answered ? null : (
      <button
        type="button"
        disabled={saving || (kind === 'journal' ? !canSubmitJournal : !picked)}
        onClick={() => void submit(kind === 'checkin' ? picked ?? undefined : undefined)}
        className="h-12 w-full rounded-[14px] bg-primary text-[16px] font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary)/0.55)] transition-[transform,opacity] active:translate-y-[3px] active:shadow-none disabled:opacity-45 disabled:shadow-none"
      >
        {saving ? 'Saving…' : 'Done'}
      </button>
    )
  ) : null;

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
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[1300] flex flex-col overflow-hidden bg-[hsl(var(--board-list))] dark:bg-background"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] bg-[radial-gradient(120%_80%_at_50%_0%,rgba(155,214,130,0.45),transparent_70%)] dark:bg-[radial-gradient(120%_80%_at_50%_0%,rgba(88,168,63,0.22),transparent_70%)] lg:hidden"
          />
          <div className="relative flex shrink-0 items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:px-8 lg:pt-6">
            <span className="text-[13px] font-black text-muted-foreground">{todayLabel()}</span>
            <CloseButton onClick={onClose} ariaLabel="Close question" />
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-5xl lg:flex-row lg:items-center lg:gap-16 lg:px-10">
            <div className="flex shrink-0 flex-col items-center px-6 pt-1 text-center lg:flex-1 lg:rounded-[28px] lg:bg-[radial-gradient(100%_90%_at_50%_10%,rgba(155,214,130,0.55),rgba(220,237,207,0.35)_60%,transparent)] lg:py-12 dark:lg:bg-[radial-gradient(100%_90%_at_50%_10%,rgba(88,168,63,0.25),transparent_70%)]">
              <div className="-mb-3 -mt-6 lg:-mt-10">
                <PromptFrog size={150} />
              </div>
              <span className="text-[12px] font-black uppercase tracking-[0.12em] text-primary">
                {askName} asks
              </span>
              <h2
                id="frog-prompt-question"
                className="mt-1.5 max-w-[22rem] text-balance text-[24px] font-black leading-[1.15] text-foreground lg:text-[30px]"
              >
                {block.promptQuestion}
              </h2>
            </div>
            <div className="flex min-h-0 flex-1 flex-col lg:max-w-[28rem]">
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-6 lg:flex-none lg:overflow-visible lg:px-0">
                {answerArea}
                {error && (
                  <p role="alert" className="mt-3 text-center text-[13px] font-bold text-red-500">
                    {error}
                  </p>
                )}
              </div>
              {primary && (
                <div className="shrink-0 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 lg:px-0 lg:pb-0">
                  {primary}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
