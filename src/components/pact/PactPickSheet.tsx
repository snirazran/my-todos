'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { mutate as swrMutate } from 'swr';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Flame,
  Loader2,
  Lock,
  Play,
  Sparkles,
} from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
import { normalizeWeekStart, weekDatesFor, weekOrder } from '@/lib/weekStart';
import {
  PACT_DEFAULT_DAYS,
  PACT_QUIET_NUDGE_DAYS,
  PRIMARY_OPTIONS,
} from '@/lib/pact/types';
import { formatPactRate } from '@/lib/pact/format';
import { pactViewKey } from '@/lib/pact/viewKey';
import { useReducedMotion } from 'framer-motion';
import { QuestRewardTileBadge } from '@/lib/questClaims';
import { Icon } from '@/components/ui/Icon';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import { RotatingWeekPrice } from './RotatingWeekPrice';
import { LeapRail } from './LeapRail';
import { buildLeapLadder } from './leapLadder';
import { PlusDoubleNote, PlusPill } from './PlusBits';
import type { PactAreaChoice, PactOption, PactView } from '@/lib/pact/types';

const CUSTOM_TEXT_MAX = 80;

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const TIME_PRESETS: { value: string; label: string }[] = [
  { value: '08:00', label: 'Morning' },
  { value: '12:30', label: 'Midday' },
  { value: '19:00', label: 'Evening' },
];

const LEAP_STEPS = 3;

function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dayHint(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return 'Today';
  const date = new Date(`${dateKey}T12:00:00`);
  const today = new Date(`${todayKey}T12:00:00`);
  if (Math.round((date.getTime() - today.getTime()) / 86_400_000) === 1)
    return 'Tomorrow';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function joinWords(parts: string[]) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
}

function summarizeSchedule(
  pickedDays: number[],
  dayTimes: Record<number, string>,
  startTime: string,
) {
  if (pickedDays.length === 0) return '';
  const distinct = new Set(pickedDays.map((day) => dayTimes[day] ?? startTime));
  if (distinct.size > 1) {
    return joinWords(
      pickedDays.map(
        (day) => `${DAY_NAMES[day]} ${formatClock(dayTimes[day] ?? startTime)}`,
      ),
    );
  }
  const only = dayTimes[pickedDays[0]] ?? startTime;
  return `${joinWords(pickedDays.map((day) => DAY_NAMES[day]))} at ${formatClock(only)}`;
}

const TIME_INPUT_RESET = cn(
  'block box-border w-full min-w-0 max-w-full appearance-none overflow-hidden',
  '[-webkit-appearance:none]',
  '[&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:p-0',
  '[&::-webkit-datetime-edit]:p-0',
);

type Step = 'intro' | 'area' | 'commitment' | 'confirm' | 'done';

// An option is a what, never a how-often: the week's ambition is the user's
// answer on the next step. Printing an authored session count here made the
// menu a set of pre-priced packages and quietly anchored how much the reader
// thought they should take on.
function repeatLabel(option: PactOption) {
  return option.continuePactId
    ? `Keep going · ${option.scheduleLabel}`
    : `Worked before · ${option.scheduleLabel}`;
}

/**
 * What the area's own tasks say. Volume first — how much landed this week is
 * what "am I on this?" actually asks, and a single last-seen date answered it
 * the same whether the week held two sessions or twenty.
 */
function areaStatus(area: PactAreaChoice): {
  label: string;
  tone: 'good' | 'plain' | 'urgent';
} | null {
  if (area.streakWeeks > 0) {
    return {
      label: `${area.streakWeeks} week${area.streakWeeks === 1 ? '' : 's'} strong`,
      tone: 'good',
    };
  }
  const done = area.completions7 ?? 0;
  if (done > 0) {
    return {
      label: `${done} done this week`,
      tone: 'good',
    };
  }
  if (area.quietDays === null) {
    return {
      label: area.hasTag ? 'Nothing finished yet' : 'No tasks here yet',
      tone: 'urgent',
    };
  }
  return {
    label:
      area.quietDays > 30
        ? 'Quiet for over a month'
        : `Quiet for ${area.quietDays} days`,
    tone: area.quietDays >= PACT_QUIET_NUDGE_DAYS ? 'urgent' : 'plain',
  };
}

export function PactPickSheet({
  open,
  onClose,
  view,
  forceIntro,
  onCommitted,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  view: PactView;
  /** Open on the explainer even for someone who has already dismissed it. */
  forceIntro?: boolean;
  onCommitted: (next: PactView) => void;
  onUpgrade: () => void;
}) {
  const weekStartsOn = normalizeWeekStart(view.weekStartsOn);
  const orderedDays = weekOrder(weekStartsOn);
  // A weekday already behind us this week can never hold a session — the
  // week's tasks stop at Saturday — so it is shown spent rather than picked
  // and silently dropped on save.
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date());
  const weekDates = weekDatesFor(view.weekKey, weekStartsOn);
  const isPastDay = (day: number) => {
    const index = orderedDays.indexOf(day as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    return index >= 0 && weekDates[index] < todayKey;
  };
  const fitDays = (desired: number[]) => {
    const kept = desired.filter((day) => !isPastDay(day));
    if (kept.length === desired.length) return kept;
    const filler = orderedDays.filter(
      (day) => !isPastDay(day) && !kept.includes(day),
    );
    return [...kept, ...filler.slice(0, desired.length - kept.length)].sort(
      (a, b) => a - b,
    );
  };

  const [step, setStep] = useState<Step>(view.introSeen ? 'area' : 'intro');
  const introMarkedRef = useRef(false);
  const markIntroSeen = () => {
    if (introMarkedRef.current || view.introSeen) return;
    introMarkedRef.current = true;
    void swrMutate(
      pactViewKey(),
      (prev?: PactView) => (prev ? { ...prev, introSeen: true } : prev),
      { revalidate: false },
    );
    void fetch('/api/pact', { method: 'PATCH' }).catch(() => {});
  };
  const [areaId, setAreaId] = useState<string | null>(null);
  const [options, setOptions] = useState<PactOption[] | null>(null);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [days, setDays] = useState<number[]>(() => fitDays(PACT_DEFAULT_DAYS));
  const [startTime, setStartTime] = useState('19:00');
  const [customTime, setCustomTime] = useState(false);
  const [perDayTimes, setPerDayTimes] = useState(false);
  const [tagId, setTagId] = useState<string | null>(null);
  const [pickingTag, setPickingTag] = useState(false);
  const [dayTimes, setDayTimes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    scheduleLabel: string;
    rewardFlies: number;
    taskCount: number;
    continued: boolean;
  } | null>(null);

  // Opening the sheet resets it — nothing else may. Committing hands the
  // fresh view up to the card, and that view carries a fresh step, which
  // re-ran this effect and wiped the success screen back to the area grid the
  // instant the pact was saved.
  //
  // The explainer runs once — on a first open, or whenever the card's `?` asks
  // for it — and is marked seen the moment it is shown.
  useEffect(() => {
    if (!open) return;
    const showIntro = forceIntro || !view.introSeen;
    if (showIntro) markIntroSeen();
    setStep(showIntro ? 'intro' : 'area');
    setAreaId(null);
    setOptions(null);
    setOptionId(null);
    setText('');
    setDays([]);
    setCustomTime(false);
    setPerDayTimes(false);
    setTagId(null);
    setPickingTag(false);
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
  // Last week's tasks are still on the board, so this commitment edits them in
  // place — same rows, same calendar event — instead of adding a second set.
  const continuing = !!option?.continuePactId;
  const fromIdea =
    !!option && (continuing || text.trim() === option.text.trim());

  const pickIdea = (entry: PactOption) => {
    setOptionId(entry.id);
    setText(entry.text.slice(0, CUSTOM_TEXT_MAX));
    setDays(entry.source === 'repeat' ? fitDays(entry.days) : []);
    setStartTime(entry.startTime);
    setCustomTime(!TIME_PRESETS.some((preset) => preset.value === entry.startTime));
    setError(null);
  };

  const startFresh = () => {
    setOptionId(null);
    setText('');
    setDays([]);
    window.requestAnimationFrame(() =>
      document.getElementById('pact-own-words')?.focus(),
    );
  };

  const chooseArea = async (categoryId: string) => {
    setAreaId(categoryId);
    setStep('commitment');
    setOptions(null);
    setOptionId(null);
    setText('');
    setDays([]);
    setLoading(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(
        `/api/pact?timezone=${encodeURIComponent(timezone)}&categoryId=${encodeURIComponent(categoryId)}`,
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Couldn’t load ideas');
      setOptions(payload.options ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load ideas');
    } finally {
      setLoading(false);
    }
  };

  const dismissIntro = () => {
    setStep('area');
    markIntroSeen();
  };

  const commit = async () => {
    if (!area) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Write what you’ll do, or pick an idea below');
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
          text: trimmed,
          days,
          startTime,
          dayTimes: perDayTimes ? dayTimes : undefined,
          tagId: tagId ?? undefined,
          suggestionId: fromIdea ? option?.id : undefined,
          continueFromPactId: continuing ? option?.continuePactId : undefined,
          source: fromIdea ? option?.source : 'custom',
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Couldn’t save');
      setResult({
        scheduleLabel: payload.scheduleLabel,
        rewardFlies: payload.rewardFlies,
        taskCount: payload.taskCount,
        continued: !!payload.continued,
      });
      setStep('done');
      onCommitted(payload.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    if (isPastDay(day)) return;
    setDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  };

  const previewText = text.trim();
  const remainingDays = orderedDays.filter((day) => !isPastDay(day));
  const pickedDays = orderedDays.filter((day) => days.includes(day));
  const scheduleSummary = summarizeSchedule(
    pickedDays,
    perDayTimes && pickedDays.length > 1 ? dayTimes : {},
    startTime,
  );
  const visibleOptions = (options ?? []).slice(0, PRIMARY_OPTIONS);
  // The shortest idea for this area, so the ghost text demonstrates the shape
  // a good answer has — a verb and a size — in the reader's own subject rather
  // than a generic walk that has nothing to do with what they just picked.
  const customPlaceholder = useMemo(() => {
    const fresh = visibleOptions
      .filter((entry) => entry.source !== 'repeat')
      .map((entry) => entry.text)
      .sort((a, b) => a.length - b.length)[0];
    return `e.g. ${fresh ?? '20-minute walk'}`;
  }, [options]);
  // The intro grew a rail; on a short screen that pushed "Let's go" below the
  // fold, so the one action on the screen sat where nobody could see it.
  const hasFooter =
    step === 'intro' || step === 'commitment' || step === 'confirm';
  // Sessions are the only thing that moves the number, and every one of them
  // is a box the app watches get ticked. Priced on the server: the gift climbs
  // with the session count too, so re-deriving it here would drift the moment
  // either the formula or a gift tier is tuned.
  const preview =
    view.weekPreview.find((entry) => entry.sessions === days.length) ?? null;
  // The intro prices the default week, not whatever the day toggles happen to
  // hold — nobody has touched them yet on that step.
  const introStartIndex = Math.max(
    0,
    view.weekPreview.findIndex(
      (entry) => entry.sessions === PACT_DEFAULT_DAYS.length,
    ),
  );
  const rewardPreview = preview?.flies ?? 0;
  const introRail = buildLeapLadder(view.ladder, view.streak.weeks);
  const anyAreaStatus = view.areas.some((entry) => areaStatus(entry) !== null);

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
              // The marquee is full-bleed and starts at the top of the scroll
              // area, which is exactly where BaseSheet pins its close button —
              // a translucent circle that vanished into the bright artwork.
              // The offset is the caller's to make: every other step opens
              // with inset text and never reaches under it.
              <div className="flex flex-col gap-4 pb-2 pt-9">
                {/* Every area at once, drifting. A single hero card sold one
                    area; the promise of this feature is the whole set, and a
                    wall of them says "there is somewhere here for whatever
                    you are neglecting" faster than any sentence could. */}
                <AreaMarquee areas={view.areas} />

                <div className="text-center">
                  <h2 className="text-[21px] font-black leading-tight text-foreground">
                    How a Leap works
                  </h2>
                  {/* The one place the word is taught. A concrete name only
                      costs the reader one exposure, and this is it. */}
                  <p className="mx-auto mt-1 max-w-[30ch] text-[13.5px] font-semibold leading-snug text-muted-foreground">
                    Take a Leap in one area, one commitment each week.
                  </p>
                </div>

                {/* One grouped card with dividers, the shape every other row
                    on this feature uses, instead of three floating lines. */}
                <ol className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-2xl bg-muted/40">
                  <IntroBeat
                    index={1}
                    title="Commit to one thing"
                    hint="We add it to your list"
                  />
                  <IntroBeat
                    index={2}
                    title="Finish it this week"
                    trailing={
                      view.weekPreview.length > 0 ? (
                        <RotatingWeekPrice
                          previews={view.weekPreview}
                          startIndex={introStartIndex}
                          catalog={
                            view.rewardCatalog as Record<
                              string,
                              QuestRewardCatalogItem
                            >
                          }
                          isPremium={view.isPremium}
                          dense
                        />
                      ) : undefined
                    }
                  />
                  {introRail.railStops.length > 1 && (
                    <IntroBeat
                      index={3}
                      title="Keep your streak"
                      hint="Hit a milestone, raise your rate"
                      below={
                        <LeapRail
                          stops={introRail.railStops}
                          progress={introRail.progress}
                          className="pb-1 pt-2"
                        />
                      }
                    />
                  )}
                </ol>
              </div>
            )}

            {step === 'area' && (
              <div className="flex flex-col gap-4 py-2">
                <StepHeader
                  index={1}
                  title="Which area this week?"
                />
                {/* Always two columns: a full-width card at 16/9 is enormous on
                  a phone, and squeezing it shorter crops the frog back out.
                  Halving the width fixes both at once. */}
                <div className="grid grid-cols-2 gap-3">
                  {view.areas.map((entry) => {
                    const status = areaStatus(entry);
                    return (
                      <button
                        key={entry.categoryId}
                        type="button"
                        onClick={() => chooseArea(entry.categoryId)}
                        className="w-full overflow-hidden rounded-[24px] border border-border/50 bg-card text-left shadow-sm transition active:scale-[0.98] [@media(hover:hover)]:hover:shadow-md"
                      >
                        {/* An aspect ratio, not a pixel height: a fixed height
                          crops harder the wider the screen, which is why the
                          art lost its frogs on phones. */}
                        <div className="relative aspect-[16/9] w-full overflow-hidden">
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
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                          {/* States what was measured, never what to do. The
                              badge is only shown where there is evidence (see
                              PACT_QUIET_NUDGE_DAYS), and an observation lets
                              the user draw their own conclusion — an
                              instruction buys a pick out of obligation. */}
                          {entry.recommended && (
                            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-1.5 py-1 text-[11px] font-black text-white shadow-[0_2px_0_0_#b45309]">
                              <Sparkles
                                className="h-3 w-3 fill-current"
                                strokeWidth={2.5}
                              />
                              Suggested
                            </span>
                          )}
                          {/* The action rides the artwork instead of claiming
                              a band of its own. Three full-width buttons in a
                              grid is the same word three times, and it pushed
                              every card past the fold; a chip still signifies
                              the tap without dominating the card it sits on. */}
                          <span className="absolute inset-x-2.5 bottom-2 flex items-end justify-between gap-2">
                            <span
                              className="min-w-0 flex-1 truncate text-[15px] leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]"
                              style={{
                                fontFamily:
                                  'var(--font-display), "Luckiest Guy", cursive',
                                WebkitTextStroke: '1.4px rgba(15, 23, 42, 0.95)',
                                paintOrder: 'stroke fill',
                              }}
                            >
                              {entry.name}
                            </span>
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                              <ChevronRight
                                className="h-4 w-4"
                                strokeWidth={3}
                              />
                            </span>
                          </span>
                        </div>
                        {/* Reserved across the whole grid or not present at
                            all. Per-card it made every card a different
                            height; unconditional it drew an empty white band
                            under every card, which reads as a card that
                            failed to load. */}
                        {anyAreaStatus && (
                          <span
                            className={cn(
                              'flex h-8 items-center truncate px-3 text-[12px] font-bold',
                              status?.tone === 'good'
                                ? 'text-primary'
                                : status?.tone === 'urgent'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {status?.label ?? ''}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'commitment' && area && (
              <div className="flex flex-col gap-4 py-2">
                <StepHeader
                  index={2}
                  eyebrow={area.shortLabel}
                  title="What will you do?"
                  onBack={() => setStep('area')}
                  backLabel="Back to areas"
                />

                <div>
                  <div className="relative">
                    <input
                      id="pact-own-words"
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        setError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && previewText) {
                          event.preventDefault();
                          setStep('confirm');
                        }
                      }}
                      maxLength={CUSTOM_TEXT_MAX}
                      placeholder={customPlaceholder}
                      enterKeyHint="next"
                      autoComplete="off"
                      aria-label="What you'll do"
                      className="h-12 w-full rounded-2xl border-2 border-border/70 bg-background px-3.5 pr-14 text-[16px] font-bold text-foreground outline-none transition-colors placeholder:font-semibold placeholder:text-muted-foreground/70 focus:border-primary"
                    />
                    {text.length > 0 && (
                      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold tabular-nums text-muted-foreground">
                        {CUSTOM_TEXT_MAX - text.length}
                      </span>
                    )}
                  </div>
                  {continuing && (
                    <p className="mt-1.5 px-0.5 text-[12px] font-semibold text-muted-foreground">
                      Updates last week&rsquo;s task ·{' '}
                      <button
                        type="button"
                        onClick={startFresh}
                        className="font-black text-primary"
                      >
                        Start fresh
                      </button>
                    </p>
                  )}
                </div>

                {loading && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}

                {!loading && visibleOptions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="px-0.5 text-[13px] font-black text-muted-foreground">
                      Or pick an idea
                    </p>
                    {visibleOptions.map((entry) => {
                      const selected = optionId === entry.id && fromIdea;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => pickIdea(entry)}
                          className={cn(
                            'flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left transition active:scale-[0.99]',
                            selected
                              ? 'border-primary bg-primary/[0.07]'
                              : 'border-border/60 bg-card hover:border-primary/40',
                          )}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-[14.5px] font-black leading-snug text-foreground">
                              {entry.text}
                            </span>
                            {entry.source === 'repeat' && (
                              <span className="text-[12px] font-bold text-muted-foreground">
                                {repeatLabel(entry)}
                              </span>
                            )}
                          </span>
                          {selected ? (
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-white">
                              <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                            </span>
                          ) : (
                            <span
                              aria-hidden
                              className="h-6 w-6 shrink-0 rounded-full border-2 border-border"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {error && (
                  <p role="alert" className="text-[13px] font-bold text-destructive">
                    {error}
                  </p>
                )}
              </div>
            )}

            {step === 'confirm' && area && (
              <div className="flex flex-col gap-4 py-2">
                <StepHeader
                  index={3}
                  eyebrow={area.shortLabel}
                  title="When will you do it?"
                  onBack={() => setStep('commitment')}
                  backLabel="Back to what you'll do"
                />

                <div
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-2.5"
                  aria-live="polite"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                    {area.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={area.coverImageUrl}
                        alt=""
                        decoding="async"
                        className="h-full w-full object-cover object-[center_40%]"
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          background: `linear-gradient(135deg, ${area.backgroundFrom ?? '#0f172a'}, ${area.backgroundTo ?? '#1e293b'})`,
                        }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-black leading-snug text-foreground">
                      {previewText}
                    </p>
                    <p
                      className={cn(
                        'truncate text-[13px] font-bold',
                        scheduleSummary ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {scheduleSummary || 'Pick days and a time'}
                    </p>
                  </div>
                </div>

                <fieldset className="min-w-0">
                  <legend className="mb-2 px-0.5 text-[14px] font-black text-foreground">
                    Days
                  </legend>
                  <div
                    className="grid gap-1.5"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(remainingDays.length, 1)}, minmax(0, 1fr))`,
                    }}
                  >
                    {remainingDays.map((day) => {
                      const on = days.includes(day);
                      const index = orderedDays.indexOf(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          aria-pressed={on}
                          aria-label={`${FULL_DAY_NAMES[day]}, ${dayHint(weekDates[index], todayKey)}`}
                          className={cn(
                            'flex min-h-12 flex-col items-center justify-center rounded-xl border-2 text-[13px] font-black transition active:scale-95',
                            on
                              ? 'border-primary bg-primary text-white'
                              : 'border-border/60 bg-card text-foreground hover:border-primary/50',
                          )}
                        >
                          <span>{DAY_NAMES[day]}</span>
                          <span
                            className={cn(
                              'text-[10.5px] font-bold',
                              on ? 'text-white/85' : 'text-muted-foreground',
                            )}
                          >
                            {dayHint(weekDates[index], todayKey)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className="min-w-0">
                  <legend className="mb-2 px-0.5 text-[14px] font-black text-foreground">
                    Time
                  </legend>
                  <div className="grid grid-cols-4 gap-1.5">
                    {TIME_PRESETS.map((preset) => {
                      const on =
                        !customTime && !perDayTimes && startTime === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${preset.label}, ${formatClock(preset.value)}`}
                          onClick={() => {
                            setStartTime(preset.value);
                            setCustomTime(false);
                            setPerDayTimes(false);
                          }}
                          className={cn(
                            'min-h-11 rounded-xl border-2 px-1 text-[13px] font-black transition active:scale-95',
                            on
                              ? 'border-primary bg-primary text-white'
                              : 'border-border/60 bg-card text-foreground hover:border-primary/50',
                          )}
                        >
                          {formatClock(preset.value)}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      aria-pressed={customTime || perDayTimes}
                      aria-expanded={customTime || perDayTimes}
                      onClick={() => setCustomTime(true)}
                      className={cn(
                        'min-h-11 rounded-xl border-2 px-1 text-[13px] font-black transition active:scale-95',
                        customTime || perDayTimes
                          ? 'border-primary bg-primary text-white'
                          : 'border-border/60 bg-card text-foreground hover:border-primary/50',
                      )}
                    >
                      Other
                    </button>
                  </div>

                  {(customTime || perDayTimes) && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {perDayTimes && pickedDays.length > 1 ? (
                        pickedDays.map((day) => (
                          <label
                            key={day}
                            className="flex items-center gap-3 rounded-xl border-2 border-border/60 bg-background px-3.5"
                          >
                            <span className="w-12 shrink-0 text-[13px] font-black text-foreground">
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
                              className={cn(
                                TIME_INPUT_RESET,
                                'h-11 flex-1 bg-transparent text-right text-[16px] font-bold leading-[44px] text-foreground outline-none',
                                '[&::-webkit-date-and-time-value]:text-right',
                              )}
                            />
                          </label>
                        ))
                      ) : (
                        <input
                          type="time"
                          value={startTime}
                          aria-label="Time"
                          onChange={(event) => setStartTime(event.target.value)}
                          className={cn(
                            TIME_INPUT_RESET,
                            'h-11 rounded-xl border-2 border-border/60 bg-background px-3.5 text-center text-[16px] font-bold leading-[44px] text-foreground outline-none focus:border-primary',
                            '[&::-webkit-date-and-time-value]:text-center',
                          )}
                        />
                      )}
                      {pickedDays.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPerDayTimes((prev) => !prev);
                            setCustomTime(true);
                          }}
                          className="self-start px-0.5 text-[12.5px] font-black text-primary"
                        >
                          {perDayTimes ? 'Same time every day' : 'Different time per day'}
                        </button>
                      )}
                    </div>
                  )}
                </fieldset>

                {(() => {
                  const chosen = tagId
                    ? view.userTags.find((tag) => tag.id === tagId)
                    : null;
                  const shown =
                    chosen ??
                    (area.tagId
                      ? {
                          id: area.tagId,
                          name: area.tagName ?? area.shortLabel,
                          color: area.tagColor ?? '#22c55e',
                        }
                      : null);
                  return (
                    <div>
                      <div className="flex items-center gap-2 px-0.5">
                        <span className="shrink-0 text-[14px] font-black text-foreground">
                          Tag
                        </span>
                        <span className="min-w-0 flex-1">
                          {shown ? (
                            <span
                              className="inline-flex max-w-full items-center truncate rounded-lg px-2 py-0.5 text-[12.5px] font-black"
                              style={{
                                backgroundColor: `${shown.color}22`,
                                color: shown.color,
                              }}
                            >
                              {shown.name}
                            </span>
                          ) : (
                            <span className="text-[12.5px] font-bold text-muted-foreground">
                              New &ldquo;{area.shortLabel}&rdquo; tag
                            </span>
                          )}
                        </span>
                        {view.userTags.length > 0 && (
                          <button
                            type="button"
                            aria-expanded={pickingTag}
                            onClick={() => setPickingTag((v) => !v)}
                            className="min-h-9 shrink-0 rounded-lg px-2 text-[12.5px] font-black text-primary"
                          >
                            {pickingTag ? 'Done' : 'Change'}
                          </button>
                        )}
                      </div>
                      {pickingTag && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {view.userTags.map((tag) => {
                            const takenByOther =
                              !!tag.linkedCategoryId &&
                              tag.linkedCategoryId !== area.categoryId;
                            const locked = takenByOther && !view.isPremium;
                            const current = (tagId ?? area.tagId) === tag.id;
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                aria-pressed={current}
                                aria-label={
                                  takenByOther
                                    ? `${tag.name}, connected to ${tag.linkedAreaName}${locked ? ', Plus only' : ''}`
                                    : tag.name
                                }
                                onClick={() => {
                                  if (locked) {
                                    onUpgrade();
                                    return;
                                  }
                                  setTagId(tag.id);
                                  setPickingTag(false);
                                }}
                                className={cn(
                                  'inline-flex min-h-9 max-w-[11rem] items-center gap-1 truncate rounded-lg px-2.5 text-[12.5px] font-black transition',
                                  locked && 'opacity-50',
                                  !locked &&
                                    (current
                                      ? 'ring-2 ring-primary'
                                      : 'opacity-85 hover:opacity-100'),
                                )}
                                style={{
                                  backgroundColor: `${tag.color}22`,
                                  color: tag.color,
                                }}
                              >
                                {locked && (
                                  <Lock className="h-3 w-3 shrink-0" strokeWidth={3} />
                                )}
                                {tag.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {error && (
                  <p role="alert" className="text-[13px] font-bold text-destructive">
                    {error}
                  </p>
                )}
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col gap-5 pb-2 pt-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
                  <Check className="h-8 w-8 text-primary" strokeWidth={3} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-[22px] font-black leading-tight text-foreground">
                    Your Leap is set
                  </h2>
                  <p className="mx-auto max-w-[32ch] text-[14px] font-semibold leading-snug text-muted-foreground">
                    {!result
                      ? 'Your tasks are on your list.'
                      : result.continued
                        ? 'Last week’s task carries on.'
                        : `${result.taskCount} task${result.taskCount === 1 ? '' : 's'} added to your list.`}{' '}
                    We&apos;ll remind you each time.
                  </p>
                </div>
                {area && previewText && (
                  <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-left">
                    <p className="text-[12px] font-black uppercase tracking-wide text-muted-foreground">
                      {area.shortLabel}
                    </p>
                    <p className="mt-1 text-[15px] font-black leading-snug text-foreground">
                      {previewText}
                    </p>
                    <p className="mt-1 text-[13px] font-bold text-primary">
                      {result?.scheduleLabel ?? scheduleSummary}
                    </p>
                  </div>
                )}
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
              {step === 'confirm' && previewText && days.length > 0 && (
                <div className="mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                  {/* Two columns, not two rows: what you do reads down the
                      left, what it pays sits whole on the right. The Plus
                      note belongs to the label it qualifies, so it lives in
                      the label's column and stays smaller than the reward. */}
                  {/* A condition, not a formula. The earlier "7 a session ·
                      +32 for all 2" asked the reader to hold three unlabelled
                      numbers and add them to reach the one already printed on
                      the right — and it read as nonsense at one day ("+32 for
                      all 1"). Naming what has to happen leaves the badge to
                      say what it is worth, which is the half that moves as
                      days are tapped. */}
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[12.5px] font-bold text-muted-foreground">
                      {days.length === 1
                        ? 'Finish it this week'
                        : `Finish all ${days.length} days this week`}
                    </span>
                    {view.ladder.multiplier > 1 && (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-orange-500/12 px-2 py-0.5 text-[11px] font-black text-orange-600 dark:text-orange-400">
                        <Flame className="h-3 w-3 fill-current" strokeWidth={2} />
                        {formatPactRate(view.ladder.multiplier)} streak included
                      </span>
                    )}
                    {!view.isPremium && <PlusDoubleNote onClick={onUpgrade} />}
                  </span>
                  <QuestRewardTileBadge
                    rewards={[
                      { type: 'FLIES', amount: rewardPreview },
                      ...(preview?.rewards ?? view.completionRewards),
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
              {step === 'intro' ? (
                <button
                  type="button"
                  onClick={dismissIntro}
                  className="h-12 w-full rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-transform active:translate-y-[2px] active:shadow-none"
                >
                  Let&apos;s go
                </button>
              ) : step === 'commitment' ? (
                <button
                  type="button"
                  disabled={!previewText}
                  onClick={() => setStep('confirm')}
                  className="h-12 w-full rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:shadow-none"
                >
                  Next
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


/**
 * Two rows of area art drifting in opposite directions.
 *
 * Each row renders its tiles twice and animates to translateX(-50%): the
 * duplicate lands exactly where the original began, so the loop point cannot
 * be seen. `linear` timing is what sells it — any easing exposes the reset.
 * Only `transform` animates, so both rows stay on the compositor no matter
 * how many tiles are on screen.
 */
/**
 * One beat of the story: what you do, and what it hands back. The trailing
 * slot is the point — a numbered list of the form's own fields told the reader
 * how to fill in a screen they were about to see anyway, and never once said
 * what any of it was worth.
 */
function StepHeader({
  index,
  eyebrow,
  title,
  subtitle,
  onBack,
  backLabel,
}: {
  index: number;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="pt-1">
      <div className="flex items-center gap-2 pr-12">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel ?? 'Back'}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground transition hover:bg-muted active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
        ) : null}
        <div
          className="flex flex-1 items-center gap-1"
          role="progressbar"
          aria-label="Leap setup progress"
          aria-valuemin={1}
          aria-valuemax={LEAP_STEPS}
          aria-valuenow={index}
          aria-valuetext={`Step ${index} of ${LEAP_STEPS}`}
        >
          {Array.from({ length: LEAP_STEPS }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < index ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span className="shrink-0 text-[12px] font-black tabular-nums text-muted-foreground">
          {index}/{LEAP_STEPS}
        </span>
      </div>
      <div className="mt-3">
        {eyebrow && (
          <p className="text-[13px] font-black text-primary">{eyebrow}</p>
        )}
        <h2 className="text-[21px] font-black leading-tight text-foreground">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-[13px] font-semibold leading-snug text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function IntroBeat({
  index,
  icon,
  title,
  hint,
  trailing,
  below,
}: {
  index?: number;
  /** Stands in for the step number on a row that is not a step. */
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  trailing?: React.ReactNode;
  /** Full-width content under the row, inside the same divider band. */
  below?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2.5 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {icon ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          {icon}
        </span>
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-black tabular-nums text-white">
          {index}
        </span>
      )}
      <span className="min-w-0 flex-1 basis-0">
        <span className="block text-[14px] font-black leading-tight text-foreground">
          {title}
        </span>
        {hint && (
          <span className="mt-0.5 block text-[11.5px] font-semibold leading-tight text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {trailing && (
        <span className="shrink-0 narrow:ml-9 narrow:basis-full">
          {trailing}
        </span>
      )}
      </div>
      {below}
    </li>
  );
}

function AreaMarquee({ areas }: { areas: PactAreaChoice[] }) {
  const reduceMotion = useReducedMotion();
  if (areas.length === 0) return null;

  // A short list would leave gaps mid-loop, so it is repeated until each row
  // is comfortably wider than any phone before the duplicate is appended.
  const padded: PactAreaChoice[] = [];
  while (padded.length < 8) padded.push(...areas);
  const rowA = padded;

  const renderRow = (row: PactAreaChoice[], reverse: boolean, seconds: number) => (
    <div
      className="flex w-max gap-2.5"
      style={
        reduceMotion
          ? undefined
          : {
              animation: `pact-marquee ${seconds}s linear infinite`,
              animationDirection: reverse ? 'reverse' : 'normal',
              willChange: 'transform',
            }
      }
    >
      {[...row, ...row].map((area, index) => (
        <div
          key={`${area.categoryId}-${index}`}
          className="relative h-[86px] w-[124px] shrink-0 overflow-hidden rounded-2xl border border-border/40 shadow-sm"
        >
          {area.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={area.coverImageUrl}
              alt=""
              aria-hidden
              decoding="async"
              loading="lazy"
              className="h-full w-full object-cover object-[center_40%]"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(135deg, ${area.backgroundFrom ?? '#134e4a'}, ${area.backgroundTo ?? '#0f172a'})`,
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <span
            className="absolute bottom-1.5 left-2 right-2 truncate text-[13px] leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.9)]"
            style={{
              fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
              WebkitTextStroke: '1px rgba(15, 23, 42, 0.95)',
              paintOrder: 'stroke fill',
            }}
          >
            {area.shortLabel || area.name}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div
      aria-hidden
      className="-mx-5 flex flex-col gap-2.5 overflow-hidden py-1"
      style={{
        maskImage:
          'linear-gradient(to right, transparent, #000 14%, #000 86%, transparent)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent, #000 14%, #000 86%, transparent)',
      }}
    >
      {renderRow(rowA, false, 38)}
    </div>
  );
}
