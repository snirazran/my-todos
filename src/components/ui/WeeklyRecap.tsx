'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Flame,
  Calendar,
  Target,
  Clock,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Lock,
  Sparkles,
  Crown,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import type { WeeklyRecapData } from '@/app/api/weekly-recap/route';
import type { RecapInsight, RecapInsightsResponse } from '@/app/api/weekly-recap/insights/route';

type CardType =
  | 'intro'
  | 'overview'
  | 'best-day'
  | 'focus-time'
  | 'habits'
  | 'top-tags'
  | 'flies'
  | 'focus-area'
  | 'comparison'
  | 'ai-insights'
  | 'outro';

type Card = {
  type: CardType;
  focusAreaIndex?: number;
  premiumLocked?: boolean;
};

function buildCardList(data: WeeklyRecapData): Card[] {
  const cards: Card[] = [{ type: 'intro' }, { type: 'overview' }];

  if (data.bestDay && (data.bestDay.tasksCompleted > 0 || data.bestDay.habitsCompleted > 0)) {
    cards.push({ type: 'best-day' });
  }

  if (data.totalFocusMinutes > 0) {
    cards.push({ type: 'focus-time' });
  }

  if (data.habits.length > 0) {
    cards.push({ type: 'habits' });
  }

  if (data.topTags.length > 0) {
    cards.push({ type: 'top-tags' });
  }

  cards.push({ type: 'flies' });

  if (data.isPremium) {
    data.focusAreas.forEach((_, i) => {
      cards.push({ type: 'focus-area', focusAreaIndex: i });
    });
  } else if (data.focusAreas.length > 0) {
    cards.push({ type: 'focus-area', focusAreaIndex: 0 });
    if (data.focusAreas.length > 1) {
      cards.push({ type: 'focus-area', focusAreaIndex: 1, premiumLocked: true });
    }
  }

  cards.push({
    type: 'comparison',
    premiumLocked: !data.isPremium,
  });

  cards.push({
    type: 'ai-insights',
    premiumLocked: !data.isPremium,
  });

  cards.push({ type: 'outro' });

  return cards;
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00Z');
  const e = new Date(end + 'T12:00:00Z');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${months[s.getUTCMonth()]} ${s.getUTCDate()} – ${e.getUTCDate()}`;
  }
  return `${months[s.getUTCMonth()]} ${s.getUTCDate()} – ${months[e.getUTCMonth()]} ${e.getUTCDate()}`;
}

// --- Progress ring for habits ---
function Ring({ percent, size = 48, stroke = 4, color = 'currentColor' }: { percent: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, percent / 100));
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/30" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
    </svg>
  );
}

// --- Animated number ---
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

// --- Trend arrow ---
function TrendBadge({ current, previous, suffix = '' }: { current: number; previous: number; suffix?: string }) {
  const diff = current - previous;
  if (diff === 0) return <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground"><Minus className="h-3 w-3" /> Same</span>;
  const up = diff > 0;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-bold', up ? 'text-green-500' : 'text-red-400')}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{diff}{suffix}
    </span>
  );
}

// --- Premium lock overlay ---
function PremiumOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-background/80 backdrop-blur-md">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
        <Crown className="h-7 w-7 text-amber-500" />
      </div>
      <p className="text-sm font-black text-foreground">Premium Feature</p>
      <p className="max-w-[220px] text-center text-xs font-semibold text-muted-foreground leading-relaxed">
        Upgrade to unlock full weekly insights, week-over-week trends, and AI-powered suggestions.
      </p>
    </div>
  );
}

// --- Individual card components ---

function IntroCard({ data }: { data: WeeklyRecapData }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20"
      >
        <Fly size={56} y={-6} />
      </motion.div>
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Your Week in Review</h1>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">{formatDateRange(data.weekStart, data.weekEnd)}</p>
      </motion.div>
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-xs font-semibold text-muted-foreground"
      >
        Swipe to explore →
      </motion.p>
    </div>
  );
}

function OverviewCard({ data }: { data: WeeklyRecapData }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <motion.h2 initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-lg font-black uppercase tracking-widest text-primary">
        Overview
      </motion.h2>
      <div className="grid w-full max-w-[280px] grid-cols-2 gap-4">
        {[
          { icon: <Target className="h-5 w-5" />, label: 'Completed', value: data.tasksCompleted, color: 'text-green-500' },
          { icon: <Calendar className="h-5 w-5" />, label: 'Active Days', value: data.activeDays, suffix: '/7', color: 'text-blue-500' },
          { icon: <Flame className="h-5 w-5" />, label: 'Completion', value: data.completionRate, suffix: '%', color: 'text-amber-500' },
          { icon: <Trophy className="h-5 w-5" />, label: 'Tasks Added', value: data.tasksAdded, color: 'text-purple-500' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 * i }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card/80 p-4"
          >
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-muted/50', stat.color)}>{stat.icon}</div>
            <span className="text-2xl font-black text-foreground"><AnimNum value={stat.value} suffix={stat.suffix} /></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function BestDayCard({ data }: { data: WeeklyRecapData }) {
  if (!data.bestDay) return null;
  const total = data.bestDay.tasksCompleted + data.bestDay.habitsCompleted;
  const fullDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = new Date(data.bestDay.date + 'T12:00:00Z');
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
        <Trophy className="h-14 w-14 text-amber-500" />
      </motion.div>
      <h2 className="text-lg font-black uppercase tracking-widest text-primary">Best Day</h2>
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
        <p className="text-3xl font-black text-foreground">{fullDayName[d.getUTCDay()]}</p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">{data.bestDay.date}</p>
      </motion.div>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-6 py-3"
      >
        <span className="text-4xl font-black text-amber-500"><AnimNum value={total} /></span>
        <p className="text-xs font-bold text-amber-600 dark:text-amber-400">items completed</p>
      </motion.div>

      <div className="flex gap-6 text-center">
        <div>
          <p className="text-xl font-black text-foreground">{data.bestDay.tasksCompleted}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Tasks</p>
        </div>
        <div>
          <p className="text-xl font-black text-foreground">{data.bestDay.habitsCompleted}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Habits</p>
        </div>
      </div>
    </div>
  );
}

function FocusTimeCard({ data }: { data: WeeklyRecapData }) {
  const avgPerDay = data.activeDays > 0 ? Math.round(data.totalFocusMinutes / data.activeDays) : 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <motion.div initial={{ rotate: -180, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}>
        <Clock className="h-14 w-14 text-blue-500" />
      </motion.div>
      <h2 className="text-lg font-black uppercase tracking-widest text-primary">Focus Time</h2>
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}>
        <p className="text-5xl font-black text-foreground"><AnimNum value={data.totalFocusMinutes} /></p>
        <p className="text-sm font-bold text-muted-foreground">minutes focused</p>
      </motion.div>
      <div className="flex gap-6">
        <div className="rounded-2xl border border-border/50 bg-card/80 px-4 py-3 text-center">
          <p className="text-xl font-black text-foreground">{data.totalFocusCycles}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Cycles</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/80 px-4 py-3 text-center">
          <p className="text-xl font-black text-foreground">{avgPerDay}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Min/day</p>
        </div>
      </div>
    </div>
  );
}

function HabitsCard({ data }: { data: WeeklyRecapData }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <h2 className="text-lg font-black uppercase tracking-widest text-primary">Habits</h2>
      <div className="w-full max-w-[300px] space-y-3 max-h-[50vh] overflow-y-auto">
        {data.habits.map((h, i) => {
          const pct = h.goal > 0 ? Math.round((h.completed / h.goal) * 100) : 0;
          return (
            <motion.div
              key={h.id}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.08 * i }}
              className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/80 p-3"
            >
              <div className="relative">
                <Ring percent={pct} size={44} stroke={3.5} color={pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444'} />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-foreground">{pct}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{h.text}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">{h.completed}/{h.goal} days</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function TopTagsCard({ data }: { data: WeeklyRecapData }) {
  const maxCount = Math.max(1, ...data.topTags.map((t) => t.completedCount));
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <h2 className="text-lg font-black uppercase tracking-widest text-primary">Top Tags</h2>
      <div className="w-full max-w-[280px] space-y-3">
        {data.topTags.map((tag, i) => (
          <motion.div
            key={tag.tagId}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 * i }}
            className="flex items-center gap-3"
          >
            <span className="text-lg font-black text-muted-foreground w-6 text-right">{i + 1}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold" style={{ color: tag.tagColor }}>{tag.tagName}</span>
                <span className="text-xs font-bold text-muted-foreground">{tag.completedCount} done</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(tag.completedCount / maxCount) * 100}%` }}
                  transition={{ delay: 0.1 * i + 0.3, duration: 0.5 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: tag.tagColor }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function FliesCard({ data }: { data: WeeklyRecapData }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
          <Fly size={48} y={-5} />
        </div>
      </motion.div>
      <h2 className="text-lg font-black uppercase tracking-widest text-primary">Flies Collected</h2>
      <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }} className="text-5xl font-black text-foreground">
        <AnimNum value={data.fliesEarned} />
      </motion.p>
      <p className="text-xs font-semibold text-muted-foreground">flies earned this week</p>
      {data.currentStreak > 0 && (
        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2">
          <Flame className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-black text-amber-500">{data.currentStreak} day streak</span>
        </motion.div>
      )}
    </div>
  );
}

function FocusAreaCard({ data, areaIndex }: { data: WeeklyRecapData; areaIndex: number }) {
  const area = data.focusAreas[areaIndex];
  if (!area) return null;
  const completionRate = area.tasksTotal > 0 ? Math.round((area.tasksCompleted / area.tasksTotal) * 100) : 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: area.accent + '20', border: `2px solid ${area.accent}40` }}
      >
        <Target className="h-7 w-7" style={{ color: area.accent }} />
      </motion.div>
      <h2 className="text-lg font-black uppercase tracking-widest" style={{ color: area.accent }}>{area.categoryName}</h2>

      <div className="grid w-full max-w-[260px] grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card/80 p-3">
          <p className="text-2xl font-black text-foreground">{area.tasksCompleted}<span className="text-sm text-muted-foreground">/{area.tasksTotal}</span></p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Tasks</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/80 p-3">
          <p className="text-2xl font-black text-foreground">{completionRate}%</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Rate</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/80 p-3">
          <p className="text-2xl font-black text-foreground">{area.habitsCompleted}<span className="text-sm text-muted-foreground">/{area.habitsTotal}</span></p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Habits</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/80 p-3">
          <p className="text-2xl font-black text-foreground">{area.focusMinutes}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Focus min</p>
        </div>
      </div>

      {area.topTags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-1">
          {area.topTags.slice(0, 4).map((tag) => (
            <span
              key={tag.tagId}
              className="rounded-md border px-2 py-0.5 text-[9px] font-black uppercase"
              style={{ backgroundColor: tag.tagColor + '20', borderColor: tag.tagColor + '40', color: tag.tagColor }}
            >
              {tag.tagName} ({tag.completedCount})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ComparisonCard({ data }: { data: WeeklyRecapData }) {
  const prev = data.prevWeek;
  if (!prev) return null;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <h2 className="text-lg font-black uppercase tracking-widest text-primary">Week vs Week</h2>
      <div className="w-full max-w-[280px] space-y-3">
        {[
          { label: 'Tasks Done', current: data.tasksCompleted, previous: prev.tasksCompleted },
          { label: 'Completion Rate', current: data.completionRate, previous: prev.completionRate, suffix: '%' },
          { label: 'Focus Minutes', current: data.totalFocusMinutes, previous: prev.totalFocusMinutes },
          { label: 'Active Days', current: data.activeDays, previous: prev.activeDays },
        ].map((row, i) => (
          <motion.div
            key={row.label}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 * i }}
            className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/80 px-4 py-3"
          >
            <div>
              <p className="text-sm font-bold text-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.previous}{row.suffix} → {row.current}{row.suffix}</p>
            </div>
            <TrendBadge current={row.current} previous={row.previous} suffix={row.suffix} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AiInsightsCard({ insights, loading }: { insights: RecapInsightsResponse | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <Sparkles className="h-10 w-10 text-primary animate-pulse" />
        <p className="text-sm font-bold text-muted-foreground">Analyzing your week...</p>
      </div>
    );
  }
  if (!insights) return null;
  const typeColors = { strength: 'border-green-500/30 bg-green-500/10', improvement: 'border-amber-500/30 bg-amber-500/10', suggestion: 'border-blue-500/30 bg-blue-500/10' };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <h2 className="text-lg font-black uppercase tracking-widest text-primary">AI Insights</h2>
      {insights.summary && (
        <p className="max-w-[280px] text-center text-xs font-semibold text-muted-foreground italic">"{insights.summary}"</p>
      )}
      <div className="w-full max-w-[300px] space-y-2.5 max-h-[45vh] overflow-y-auto">
        {insights.insights.map((insight, i) => (
          <motion.div
            key={i}
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.12 * i }}
            className={cn('rounded-2xl border p-3', typeColors[insight.type])}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg shrink-0">{insight.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground">{insight.title}</p>
                <p className="text-xs font-semibold text-muted-foreground mt-0.5">{insight.body}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function OutroCard({ data, onClose }: { data: WeeklyRecapData; onClose: () => void }) {
  const msgs = [
    'Keep the momentum going!',
    'Every small step counts.',
    'You showed up — that matters.',
    'Consistency beats perfection.',
  ];
  const msg = msgs[Math.floor(data.tasksCompleted % msgs.length)];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
        <Fly size={64} y={-6} />
      </motion.div>
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
        <h2 className="text-xl font-black text-foreground">{msg}</h2>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">See you next week for another recap.</p>
      </motion.div>
      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        onClick={onClose}
        className="rounded-2xl bg-primary px-8 py-3 text-sm font-black uppercase tracking-wider text-primary-foreground shadow-lg active:scale-95 transition-transform"
      >
        Start Your Week
      </motion.button>
    </div>
  );
}

// --- Main component ---

export default function WeeklyRecap({
  data,
  onClose,
}: {
  data: WeeklyRecapData;
  onClose: () => void;
}) {
  const cards = buildCardList(data);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [aiInsights, setAiInsights] = useState<RecapInsightsResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const touchStartX = useRef(0);

  useEffect(() => setMounted(true), []);

  // Fetch AI insights for premium users when they reach that card
  useEffect(() => {
    if (!data.isPremium || aiInsights || aiLoading) return;
    const card = cards[currentIndex];
    if (card?.type === 'ai-insights' && !card.premiumLocked) {
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
    }
  }, [currentIndex, data.isPremium]);

  const goNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setDirection(1);
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, cards.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  // Mark as seen on close
  const handleClose = useCallback(() => {
    fetch('/api/weekly-recap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart: data.weekStart }),
    }).catch(() => {});
    onClose();
  }, [data.weekStart, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, handleClose]);

  const card = cards[currentIndex];

  const renderCard = () => {
    const inner = (() => {
      switch (card.type) {
        case 'intro': return <IntroCard data={data} />;
        case 'overview': return <OverviewCard data={data} />;
        case 'best-day': return <BestDayCard data={data} />;
        case 'focus-time': return <FocusTimeCard data={data} />;
        case 'habits': return <HabitsCard data={data} />;
        case 'top-tags': return <TopTagsCard data={data} />;
        case 'flies': return <FliesCard data={data} />;
        case 'focus-area': return <FocusAreaCard data={data} areaIndex={card.focusAreaIndex ?? 0} />;
        case 'comparison': return <ComparisonCard data={data} />;
        case 'ai-insights': return <AiInsightsCard insights={aiInsights} loading={aiLoading} />;
        case 'outro': return <OutroCard data={data} onClose={handleClose} />;
        default: return null;
      }
    })();

    return (
      <div className="relative h-full w-full">
        {inner}
        {card.premiumLocked && <PremiumOverlay />}
      </div>
    );
  };

  if (!mounted) return null;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex flex-col bg-background">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2">
        {/* Progress bar */}
        <div className="flex flex-1 gap-1 mr-3">
          {cards.map((_, i) => (
            <div key={i} className="relative h-1 flex-1 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-300"
                style={{ width: i < currentIndex ? '100%' : i === currentIndex ? '100%' : '0%', opacity: i === currentIndex ? 1 : i < currentIndex ? 0.5 : 0 }}
              />
            </div>
          ))}
        </div>
        <button onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted transition-colors shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Card area */}
      <div
        className="relative flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', duration: 0.25, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            {renderCard()}
          </motion.div>
        </AnimatePresence>

        {/* Left/right tap zones */}
        <button onClick={goPrev} className="absolute inset-y-0 left-0 w-1/4 z-10" aria-label="Previous" />
        <button onClick={goNext} className="absolute inset-y-0 right-0 w-1/4 z-10" aria-label="Next" />
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground disabled:opacity-30 transition-all"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-xs font-bold text-muted-foreground">{currentIndex + 1} / {cards.length}</span>
        <button
          onClick={goNext}
          disabled={currentIndex === cards.length - 1}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-30 transition-all"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
