'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Flame,
  Calendar,
  Target,
  Clock,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Crown,
  Lock,
  Zap,
} from 'lucide-react';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';
import { cn } from '@/lib/utils';
import type { WeeklyRecapData } from '@/app/api/weekly-recap/route';
import type { RecapInsightsResponse } from '@/app/api/weekly-recap/insights/route';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00Z');
  const e = new Date(end + 'T12:00:00Z');
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${m[s.getUTCMonth()]} ${s.getUTCDate()} – ${e.getUTCDate()}`
    : `${m[s.getUTCMonth()]} ${s.getUTCDate()} – ${m[e.getUTCMonth()]} ${e.getUTCDate()}`;
}

function getWeekRating(rate: number): { label: string; color: string; bg: string } {
  if (rate >= 90) return { label: 'Outstanding', color: 'text-emerald-400', bg: 'bg-emerald-500' };
  if (rate >= 75) return { label: 'Great', color: 'text-green-400', bg: 'bg-green-500' };
  if (rate >= 60) return { label: 'Good', color: 'text-lime-400', bg: 'bg-lime-500' };
  if (rate >= 40) return { label: 'Fair', color: 'text-amber-400', bg: 'bg-amber-500' };
  if (rate >= 20) return { label: 'Needs Work', color: 'text-orange-400', bg: 'bg-orange-500' };
  return { label: 'Rough Week', color: 'text-red-400', bg: 'bg-red-500' };
}

function getDayRating(tasksCompleted: number, tasksTotal: number, habitsCompleted: number, habitsTotal: number) {
  const total = tasksTotal + habitsTotal;
  const done = tasksCompleted + habitsCompleted;
  if (total === 0) return { color: 'bg-muted/30', label: 'No tasks' };
  const pct = (done / total) * 100;
  if (pct >= 90) return { color: 'bg-emerald-500', label: 'Perfect' };
  if (pct >= 70) return { color: 'bg-green-500', label: 'Great' };
  if (pct >= 50) return { color: 'bg-lime-500', label: 'Good' };
  if (pct >= 30) return { color: 'bg-amber-500', label: 'Fair' };
  return { color: 'bg-red-500', label: 'Missed' };
}

function AnimNum({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame: number;
    const dur = 800;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{display}{suffix}</>;
}

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({ title, icon, delay = 0, children, premium, locked }: {
  title: string;
  icon: React.ReactNode;
  delay?: number;
  children: React.ReactNode;
  premium?: boolean;
  locked?: boolean;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      className="relative"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/50">{icon}</div>
        <h3 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">{title}</h3>
        {premium && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">
            <Crown className="h-3 w-3" /> PRO
          </span>
        )}
      </div>
      {locked ? (
        <div className="relative rounded-2xl border border-border/50 bg-muted/20 p-6 overflow-hidden">
          <div className="absolute inset-0 backdrop-blur-sm bg-background/60 z-10 flex flex-col items-center justify-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-xs font-semibold text-muted-foreground/60">Upgrade to unlock</p>
          </div>
          <div className="opacity-30 pointer-events-none">{children}</div>
        </div>
      ) : (
        children
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trend indicator                                                    */
/* ------------------------------------------------------------------ */

function Trend({ current, previous, suffix = '' }: { current: number; previous: number; suffix?: string }) {
  const diff = current - previous;
  if (diff === 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-muted-foreground"><Minus className="h-3 w-3" /></span>;
  const up = diff > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-bold', up ? 'text-emerald-500' : 'text-red-500')}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{diff}{suffix}
    </span>
  );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function WeeklyRecap({
  data,
  onClose,
}: {
  data: WeeklyRecapData;
  onClose: () => void;
}) {
  const [aiInsights, setAiInsights] = useState<RecapInsightsResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overscrollDrag = useSheetOverscrollDrag();
  const hasFetched = useRef(false);

  const rating = getWeekRating(data.completionRate);
  const prev = data.prevWeek;

  useEffect(() => {
    if (!data.isPremium || hasFetched.current) return;
    hasFetched.current = true;
    setAiLoading(true);
    fetch('/api/weekly-recap/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then((r) => r.json())
      .then((d) => setAiInsights(d))
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [data]);

  const handleClose = useCallback((v: boolean) => {
    if (!v) {
      fetch('/api/weekly-recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: data.weekStart }),
      }).catch(() => {});
      setOpen(false);
      onClose();
    }
  }, [data.weekStart, onClose]);

  const typeStyles: Record<string, string> = {
    strength: 'border-emerald-500/20 bg-emerald-500/10',
    improvement: 'border-amber-500/20 bg-amber-500/10',
    suggestion: 'border-blue-500/20 bg-blue-500/10',
  };

  return (
    <BaseSheet open={open} onOpenChange={handleClose} className="max-h-[92vh] sm:max-w-lg" zIndex={1080}>
      {({ isDesktop, dragControls, isDragging }) => {
        overscrollDrag.setContext(dragControls, !isDesktop);
        return (
          <div
            ref={(el) => { scrollRef.current = el; overscrollDrag.bind(el); }}
            className="overflow-y-auto overscroll-contain px-5 pb-10"
          >
            {/* ── Header with frog + score ── */}
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex flex-col items-center pt-4 pb-5"
            >
              <div className="relative h-32 w-32 mb-3 overflow-hidden rounded-full bg-muted/30">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Frog width={150} height={112} className="-translate-y-1.5" />
                </div>
              </div>

              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Week Review
              </p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                {formatDateRange(data.weekStart, data.weekEnd)}
              </p>

              {/* Score circle */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                className="mt-4 flex flex-col items-center"
              >
                <div className="relative flex h-28 w-28 items-center justify-center">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8" className="stroke-muted/30" />
                    <motion.circle
                      cx="60" cy="60" r="52" fill="none" strokeWidth="8"
                      strokeLinecap="round"
                      className={cn('transition-colors', rating.color.replace('text-', 'stroke-'))}
                      strokeDasharray={2 * Math.PI * 52}
                      initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - data.completionRate / 100) }}
                      transition={{ delay: 0.3, duration: 1, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="text-center">
                    <span className="text-3xl font-black text-foreground"><AnimNum value={data.completionRate} suffix="%" /></span>
                  </div>
                </div>
                <p className={cn('mt-2 text-sm font-black', rating.color)}>{rating.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.tasksCompleted}/{data.tasksAdded} tasks · {data.activeDays}/7 days active
                </p>
              </motion.div>
            </motion.div>

            <div className="space-y-6">
              {/* ── Day-by-Day Breakdown ── */}
              <Section title="Day by Day" icon={<Calendar className="h-4 w-4 text-muted-foreground" />} delay={0.2}>
                <div className="space-y-1.5">
                  {data.days.map((day, i) => {
                    const total = day.tasksTotal + day.habitsTotal;
                    const done = day.tasksCompleted + day.habitsCompleted;
                    const pct = total > 0 ? (done / total) * 100 : 0;
                    const dayRating = getDayRating(day.tasksCompleted, day.tasksTotal, day.habitsCompleted, day.habitsTotal);
                    return (
                      <motion.div
                        key={day.date}
                        initial={{ x: -15, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.25 + i * 0.04 }}
                        className="flex items-center gap-3"
                      >
                        <span className="w-8 text-xs font-bold text-muted-foreground shrink-0">{day.dayName}</span>
                        <div className="flex-1 h-6 rounded-lg bg-muted/20 overflow-hidden relative">
                          <motion.div
                            className={cn('h-full rounded-lg', dayRating.color)}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(pct, 2)}%` }}
                            transition={{ delay: 0.3 + i * 0.04, duration: 0.5, ease: 'easeOut' }}
                          />
                          {total > 0 && (
                            <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-bold text-foreground/50">
                              {done}/{total}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {[
                    { color: 'bg-emerald-500', label: 'Perfect' },
                    { color: 'bg-green-500', label: 'Great' },
                    { color: 'bg-lime-500', label: 'Good' },
                    { color: 'bg-amber-500', label: 'Fair' },
                    { color: 'bg-red-500', label: 'Missed' },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-1">
                      <div className={cn('h-2.5 w-2.5 rounded-sm', l.color)} />
                      <span className="text-[10px] font-semibold text-muted-foreground/60">{l.label}</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Best Day (right under day-by-day) ── */}
              {data.bestDay && (data.bestDay.tasksCompleted > 0 || data.bestDay.habitsCompleted > 0) && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 -mt-3"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                    <Trophy className="h-6 w-6 text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-amber-500/70 uppercase tracking-wider">Best Day</p>
                    <p className="text-lg font-black text-foreground leading-tight">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(data.bestDay.date + 'T12:00:00Z').getUTCDay()]}
                    </p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {data.bestDay.tasksCompleted} tasks · {data.bestDay.habitsCompleted} habits
                      {data.bestDay.focusMinutes > 0 && ` · ${data.bestDay.focusMinutes}m focused`}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── Key Stats (with week-over-week comparison inline) ── */}
              <Section title="Key Stats" icon={<Zap className="h-4 w-4 text-muted-foreground" />} delay={0.4}>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { label: 'Completed', value: data.tasksCompleted, prevValue: prev?.tasksCompleted, icon: <Target className="h-4 w-4" />, color: 'text-emerald-500', suffix: '' },
                    { label: 'Completion Rate', value: data.completionRate, prevValue: prev?.completionRate, suffix: '%', icon: <Flame className="h-4 w-4" />, color: rating.color },
                    { label: 'Focus Time', value: data.totalFocusMinutes, prevValue: prev?.totalFocusMinutes, suffix: 'm', icon: <Clock className="h-4 w-4" />, color: 'text-blue-500' },
                    { label: 'Streak', value: data.currentStreak, prevValue: undefined as number | undefined, icon: <Flame className="h-4 w-4" />, suffix: 'd', color: 'text-amber-500' },
                  ]).map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.45 + i * 0.05 }}
                      className="rounded-xl border border-border/50 bg-muted/20 p-3 flex flex-col items-center text-center"
                    >
                      <div className={cn('mb-1', stat.color)}>{stat.icon}</div>
                      <span className="text-2xl font-black text-foreground leading-none">
                        <AnimNum value={stat.value} suffix={stat.suffix} />
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground mt-1">{stat.label}</span>
                      {stat.prevValue != null && (
                        <div className="mt-1">
                          <Trend current={stat.value} previous={stat.prevValue} suffix={stat.suffix} />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Flies earned */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.65 }}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-3 mt-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Fly size={28} y={-3} />
                    <div>
                      <span className="text-lg font-black text-foreground"><AnimNum value={data.fliesEarned} /></span>
                      <p className="text-[10px] font-bold text-muted-foreground">Flies earned</p>
                    </div>
                  </div>
                  {data.currentStreak > 0 && (
                    <div className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1">
                      <Flame className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-bold text-amber-500">{data.currentStreak}d streak</span>
                    </div>
                  )}
                </motion.div>
              </Section>

              {/* ── Habits ── */}
              {data.habits.length > 0 && (
                <Section title="Habits" icon={<Target className="h-4 w-4 text-muted-foreground" />} delay={0.5}>
                  <div className="space-y-2">
                    {data.habits.map((h, i) => {
                      const pct = h.goal > 0 ? Math.round((h.completed / h.goal) * 100) : 0;
                      const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                      return (
                        <motion.div
                          key={h.id}
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.55 + i * 0.04 }}
                          className="rounded-xl border border-border/50 bg-muted/20 p-3"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-bold text-foreground truncate">{h.text}</span>
                            <span className="text-xs font-bold text-muted-foreground shrink-0 ml-2">{h.completed}/{h.goal}d</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                            <motion.div
                              className={cn('h-full rounded-full', barColor)}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ delay: 0.6 + i * 0.04, duration: 0.5 }}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* ── Top Tags ── */}
              {data.topTags.length > 0 && (
                <Section title="Top Tags" icon={<Target className="h-4 w-4 text-muted-foreground" />} delay={0.6}>
                  <div className="flex flex-wrap gap-2">
                    {data.topTags.map((tag, i) => (
                      <motion.div
                        key={tag.tagId}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.65 + i * 0.04 }}
                        className="flex items-center gap-2 rounded-full border border-border/50 bg-muted/20 pl-1.5 pr-3 py-1.5"
                      >
                        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: tag.tagColor }} />
                        <span className="text-xs font-bold text-foreground">{tag.tagName}</span>
                        <span className="text-[10px] font-bold text-muted-foreground">{tag.completedCount}</span>
                      </motion.div>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── AI Insights (premium) ── */}
              <Section
                title="AI Analysis"
                icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
                delay={0.8}
                premium
                locked={!data.isPremium}
              >
                {aiLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                      <Sparkles className="h-5 w-5 text-muted-foreground" />
                    </motion.div>
                    <span className="text-xs font-bold text-muted-foreground">Analyzing your week...</span>
                  </div>
                ) : aiInsights ? (
                  <div className="space-y-2">
                    {aiInsights.summary && (
                      <p className="text-sm font-semibold text-foreground/70 italic mb-3 text-center">
                        &ldquo;{aiInsights.summary}&rdquo;
                      </p>
                    )}
                    {(aiInsights.insights ?? []).map((insight, i) => (
                      <motion.div
                        key={i}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.85 + i * 0.06 }}
                        className={cn('rounded-xl border p-3', typeStyles[insight.type] ?? typeStyles.suggestion)}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0">{insight.emoji}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground">{insight.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{insight.body}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">Insights will appear here.</p>
                )}
              </Section>

              {/* ── Focus Areas (premium) ── */}
              {data.focusAreas.length > 0 && (
                <Section
                  title="Focus Areas"
                  icon={<Target className="h-4 w-4 text-muted-foreground" />}
                  delay={0.9}
                  premium
                  locked={!data.isPremium}
                >
                  <div className="space-y-2">
                    {data.focusAreas.map((area, i) => {
                      const rate = area.tasksTotal > 0 ? Math.round((area.tasksCompleted / area.tasksTotal) * 100) : 0;
                      return (
                        <motion.div
                          key={area.categoryName}
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.95 + i * 0.04 }}
                          className="rounded-xl border border-border/50 bg-muted/20 p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-foreground">{area.categoryName}</span>
                            <span className="text-xs font-bold text-muted-foreground">{rate}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${rate}%` }}
                              transition={{ delay: 1.0 + i * 0.04, duration: 0.5 }}
                            />
                          </div>
                          <div className="flex gap-3 mt-2 text-[10px] font-semibold text-muted-foreground">
                            <span>{area.tasksCompleted}/{area.tasksTotal} tasks</span>
                            <span>{area.habitsCompleted}/{area.habitsTotal} habits</span>
                            {area.focusMinutes > 0 && <span>{area.focusMinutes}m focus</span>}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </div>

            {/* ── Close button ── */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.0 }}
              className="mt-8 flex justify-center"
            >
              <button
                onClick={() => handleClose(false)}
                className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-primary-foreground shadow-sm active:scale-95 transition-transform"
              >
                Start Your Week
              </button>
            </motion.div>
          </div>
        );
      }}
    </BaseSheet>
  );
}
