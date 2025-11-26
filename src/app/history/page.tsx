'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Calendar,
  History as HistoryIcon,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';

import { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import StatCard from '@/components/ui/StatCard';
import ProgressBadge from '@/components/ui/ProgressBadge';
import HistoryTaskList, { HistoryTask } from '@/components/ui/HistoryTaskList';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import {
  HIT_AT,
  OFFSET_MS,
  TONGUE_MS,
  TONGUE_STROKE,
  useFrogTongue,
} from '@/hooks/useFrogTongue';

const FLY_PX = 24;

interface DayRecord {
  date: string; // 'YYYY-MM-DD'
  tasks: HistoryTask[];
}

export default function History() {
  const { data: session } = useSession();
  const [openWardrobe, setOpenWardrobe] = useState(false);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- frog animation shared state ---- */
  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  const {
    vp,
    cinematic,
    grab,
    tip,
    tipVisible,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({ frogRef, frogBoxRef, flyRefs });

  /* ---- data load ---- */
  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/history');
        const data = await res.json();
        setHistory(data);
      } catch (e) {
        console.error('Failed to fetch history:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const totalDays = history.length;
  const totalTasks = history.reduce((a, d) => a + d.tasks.length, 0);
  const completedTasks = history.reduce(
    (a, d) => a + d.tasks.filter((t) => t.completed).length,
    0
  );
  const overallCompletionRate =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  useEffect(() => {
    if (!cinematic) return;
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('wheel', stop, { passive: false });
    window.addEventListener('touchmove', stop, { passive: false });
    return () => {
      window.removeEventListener('wheel', stop as any);
      window.removeEventListener('touchmove', stop as any);
    };
  }, [cinematic]);

  const { indices } = useWardrobeIndices(!!session);

  /* ---- persist toggle for a specific date ---- */
  const persistTask = async (
    date: string,
    taskId: string,
    completed: boolean
  ) => {
    // optimistic local change
    setHistory((prev) =>
      prev.map((day) =>
        day.date !== date
          ? day
          : {
              ...day,
              tasks: day.tasks.map((t) =>
                t.id === taskId ? { ...t, completed } : t
              ),
            }
      )
    );
    // server
    if (session) {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, taskId, completed }),
      });
    }
  };

  /* ---- main toggle ---- */
  /* ---- main toggle (delegated to shared hook) ---- */
  const handleToggle = async (
    date: string,
    taskId: string,
    explicit?: boolean
  ) => {
    if (cinematic || grab) return;
    const day = history.find((d) => d.date === date);
    if (!day) return;
    const task = day.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const completed = explicit !== undefined ? explicit : !task.completed;
    if (!completed) {
      persistTask(date, taskId, false);
      return;
    }

    await triggerTongue({
      key: `${date}::${taskId}`,
      completed,
      onPersist: () => persistTask(date, taskId, true),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-purple-500 rounded-full animate-spin border-t-transparent" />
      </div>
    );
  }

  return (
    <main
      dir="ltr"
      className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-4 mb-8 md:flex-row md:items-center">
          <div>
            <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-white md:text-5xl">
              Task History
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Last 30 days
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 font-medium transition-all duration-200 bg-white shadow-md rounded-xl text-slate-700 hover:shadow-lg dark:bg-slate-800 dark:text-slate-200"
          >
            <HistoryIcon className="w-5 h-5" />
            Back to Today
          </Link>
        </div>

        {/* Frog + KPIs */}
        <div className="flex flex-col items-center w-full">
          <FrogDisplay
            frogRef={frogRef}
            frogBoxRef={frogBoxRef}
            mouthOpen={!!grab}
            mouthOffset={{ y: -4 }}
            indices={indices}
            openWardrobe={openWardrobe}
            onOpenChange={setOpenWardrobe}
          />
        </div>

        <div className="-mt-2.5 mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            icon={<Calendar className="w-8 h-8 text-blue-500" />}
            value={totalDays}
            label="Days recorded"
          />
          <StatCard
            icon={<CheckCircle2 className="w-8 h-8 text-green-500" />}
            value={completedTasks}
            label="Tasks completed"
          />
          <StatCard
            icon={<TrendingUp className="w-8 h-8 text-purple-500" />}
            value={`${Math.round(overallCompletionRate)}%`}
            label="Overall completion"
          />
        </div>

        {/* History list */}
        <div className="space-y-4">
          {history.map((day, i) => {
            const completedCount = day.tasks.filter((t) => t.completed).length;
            const pct = day.tasks.length
              ? Math.round((completedCount / day.tasks.length) * 100)
              : 0;
            return (
              <div
                key={day.date}
                className="p-6 transition-shadow duration-200 bg-white shadow-md rounded-xl hover:shadow-lg dark:bg-slate-800"
                style={{
                  animation: `fadeInUp 0.5s ease-out ${i * 0.05}s`,
                  animationFillMode: 'both',
                }}
              >
                <div className="flex flex-col items-start justify-between gap-4 mb-4 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      {format(new Date(day.date), 'EEEE, MMMM d')}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {completedCount} / {day.tasks.length} tasks completed
                    </p>
                  </div>
                  {day.tasks.length > 0 && <ProgressBadge pct={pct} />}
                </div>

                <HistoryTaskList
                  date={day.date}
                  tasks={day.tasks}
                  toggle={handleToggle}
                  visuallyCompleted={visuallyDone}
                  renderBullet={(key: string, task: HistoryTask) => (
                    <Fly
                      ref={(el) => {
                        flyRefs.current[key] = el;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(day.date, task.id, true);
                      }}
                      size={30}
                      y={-6}
                      x={-4}
                    />
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* SVG overlay – same as Home */}
      {grab && (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-40 pointer-events-none"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
        >
          <defs>
            <linearGradient id="tongue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>

          <motion.path
            key={`tongue-${grab.startAt}`}
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 0] }}
            transition={{
              delay: OFFSET_MS / 1000,
              duration: TONGUE_MS / 1000,
              times: [0, HIT_AT, 1],
              ease: 'linear',
            }}
          />

          {tipVisible && tip && (
            <g transform={`translate(${tip.x}, ${tip.y})`}>
              <circle r={10} fill="transparent" />
              <image
                href="/fly.svg"
                x={-FLY_PX / 2}
                y={-FLY_PX / 2}
                width={FLY_PX}
                height={FLY_PX}
              />
            </g>
          )}
        </svg>
      )}

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
