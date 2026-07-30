'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Target } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/uiStore';

export type WeeklyFacts = {
  thisWeek: {
    completionRate: number;
    completionDelta: number;
    planned: number;
    completed: number;
    focusMinutes: number;
    activeDays: number;
    bestRun: number;
  };
  longerTerm: {
    windowDays: number;
    bestDay: string | null;
    hardestDay: string | null;
    topAreas: Array<{ name: string; rate: number; planned: number }>;
    slippingHabits: Array<{ title: string; rate: number }>;
    finishWindow: string | null;
    typicalTasks: number;
    lighterRate: number;
    heavierRate: number;
  };
};

type Note = {
  locked?: boolean;
  headline?: string;
  takeaway?: string;
  findings?: Array<{ label: string; detail: string }>;
  focus?: string;
  tooEarly?: boolean;
  failed?: boolean;
};

/**
 * The weekly read of the numbers, written once per week.
 *
 * Free accounts get the real card with the text redacted rather than a
 * feature-list pitch: the upgrade is easier to judge when you can see the
 * shape of what you'd get, and it lands at the moment the person is already
 * looking at their own week.
 *
 * Roughly four in five people scan a screen like this rather than read it, so
 * the note is shaped for scanning — one sentence up top, then labelled
 * findings with the scannable part in bold. Two prose paragraphs read as a
 * wall no matter how they are styled.
 */
export function WeeklyCoachCard({ facts }: { facts: WeeklyFacts }) {
  const setPremiumModalOpen = useUIStore((s) => s.setPremiumModalOpen);
  const [note, setNote] = useState<Note | null>(null);
  const asked = useRef(false);

  // Entitlement is decided server-side and reported as `locked`. The client
  // used to read a premium flag off the inventory summary, which doesn't
  // include one — so Plus members were shown the paywall.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    void fetch(`/api/insights/weekly?timezone=${encodeURIComponent(timezone)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(facts),
    })
      .then((res) => res.json())
      .then((data: Note) => setNote(data))
      .catch(() => setNote({ failed: true }));
  }, [facts]);

  const isPremium = note ? !note.locked : false;
  // Anything that came back without a usable note — too early, generation
  // failed, or a malformed payload — hides the card instead of spinning.
  const unusable = !!note && !note.locked && (!note.headline || !note.takeaway);
  if (note && !note.locked && (note.tooEarly || note.failed || unusable)) return null;

  return (
    <section
      className="relative overflow-hidden rounded-[24px] bg-card p-5 ring-1 ring-border md:p-6"
      aria-labelledby="coach-heading"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Weekly read
          </p>
          <h2 id="coach-heading" className="text-sm font-black text-foreground">
            What your week is telling you
          </h2>
        </div>
        {!isPremium && (
          <span className="ml-auto inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1 text-[10px] font-black uppercase leading-none tracking-[0.14em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-emerald-900/40">
            Plus
          </span>
        )}
      </div>

      {!note ? (
        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Reading your week…
        </div>
      ) : isPremium ? (
        <div className="mt-4 max-w-[62ch]">
          <p className="text-xl font-black leading-snug tracking-tight text-foreground md:text-2xl">
            {note.headline}
          </p>
          <p className="mt-2 text-[15px] font-medium leading-relaxed text-foreground/85">
            {note.takeaway}
          </p>

          <ul className="mt-4 space-y-3">
            {note.findings?.map((finding) => (
              <li key={finding.label} className="flex gap-3">
                <span aria-hidden="true" className="flex h-6 w-1.5 shrink-0 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <span className="font-black text-foreground">{finding.label}.</span>{' '}
                  {finding.detail}
                </p>
              </li>
            ))}
          </ul>

          {note.focus ? (
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">
                <Target className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Try this week
                </p>
                <p className="mt-1 text-sm font-bold leading-relaxed text-foreground">
                  {note.focus}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <LockedPreview facts={facts} onUpgrade={() => setPremiumModalOpen(true, 'insights_weekly')} />
      )}
    </section>
  );
}

function LockedPreview({
  facts,
  onUpgrade,
}: {
  facts: WeeklyFacts;
  onUpgrade: () => void;
}) {
  // One real, already-earned sentence sits above the blur: the teaser has to
  // prove the read is about *their* week, not a generic feature blurb.
  const hook =
    facts.thisWeek.completionDelta !== 0
      ? `You finished ${facts.thisWeek.completionRate}% of your plan — ${Math.abs(facts.thisWeek.completionDelta)} points ${facts.thisWeek.completionDelta > 0 ? 'up' : 'down'} on last week.`
      : `You finished ${facts.thisWeek.completionRate}% of what you planned this week.`;

  return (
    <div className="mt-4">
      <p className="text-xl font-black leading-tight tracking-tight text-foreground md:text-2xl">
        {hook}
      </p>
      {/* Redacted lines, not blurred prose: blur is only a visual filter, so
          any placeholder copy stays readable in the DOM — and inventing a
          sentence about someone's week that they can then read in devtools is
          worse than showing nothing. These bars carry the shape of the answer
          without asserting anything. */}
      <div aria-hidden="true" className="relative mt-4 space-y-2">
        {[
          'w-full',
          'w-[97%]',
          'w-[88%]',
          'w-[62%]',
          'w-[94%]',
          'w-[71%]',
        ].map((width, index) => (
          <span
            key={width}
            className={cn(
              'block h-3 rounded-full bg-muted-foreground/15',
              width,
              index === 4 && 'mt-4',
            )}
          />
        ))}
        <span className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
      </div>
      {/* The app's Plus surfaces all wear the same gold plate and mascot — a
          plain green CTA here would read as an ordinary action instead of an
          upgrade. */}
      <button
        type="button"
        onClick={onUpgrade}
        aria-label="Unlock Frogress Plus"
        className={cn(
          'group relative isolate mx-auto mt-5 flex w-full max-w-md items-center gap-2 rounded-2xl py-3 pl-2 pr-4',
          'text-left ring-2 ring-amber-200/80 transition-transform active:scale-[0.98]',
        )}
      >
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
        />
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent"
        />
        <Icon
          name="frogPlus"
          className="-my-4 h-20 w-20 shrink-0 drop-shadow-[0_3px_0_rgba(31,98,28,0.35)] animate-wiggle"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black tracking-tight text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
            Unlock your weekly read
          </span>
          <span className="block text-[11px] font-bold text-emerald-900/75">
            A new one every week, from your own numbers
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1 text-[10px] font-black uppercase leading-none tracking-[0.14em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-emerald-900/40">
          Plus
        </span>
      </button>
    </div>
  );
}
