'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  Play,
  Sparkles,
} from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
import { normalizeWeekStart, weekOrder } from '@/lib/weekStart';
import { PRIMARY_OPTIONS } from '@/lib/pact/types';
import { QuestRewardTileBadge } from '@/lib/questClaims';
import { PlusDoubleNote, PlusPill } from './PlusBits';
import type { PactAreaChoice, PactOption, PactView } from '@/lib/pact/types';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Step = 'intro' | 'area' | 'commitment' | 'confirm' | 'done';

// "2 sessions · 15 min each" — never a single total the reader could mistake
// for the whole week's budget.
function sessionsLabel(dayCount: number, minutes?: number) {
  const sessions = `${dayCount} session${dayCount === 1 ? '' : 's'}`;
  return minutes ? `${sessions} · ${minutes} min each` : sessions;
}

function quietLabel(area: PactAreaChoice) {
  if (area.streakWeeks > 0) {
    return `${area.streakWeeks} week${area.streakWeeks === 1 ? '' : 's'} strong`;
  }
  if (area.quietDays === null) return 'Not started yet';
  if (area.quietDays <= 1) return 'Active today';
  return `Quiet for ${area.quietDays} days`;
}

export function PactPickSheet({
  open,
  onClose,
  view,
  onCommitted,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  view: PactView;
  onCommitted: (next: PactView) => void;
  onUpgrade: () => void;
}) {
  const [step, setStep] = useState<Step>(view.introSeen ? 'area' : 'intro');
  const [areaId, setAreaId] = useState<string | null>(null);
  const [options, setOptions] = useState<PactOption[] | null>(null);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [startTime, setStartTime] = useState('19:00');
  const [writingOwn, setWritingOwn] = useState(false);
  const [perDayTimes, setPerDayTimes] = useState(false);
  const [dayTimes, setDayTimes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    scheduleLabel: string;
    rewardFlies: number;
    taskCount: number;
  } | null>(null);

  // Opening the sheet resets it — nothing else may. Committing hands the
  // fresh view up to the card, and that view carries introSeen flipped true
  // by the intro step, which re-ran this effect and wiped the success screen
  // back to the area grid the instant the pact was saved.
  const introSeenRef = useRef(view.introSeen);
  introSeenRef.current = view.introSeen;

  useEffect(() => {
    if (!open) return;
    setStep(introSeenRef.current ? 'area' : 'intro');
    setAreaId(null);
    setOptions(null);
    setOptionId(null);
    setWritingOwn(false);
    setCustomText('');
    setError(null);
    setResult(null);
  }, [open]);

  const area = useMemo(
    () => view.areas.find((entry) => entry.categoryId === areaId) ?? null,
    [view.areas, areaId],
  );
  const option = useMemo(
    () => options?.find((entry) => entry.id === optionId) ?? null,
    [options, optionId],
  );

  const chooseArea = async (categoryId: string) => {
    setAreaId(categoryId);
    setStep('commitment');
    setOptions(null);
    setOptionId(null);
    setWritingOwn(false);
    setLoading(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(
        `/api/pact?timezone=${encodeURIComponent(timezone)}&categoryId=${encodeURIComponent(categoryId)}`,
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not load ideas');
      setOptions(payload.options ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ideas');
    } finally {
      setLoading(false);
    }
  };

  const dismissIntro = async () => {
    setStep('area');
    try {
      await fetch('/api/pact', { method: 'PATCH' });
    } catch {
      // The intro is cosmetic — a failed write just shows it again next week.
    }
  };

  const commit = async () => {
    if (!area) return;
    const text = writingOwn ? customText.trim() : (option?.text ?? '');
    if (!text) {
      setError('Say what you will do');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone,
          categoryId: area.categoryId,
          text,
          days,
          startTime,
          dayTimes: perDayTimes ? dayTimes : undefined,
          tier: writingOwn ? 'steady' : option?.tier,
          suggestionId: writingOwn ? undefined : option?.id,
          source: writingOwn ? 'custom' : option?.source,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save');
      setResult({
        scheduleLabel: payload.scheduleLabel,
        rewardFlies: payload.rewardFlies,
        taskCount: payload.taskCount,
      });
      setStep('done');
      onCommitted(payload.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  };

  const previewText = writingOwn ? customText.trim() : (option?.text ?? '');
  const previewMinutes = writingOwn ? undefined : option?.minutes;
  const visibleOptions = (options ?? []).slice(0, PRIMARY_OPTIONS);
  const orderedDays = weekOrder(normalizeWeekStart(view.weekStartsOn));
  const hasFooter = step === 'commitment' || step === 'confirm';
  const rewardPreview =
    days.length * view.flyRates.perTask +
    view.flyRates.weekBonus +
    (option?.tier === 'strong' ? view.flyRates.pushBonus : 0);

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1400}
      className="bg-background ring-1 ring-border/70 sm:max-w-[480px] max-h-[92vh]"
    >
      {({ bindScroll }) => (
        // flex-1 inside the panel's own flex column. A second max-h-[92vh]
        // here measured against the viewport, not the panel, so the footer
        // fell past the panel's overflow-hidden edge and got clipped.
        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
          {/* Body scrolls, footer does not. A sticky button floats over the
            content it is meant to sit below; a real footer never does. */}
          <div
            ref={bindScroll}
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-none px-5 pt-2',
              // Steps without a footer have to clear the home indicator
              // themselves, or the last card sits flush with the sheet edge.
              hasFooter
                ? 'pb-4'
                : 'pb-[calc(env(safe-area-inset-bottom)+24px)]',
            )}
          >
            {step === 'intro' && (
              <div className="flex flex-col gap-5 py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles
                    className="h-7 w-7 text-primary"
                    strokeWidth={2.5}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <h2 className="text-[22px] font-black leading-tight text-foreground">
                    One area. One week.
                  </h2>
                  <p className="mx-auto max-w-[36ch] text-[14px] font-semibold leading-snug text-muted-foreground">
                    Choose one thing you&apos;ll actually do. We&apos;ll put it
                    in your week, at times you pick.
                  </p>
                </div>
                <ol className="mx-auto flex w-full max-w-[20rem] flex-col gap-2.5 text-left">
                  {[
                    'Pick your area',
                    'Choose what you’ll do',
                    'We add it to your week',
                  ].map((label, index) => (
                    <li key={label} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-black text-white">
                        {index + 1}
                      </span>
                      <span className="text-[14px] font-bold text-foreground">
                        {label}
                      </span>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={dismissIntro}
                  className="mt-1 h-12 w-full rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-transform active:translate-y-[2px] active:shadow-none"
                >
                  Let&apos;s go
                </button>
              </div>
            )}

            {step === 'area' && (
              <div className="flex flex-col gap-4 py-2">
                <div className="pt-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">
                    This week
                  </p>
                  <h2 className="mt-1 text-[20px] font-black leading-tight text-foreground">
                    Which area gets your attention?
                  </h2>
                  <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
                    Pick one. You can change it next week.
                  </p>
                </div>
                {/* Always two columns: a full-width card at 16/9 is enormous on
                  a phone, and squeezing it shorter crops the frog back out.
                  Halving the width fixes both at once. */}
                <div className="grid grid-cols-2 gap-3">
                  {view.areas.map((entry) => {
                    const compact = true;
                    return (
                      <button
                        key={entry.categoryId}
                        type="button"
                        onClick={() => chooseArea(entry.categoryId)}
                        className="h-full w-full overflow-hidden rounded-[24px] border border-border/50 bg-card text-left shadow-sm transition active:scale-[0.98] [@media(hover:hover)]:hover:shadow-md"
                      >
                        {/* An aspect ratio, not a pixel height: a fixed height
                          crops harder the wider the screen, which is why the
                          art lost its frogs on phones. */}
                        <div
                          className={cn(
                            'relative w-full overflow-hidden',
                            'aspect-[16/9]',
                          )}
                        >
                          {entry.coverImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.coverImageUrl}
                              alt={entry.name}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover object-center"
                            />
                          ) : (
                            <div
                              className="h-full w-full"
                              style={{
                                background: `linear-gradient(135deg, ${entry.backgroundFrom ?? '#0f172a'}, ${entry.backgroundTo ?? '#1e293b'})`,
                              }}
                            />
                          )}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent" />
                          <span
                            className={cn(
                              'absolute bottom-2 uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]',
                              compact
                                ? 'left-3 right-3 truncate text-[15px]'
                                : 'left-3.5 text-[20px]',
                            )}
                            style={{
                              fontFamily:
                                'var(--font-display), "Luckiest Guy", cursive',
                              WebkitTextStroke: compact
                                ? '1.4px rgba(15, 23, 42, 0.95)'
                                : '1.8px rgba(15, 23, 42, 0.95)',
                              paintOrder: 'stroke fill',
                            }}
                          >
                            {entry.name}
                          </span>
                          {entry.recommended && (
                            <span className="absolute right-2.5 top-2.5 rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-[0_2px_0_0_#b45309]">
                              Needs you
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 px-3 py-2.5">
                          <span
                            className={cn(
                              'min-w-0 truncate text-[11px] font-bold',
                              entry.streakWeeks > 0
                                ? 'text-primary'
                                : (entry.quietDays ?? 0) >= 7
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {quietLabel(entry)}
                          </span>
                          {/* A real button, not just a tappable card — the card
                            alone gave no affordance that it was clickable. */}
                          <span className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309]">
                            <Play className="h-3.5 w-3.5 fill-current" />
                            Pick
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'commitment' && area && (
              <div className="flex flex-col gap-4 py-2">
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('area')}
                    aria-label="Back to areas"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">
                      {area.shortLabel}
                    </p>
                    <h2 className="text-[19px] font-black leading-tight text-foreground">
                      What will you do?
                    </h2>
                  </div>
                </div>

                {loading && (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}

                {!loading && options && (
                  <div className="flex flex-col gap-3">
                    {visibleOptions.map((entry) => {
                      const selected = !writingOwn && optionId === entry.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setWritingOwn(false);
                            setOptionId(entry.id);
                            setDays(entry.days);
                            setStartTime(entry.startTime);
                          }}
                          className={cn(
                            'flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition',
                            selected
                              ? 'border-primary bg-primary/[0.07]'
                              : 'border-border/60 bg-card/60 hover:border-primary/40',
                          )}
                        >
                          {/* One aligned attribute per row — effort. Reward
                              rides on effort, so printing it three times only
                              adds attributes to compare, which is the part of
                              choice-set complexity that actually costs the
                              reader. It is stated once, in the footer. */}
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-[15px] font-black leading-snug text-foreground">
                              {entry.text}
                            </span>
                            <span className="text-[12.5px] font-bold text-muted-foreground">
                              {sessionsLabel(entry.days.length, entry.minutes)}
                              {entry.source === 'repeat' && ' · Worked before'}
                            </span>
                          </span>
                          {selected && (
                            <Check
                              className="h-5 w-5 shrink-0 text-primary"
                              strokeWidth={3}
                            />
                          )}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        // Locked is a sales moment, not a dead end — show what
                        // Plus buys instead of an unresponsive row.
                        if (!view.canWriteOwn) {
                          onUpgrade();
                          return;
                        }
                        setWritingOwn(true);
                        setOptionId(null);
                      }}
                      className={cn(
                        'flex items-center gap-2.5 rounded-2xl border border-dashed px-3.5 py-3 text-left transition',
                        writingOwn
                          ? 'border-primary bg-primary/[0.07]'
                          : 'border-border/70 hover:border-primary/40',
                      )}
                    >
                      <Pencil
                        className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
                        strokeWidth={2.5}
                      />
                      <span className="min-w-0 flex-1 text-[15px] font-black text-foreground">
                        Write my own
                      </span>
                      {!view.canWriteOwn && <PlusPill>Plus</PlusPill>}
                    </button>

                    {writingOwn && view.canWriteOwn && (
                      <div className="rounded-2xl border border-border/60 bg-card/60 p-3.5">
                        <input
                          value={customText}
                          onChange={(event) =>
                            setCustomText(event.target.value)
                          }
                          maxLength={80}
                          placeholder="e.g. 20-minute walk"
                          autoFocus
                          className="h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-[15px] font-bold text-foreground outline-none focus:border-primary"
                        />
                        <p className="mt-2 text-[12px] font-semibold text-muted-foreground">
                          Describe one session. Days and time come next.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <p className="text-[13px] font-bold text-destructive">
                    {error}
                  </p>
                )}
              </div>
            )}

            {step === 'confirm' && area && (
              <div className="flex flex-col gap-4 py-2">
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('commitment')}
                    aria-label="Back to options"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                  <h2 className="text-[19px] font-black leading-tight text-foreground">
                    When will you do it?
                  </h2>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-border/50 bg-card shadow-sm">
                  <div
                    className="relative w-full overflow-hidden"
                    style={{ aspectRatio: '16 / 5' }}
                  >
                    {area.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={area.coverImageUrl}
                        alt={area.name}
                        decoding="async"
                        className="h-full w-full object-cover object-[center_42%]"
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          background: `linear-gradient(135deg, ${area.backgroundFrom ?? '#0f172a'}, ${area.backgroundTo ?? '#1e293b'})`,
                        }}
                      />
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent" />
                    <span
                      className="absolute bottom-2 left-3.5 text-[19px] uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]"
                      style={{
                        fontFamily:
                          'var(--font-display), "Luckiest Guy", cursive',
                        WebkitTextStroke: '1.8px rgba(15, 23, 42, 0.95)',
                        paintOrder: 'stroke fill',
                      }}
                    >
                      {area.name}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[17px] font-black leading-snug text-foreground">
                      {previewText}
                    </p>
                    {previewMinutes ? (
                      <p className="mt-1 text-[13px] font-bold text-muted-foreground">
                        {previewMinutes} min per session
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4">
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Days
                    </p>
                    <div className="flex gap-1.5">
                      {orderedDays.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          aria-label={DAY_NAMES[day]}
                          aria-pressed={days.includes(day)}
                          className={cn(
                            'h-10 flex-1 rounded-lg text-[13px] font-black transition',
                            days.includes(day)
                              ? 'bg-primary text-white'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70',
                          )}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                        Time
                      </p>
                      {days.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPerDayTimes((prev) => !prev)}
                          className="text-[11px] font-black text-primary"
                        >
                          {perDayTimes
                            ? 'Same time each day'
                            : 'Different times?'}
                        </button>
                      )}
                    </div>
                    {perDayTimes && days.length > 1 ? (
                      <div className="flex flex-col gap-2">
                        {orderedDays
                          .filter((day) => days.includes(day))
                          .map((day) => (
                            <label
                              key={day}
                              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2"
                            >
                              <span className="w-10 shrink-0 text-[13px] font-black text-foreground">
                                {DAY_NAMES[day]}
                              </span>
                              <input
                                type="time"
                                value={dayTimes[day] ?? startTime}
                                onChange={(event) =>
                                  setDayTimes((prev) => ({
                                    ...prev,
                                    [day]: event.target.value,
                                  }))
                                }
                                className="h-9 flex-1 rounded-lg bg-transparent text-[15px] font-bold text-foreground outline-none"
                              />
                            </label>
                          ))}
                      </div>
                    ) : (
                      <input
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className="h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-[15px] font-bold text-foreground outline-none focus:border-primary"
                      />
                    )}
                  </div>
                </div>

                {error && (
                  <p className="text-[13px] font-bold text-destructive">
                    {error}
                  </p>
                )}
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col gap-5 py-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                  <Check className="h-7 w-7 text-primary" strokeWidth={3} />
                </div>
                <div className="flex flex-col gap-2">
                  <h2 className="text-[21px] font-black leading-tight text-foreground">
                    You&apos;re set for the week
                  </h2>
                  <p className="mx-auto max-w-[32ch] text-[14px] font-semibold leading-snug text-muted-foreground">
                    {result
                      ? `${result.taskCount} task${result.taskCount === 1 ? '' : 's'} added — ${result.scheduleLabel}. We'll remind you each time.`
                      : "Your tasks are on your list. We'll remind you each time."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-12 w-full rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-transform active:translate-y-[2px] active:shadow-none"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {hasFooter && (
            <div className="shrink-0 border-t border-border/50 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
              {/* The deal, in one place, right where it is being accepted:
                  what you do on the left, what it pays on the right. Both
                  steps show the same row, so the second step teaches nothing
                  new — it just keeps the number in view while days change. */}
              {previewText && days.length > 0 && (
                <div className="mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                  {/* Two columns, not two rows: what you do reads down the
                      left, what it pays sits whole on the right. The Plus
                      note belongs to the label it qualifies, so it lives in
                      the label's column and stays smaller than the reward. */}
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[12.5px] font-bold text-muted-foreground">
                      Finish all {days.length} session
                      {days.length === 1 ? '' : 's'}
                    </span>
                    {!view.isPremium && <PlusDoubleNote />}
                  </span>
                  <QuestRewardTileBadge
                    rewards={[
                      { type: 'FLIES', amount: rewardPreview },
                      ...view.completionRewards,
                    ]}
                    catalog={view.rewardCatalog as never}
                    isPremium={view.isPremium}
                  />
                </div>
              )}
              {step === 'confirm' && days.length === 0 && (
                <p className="mb-2.5 text-[12.5px] font-bold text-muted-foreground">
                  Pick at least one day.
                </p>
              )}
              {step === 'commitment' ? (
                <button
                  type="button"
                  disabled={!previewText}
                  onClick={() => setStep('confirm')}
                  className="h-12 w-full rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:shadow-none"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving || days.length === 0}
                  onClick={commit}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'Add to my week'
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </BaseSheet>
  );
}
