'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Flame, Trophy } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';

// Mirrors the live defaults in PactConfig: a week is worth 20 × (sessions + 1),
// six of which lands on each session as it is ticked.
const FLIES_PER_SESSION = 6;
const WEEK_VALUE_PER_SESSION = 20;
const WEEK_VALUE_BASE_SESSIONS = 1;

const LADDER = [
  { weeks: 4, multiplier: 1.25 },
  { weeks: 7, multiplier: 1.5 },
  { weeks: 10, multiplier: 1.8 },
  { weeks: 12, multiplier: 1.8, prestige: true },
];

type PactPreview = {
  id: string;
  area: string;
  accent: string;
  cover: string;
  gradient: [string, string];
  commitment: string;
  schedule: string;
  streakWeeks: number;
  sessions: Array<{ label: string; when: string; done: boolean }>;
};

const pactPreviews: PactPreview[] = [
  {
    id: 'fitness',
    area: 'Fitness',
    accent: '#4d9850',
    cover: '/api/quests/cover?type=category&id=9c6610f1-b92f-4e49-99f2-f986b43f6217',
    gradient: ['#14532d', '#052e16'],
    commitment: 'Run three times this week',
    schedule: 'Mon · Wed · Fri · 19:00',
    streakWeeks: 4,
    sessions: [
      { label: 'Run', when: 'Mon 19:00', done: true },
      { label: 'Run', when: 'Wed 19:00', done: true },
      { label: 'Run', when: 'Fri 19:00', done: false },
    ],
  },
  {
    id: 'mindfulness',
    area: 'Mindfulness',
    accent: '#6366f1',
    cover: '/api/quests/cover?type=category&id=a681ca88-6a60-46a8-935c-8bbaab5158f7',
    gradient: ['#312e81', '#0f172a'],
    commitment: 'Sit for ten quiet minutes',
    schedule: 'Tue · Thu · 07:30',
    streakWeeks: 1,
    sessions: [
      { label: '10-minute sit', when: 'Tue 07:30', done: true },
      { label: '10-minute sit', when: 'Thu 07:30', done: false },
    ],
  },
  {
    id: 'productive',
    area: 'Productivity',
    accent: '#b45309',
    cover: '/api/quests/cover?type=category&id=d8eb461c-da89-4d6c-804b-67991c165cfb',
    gradient: ['#78350f', '#1c1917'],
    commitment: 'Two deep work blocks',
    schedule: 'Tue · Thu · 09:00',
    streakWeeks: 7,
    sessions: [
      { label: 'Deep work block', when: 'Tue 09:00', done: true },
      { label: 'Deep work block', when: 'Thu 09:00', done: false },
    ],
  },
];

function multiplierFor(weeks: number) {
  let rate = 1;
  for (const rung of LADDER) if (weeks >= rung.weeks) rate = rung.multiplier;
  return rate;
}

function rateLabel(multiplier: number) {
  return `×${Number.isInteger(multiplier) ? multiplier : multiplier.toFixed(2).replace(/0$/, '')}`;
}

function AreaArt({ pact }: { pact: PactPreview }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [pact.cover]);

  if (failed) {
    return (
      <div
        className="h-full w-full"
        style={{
          background: `linear-gradient(135deg, ${pact.gradient[0]}, ${pact.gradient[1]})`,
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pact.cover}
      alt={pact.area}
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover object-[center_35%]"
    />
  );
}

export function MarketingPactPreview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activePact = pactPreviews[activeIndex];

  const done = activePact.sessions.filter((session) => session.done).length;
  const target = activePact.sessions.length;
  const rate = multiplierFor(activePact.streakWeeks);
  const weekFlies = Math.round(
    WEEK_VALUE_PER_SESSION * (target + WEEK_VALUE_BASE_SESSIONS) * rate,
  );
  const nextRung = LADDER.find((rung) => activePact.streakWeeks < rung.weeks);
  const nextIndex = nextRung ? LADDER.indexOf(nextRung) : -1;

  useEffect(() => {
    pactPreviews.forEach((pact) => {
      const image = new window.Image();
      image.src = pact.cover;
    });
    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % pactPreviews.length);
    }, 5200);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="rounded-[30px] border border-border/60 bg-card p-5 shadow-xl shadow-emerald-950/10 sm:p-7">
      <div className="overflow-hidden rounded-[24px] border border-border/50 bg-card shadow-sm">
        <div className="relative aspect-[3/1] overflow-hidden bg-[#153b2b]">
          <AnimatePresence initial={false}>
            <motion.div
              key={activePact.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0"
            >
              <AreaArt pact={activePact} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute left-3 top-2.5 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                This week
              </span>
              <span className="absolute right-2.5 top-2.5 inline-flex h-7 items-center gap-1 rounded-full bg-black/50 px-2.5 text-[11px] font-black text-white backdrop-blur-sm">
                <Flame className="h-3.5 w-3.5 fill-current text-amber-300" strokeWidth={2} />
                {activePact.streakWeeks} Leaps · pays {rateLabel(rate)}
              </span>
              <span
                className="absolute bottom-2 left-3.5 text-[22px] uppercase leading-none tracking-wide text-white"
                style={{
                  fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                  WebkitTextStroke: '1.8px rgba(15, 23, 42, 0.95)',
                  paintOrder: 'stroke fill',
                }}
              >
                {activePact.area}
              </span>
              <span className="absolute bottom-2.5 right-2.5 max-w-[60%] truncate rounded-lg bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                {activePact.schedule}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border/50 bg-card shadow-sm">
              <Fly size={38} y={-2} interactive={false} alwaysPlay oversample={1.25} />
              <span className="absolute -bottom-1 -right-1 rounded-md bg-foreground px-1.5 py-0.5 text-[8px] font-black text-background tabular-nums">
                +{weekFlies}
              </span>
            </div>
            <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border/50 bg-card shadow-sm">
              <div className="h-[54px] w-[54px]">
                <GiftRive className="h-full w-full" color={0} paused={false} animation="box_shake" />
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-[15px] font-black leading-snug">{activePact.commitment}</p>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: activePact.accent }}
                    initial={false}
                    animate={{ width: `${(done / target) * 100}%` }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="text-[10px] font-black tabular-nums text-muted-foreground">
                  {done}/{target}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-1.5" aria-label="Preview a weekly leap">
        {pactPreviews.map((pact, index) => (
          <button
            key={pact.id}
            type="button"
            aria-label={`Show the ${pact.area} pact`}
            aria-pressed={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-7' : 'w-2 bg-muted'}`}
            style={index === activeIndex ? { backgroundColor: pact.accent } : undefined}
          />
        ))}
      </div>

      <p className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        Added straight to your week
      </p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activePact.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.22 }}
          className="mt-2.5 space-y-2"
        >
          {activePact.sessions.map((session, index) => (
            <div
              key={`${session.label}-${index}`}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/35 px-3 py-2.5 shadow-sm sm:px-4"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                  session.done ? 'border-transparent text-white' : 'border-border'
                }`}
                style={session.done ? { backgroundColor: activePact.accent } : undefined}
              >
                {session.done ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : null}
              </span>
              <p
                className={`min-w-0 flex-1 truncate text-[13px] font-black ${
                  session.done ? 'text-muted-foreground line-through decoration-1' : ''
                }`}
              >
                {session.label}
              </p>
              <span className="shrink-0 text-[11px] font-black text-muted-foreground tabular-nums">
                {session.when}
              </span>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 rounded-[22px] border border-border/50 bg-muted/25 px-3.5 py-3">
        <p className="text-[12.5px] font-black leading-snug">
          {nextRung
            ? nextRung.prestige
              ? `${nextRung.weeks - activePact.streakWeeks} more week${
                  nextRung.weeks - activePact.streakWeeks === 1 ? '' : 's'
                } to finish the cycle and claim a legendary`
              : `${nextRung.weeks - activePact.streakWeeks} more week${
                  nextRung.weeks - activePact.streakWeeks === 1 ? '' : 's'
                } and every week pays ${rateLabel(nextRung.multiplier)}`
            : 'Twelve weeks straight — the set piece is yours'}
        </p>
        <div className="relative mt-3">
          <div className="absolute inset-x-3 top-[15px] h-1.5 -translate-y-1/2 rounded-full bg-muted" />
          <motion.div
            className="absolute left-3 top-[15px] h-1.5 -translate-y-1/2 rounded-full bg-amber-400"
            initial={false}
            animate={{
              width: `calc(${
                nextIndex === -1
                  ? ((LADDER.length - 0.5) / LADDER.length) * 100
                  : (() => {
                      const fromWeeks = LADDER[nextIndex - 1]?.weeks ?? 0;
                      const fromPct = ((nextIndex - 1 + 0.5) / LADDER.length) * 100;
                      const toPct = ((nextIndex + 0.5) / LADDER.length) * 100;
                      const span = LADDER[nextIndex].weeks - fromWeeks;
                      const fraction = span > 0 ? (activePact.streakWeeks - fromWeeks) / span : 0;
                      const pct =
                        fromPct + (toPct - fromPct) * Math.min(1, Math.max(0, fraction));
                      return Math.max(0, pct);
                    })()
              }% - 0.75rem)`,
            }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
          <div className="relative grid grid-cols-4">
            {LADDER.map((rung, index) => {
              const reached = activePact.streakWeeks >= rung.weeks;
              const isNext = index === nextIndex;
              return (
                <div key={rung.weeks} className="flex flex-col items-center gap-1.5">
                  <span
                    className={`grid h-[30px] min-w-[36px] place-items-center rounded-full px-2 text-[12px] font-black leading-none tabular-nums ring-4 ring-card ${
                      reached
                        ? 'bg-amber-400 text-amber-950'
                        : isNext
                          ? 'border-2 border-amber-400 bg-card text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground/70'
                    }`}
                  >
                    {rung.prestige ? (
                      <Trophy className="h-4 w-4" strokeWidth={2.5} />
                    ) : (
                      rateLabel(rung.multiplier)
                    )}
                  </span>
                  <span
                    className={`text-[9.5px] font-black uppercase tracking-wider tabular-nums ${
                      reached || isNext ? 'text-foreground' : 'text-muted-foreground/60'
                    }`}
                  >
                    {rung.weeks} wk
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
