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
  Pencil,
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
 * What the area's own tasks say, and null when they say nothing. Only a run in
 * progress or a real gap gets a word; an area with no history gets no line.
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
  if (!area.hasTag || area.quietDays === null) return null;
  if (area.quietDays <= 1) return { label: 'Finished something today', tone: 'good' };
  return {
    label: `Quiet for ${area.quietDays} days`,
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
  const [customText, setCustomText] = useState('');
  const [continueText, setContinueText] = useState('');
  const [days, setDays] = useState<number[]>(() => fitDays(PACT_DEFAULT_DAYS));
  const [pastDayHint, setPastDayHint] = useState<{
    text: string;
    id: number;
  } | null>(null);
  const [startTime, setStartTime] = useState('19:00');
  // Your own words are where the step starts — the card is live and marked
  // from the first frame, and the ideas below are the detour. The keyboard is
  // not forced up with it: a sheet that opens onto a keyboard hides the very
  // ideas someone with a blank mind came here for.
  const [writingOwn, setWritingOwn] = useState(true);
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
    setWritingOwn(true);
    setCustomText('');
    setContinueText('');
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
  const continuing = !writingOwn && !!option?.continuePactId;

  // Typing is the selection — a field you have to arm with a separate tap is a
  // field people abandon. Switching in drops the idea that was picked, and its
  // schedule with it: a repeat's days belong to its own sentence, not to a new
  // one that happens to be typed over it.
  const startWritingOwn = () => {
    if (writingOwn) return;
    setWritingOwn(true);
    setOptionId(null);
    setDays([]);
  };

  const chooseArea = async (categoryId: string) => {
    setAreaId(categoryId);
    setStep('commitment');
    setOptions(null);
    setOptionId(null);
    setWritingOwn(true);
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
    const text = writingOwn
      ? customText.trim()
      : continuing
        ? continueText.trim()
        : (option?.text ?? '');
    if (!text) {
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
          text,
          days,
          startTime,
          dayTimes: perDayTimes ? dayTimes : undefined,
          tagId: tagId ?? undefined,
          suggestionId: writingOwn ? undefined : option?.id,
          continueFromPactId: continuing ? option?.continuePactId : undefined,
          source: writingOwn ? 'custom' : option?.source,
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
    if (isPastDay(day)) {
      setPastDayHint({
        text: `${DAY_NAMES[day]} has passed \u2014 pick a day still ahead this week.`,
        id: Date.now(),
      });
      return;
    }
    setPastDayHint(null);
    setDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  };

  const previewText = writingOwn
    ? customText.trim()
    : continuing
      ? continueText.trim()
      : (option?.text ?? '');
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
                <div className="pt-2">
                  <p className="text-[13px] font-black text-primary">
                    This week
                  </p>
                  <h2 className="mt-1 text-[20px] font-black leading-tight text-foreground">
                    Pick your area
                  </h2>
                  <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
                    Just one. You&apos;ll choose again next week.
                  </p>
                </div>
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
                              'flex h-8 items-center truncate px-3 text-[11px] font-bold',
                              status?.tone === 'good'
                                ? 'text-primary'
                                : status?.tone === 'urgent'
                                  ? 'text-amber-600 dark:text-amber-400'
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
                    <p className="text-[13px] font-black text-primary">
                      {area.shortLabel}
                    </p>
                    <h2 className="text-[19px] font-black leading-tight text-foreground">
                      What will you do?
                    </h2>
                    <p className="mt-0.5 text-[12.5px] font-bold text-muted-foreground">
                      The clearer it is, the easier the Leap.
                    </p>
                  </div>
                </div>

                {loading && (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}

                {!loading && options && (
                  <div className="flex flex-col gap-3">
                    {/* Never gated, and never last. The pact is the one system
                        where the user names their own goal, and goal-setting
                        theory's difficulty effects are conditional on the goal
                        being self-endorsed — charging for that, or burying it
                        under a menu of ready-made answers, turns the whole
                        mechanic into someone else's assignment. The field is
                        open from the start: the ideas below are a fallback for
                        a blank mind, not the default path. */}
                    <div
                      className={cn(
                        'rounded-2xl border p-3.5 transition',
                        writingOwn
                          ? 'border-primary bg-primary/[0.07]'
                          : 'border-border/60 bg-card/60',
                      )}
                    >
                      <label
                        htmlFor="pact-own-words"
                        className="flex items-center gap-2 text-[15px] font-black text-foreground"
                      >
                        <Pencil
                          className={cn(
                            'h-[18px] w-[18px] shrink-0',
                            writingOwn ? 'text-primary' : 'text-muted-foreground',
                          )}
                          strokeWidth={2.5}
                        />
                        In your own words
                      </label>
                      <input
                        id="pact-own-words"
                        value={customText}
                        onFocus={() => {
                          // Reading the field is not choosing it. A tap that
                          // silently dropped a picked idea punished anyone who
                          // opened the keyboard to see what was on offer;
                          // typing is the commitment, and text already in the
                          // box means the choice was made earlier.
                          if (customText.trim()) startWritingOwn();
                        }}
                        onChange={(event) => {
                          startWritingOwn();
                          setCustomText(event.target.value);
                        }}
                        maxLength={CUSTOM_TEXT_MAX}
                        placeholder={customPlaceholder}
                        className="mt-2.5 h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-[16px] font-bold text-foreground outline-none focus:border-primary"
                      />
                      {customText.length > 0 && (
                        <div className="mt-2 flex justify-end">
                          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                            {customText.length}/{CUSTOM_TEXT_MAX}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="h-px flex-1 bg-border/70" />
                      <span className="text-[11.5px] font-black uppercase tracking-wide text-muted-foreground">
                        Or start from an idea
                      </span>
                      <span className="h-px flex-1 bg-border/70" />
                    </div>

                    {visibleOptions.map((entry) => {
                      const selected = !writingOwn && optionId === entry.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setWritingOwn(false);
                            setOptionId(entry.id);
                            setContinueText(entry.text);
                            // Only a repeat carries a schedule, and it is the
                            // user's own from a week that worked. Everything
                            // else starts blank so the days are chosen, not
                            // inherited.
                            setDays(
                              entry.source === 'repeat'
                                ? fitDays(entry.days)
                                : [],
                            );
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
                            {entry.source === 'repeat' && (
                              <span className="text-[12.5px] font-bold text-muted-foreground">
                                {repeatLabel(entry)}
                              </span>
                            )}
                          </span>
                          {selected ? (
                            <Check
                              className="h-5 w-5 shrink-0 text-primary"
                              strokeWidth={3}
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="h-5 w-5 shrink-0 rounded-full border-2 border-border"
                            />
                          )}
                        </button>
                      );
                    })}

                    {/* A picked idea is still the user's sentence to keep or
                        change — the words that end up on the task should be
                        the ones they endorse, and re-typing a suggestion by
                        hand to adjust it is the kind of friction that makes
                        people take the canned answer instead. */}
                    {!writingOwn && option && !option.continuePactId && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomText(option.text.slice(0, CUSTOM_TEXT_MAX));
                          startWritingOwn();
                          window.requestAnimationFrame(() => {
                            document
                              .getElementById('pact-own-words')
                              ?.focus();
                          });
                        }}
                        className="self-start text-[12.5px] font-black text-primary underline underline-offset-2"
                      >
                        Reword this one
                      </button>
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
                  <div className="min-w-0">
                    <h2 className="text-[19px] font-black leading-tight text-foreground">
                      How often, and when?
                    </h2>
                    <p className="text-[12.5px] font-bold text-muted-foreground">
                      More days, bigger reward — if you keep them all.
                    </p>
                  </div>
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
                      className="absolute bottom-2 left-3.5 text-[19px] leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]"
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
                    {continuing ? (
                      <>
                        <input
                          value={continueText}
                          onChange={(event) =>
                            setContinueText(event.target.value)
                          }
                          maxLength={80}
                          aria-label="What you’ll do"
                          className="h-9 w-full rounded-lg border border-border/60 bg-background px-2 text-[16px] font-black leading-snug text-foreground outline-none focus:border-primary"
                        />
                        <p className="mt-1.5 text-[12px] font-semibold text-muted-foreground">
                          This edits last week&rsquo;s task instead of adding a
                          new one.
                        </p>
                      </>
                    ) : (
                      <p className="text-[17px] font-black leading-snug text-foreground">
                        {previewText}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4">
                  <div>
                    <p className="mb-2 text-[13px] font-black text-muted-foreground">
                      Days
                    </p>
                    <div className="flex gap-1.5">
                      {orderedDays.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          aria-disabled={isPastDay(day)}
                          aria-label={
                            isPastDay(day)
                              ? `${DAY_NAMES[day]} \u2014 already passed`
                              : DAY_NAMES[day]
                          }
                          aria-pressed={days.includes(day)}
                          className={cn(
                            'h-10 flex-1 rounded-lg text-[13px] font-black transition',
                            isPastDay(day)
                              ? 'cursor-not-allowed bg-muted/40 text-muted-foreground/40 line-through'
                              : days.includes(day)
                                ? 'bg-primary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted/70',
                          )}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                    {pastDayHint && (
                      <p
                        key={pastDayHint.id}
                        role="status"
                        className="leap-hint-in mt-2 text-[12px] font-semibold text-muted-foreground"
                      >
                        {pastDayHint.text}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[13px] font-black text-muted-foreground">
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
                                className={cn(
                                  TIME_INPUT_RESET,
                                  'h-9 flex-1 rounded-lg bg-transparent text-left text-[15px] font-bold leading-9 text-foreground outline-none',
                                  '[&::-webkit-date-and-time-value]:text-left',
                                )}
                              />
                            </label>
                          ))}
                      </div>
                    ) : (
                      <input
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className={cn(
                          TIME_INPUT_RESET,
                          'h-11 rounded-xl border border-border/60 bg-background px-3 text-center text-[15px] font-bold leading-[42px] text-foreground outline-none focus:border-primary',
                          '[&::-webkit-date-and-time-value]:text-center',
                        )}
                      />
                    )}
                  </div>
                </div>

                {/* Which tag the sessions carry is invisible until the tasks
                    appear, and by then it is already on them. Named here, with
                    the user's own tags one tap away. */}
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] font-black text-muted-foreground">
                    Tag
                  </p>
                  {(() => {
                    const chosen = tagId
                      ? view.userTags.find((tag) => tag.id === tagId)
                      : null;
                    const shown = chosen ??
                      (area.tagId
                        ? {
                            id: area.tagId,
                            name: area.tagName ?? area.shortLabel,
                            color: area.tagColor ?? '#22c55e',
                          }
                        : null);
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        {shown ? (
                          <span
                            className="inline-flex max-w-[12rem] items-center truncate rounded-xl px-2.5 py-1 text-[12px] font-black"
                            style={{
                              backgroundColor: `${shown.color}22`,
                              color: shown.color,
                            }}
                          >
                            {shown.name}
                          </span>
                        ) : (
                          <span className="text-[12.5px] font-bold text-muted-foreground">
                            We&apos;ll make a “{area.shortLabel}” tag
                          </span>
                        )}
                        {view.userTags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPickingTag((v) => !v)}
                            className="text-[11px] font-black text-primary"
                          >
                            {pickingTag ? 'Done' : 'Use another'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {pickingTag && (
                    <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/40 p-2">
                      {view.userTags.map((tag) => {
                        const takenByOther =
                          !!tag.linkedCategoryId &&
                          tag.linkedCategoryId !== area.categoryId;
                        const locked = takenByOther && !view.isPremium;
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            disabled={locked}
                            title={
                              takenByOther
                                ? `Connected to ${tag.linkedAreaName}`
                                : undefined
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
                              'inline-flex max-w-[10rem] items-center gap-1 truncate rounded-lg px-2.5 py-1 text-[12px] font-black transition',
                              locked && 'cursor-not-allowed opacity-40',
                              !locked &&
                                ((tagId ?? area.tagId) === tag.id
                                  ? 'ring-2 ring-primary'
                                  : 'opacity-80 hover:opacity-100'),
                            )}
                            style={{
                              backgroundColor: `${tag.color}22`,
                              color: tag.color,
                            }}
                          >
                            {locked && (
                              <Lock
                                className="h-3 w-3 shrink-0"
                                strokeWidth={3}
                              />
                            )}
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                    Your Leap is set
                  </h2>
                  <p className="mx-auto max-w-[32ch] text-[14px] font-semibold leading-snug text-muted-foreground">
                    {!result
                      ? "Your tasks are on your list. We'll remind you each time."
                      : result.continued
                        ? `Last week's task carries on — ${result.scheduleLabel}. We'll remind you each time.`
                        : `${result.taskCount} task${result.taskCount === 1 ? '' : 's'} added — ${result.scheduleLabel}. We'll remind you each time.`}
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
                  Choose days &amp; time
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
