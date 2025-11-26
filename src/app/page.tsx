'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, History, CheckCircle2 } from 'lucide-react';
import BacklogPanel from '@/components/ui/BacklogPanel';
import { signIn, useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import ProgressCard from '@/components/ui/ProgressCard';
import TaskList from '@/components/ui/TaskList';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import {
  useFrogTongue,
  HIT_AT,
  OFFSET_MS,
  TONGUE_MS,
  TONGUE_STROKE,
} from '@/hooks/useFrogTongue';

const FLY_PX = 24;

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

const demoTasks: Task[] = [
  { id: 'g1', text: 'Meditation', completed: true },
  { id: 'g2', text: 'Read a book', completed: true },
  { id: 'g3', text: 'Walk 5,000 steps', completed: true },
  { id: 'g4', text: 'Drink 2 liters of water', completed: true },
  {
    id: 'g5',
    text: 'Check there is no monster under the bed',
    completed: false,
  },
];

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();
  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});

  const [tasks, setTasks] = useState<Task[]>([]);
  const [openWardrobe, setOpenWardrobe] = useState(false);
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);
  const [loading, setLoading] = useState(true);
  const [quickText, setQuickText] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [weeklyIds, setWeeklyIds] = useState<Set<string>>(new Set());

  const [laterThisWeek, setLaterThisWeek] = useState<
    { id: string; text: string }[]
  >([]);

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

  const fetchBacklog = useCallback(async () => {
    if (!session) return;
    const items = await fetch('/api/tasks?view=board&day=-1').then((r) =>
      r.json()
    );
    setLaterThisWeek(items.map((t: any) => ({ id: t.id, text: t.text })));
  }, [session]);

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const data = session ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;

  const refreshToday = useCallback(async () => {
    if (!session) return;
    const res = await fetch(`/api/tasks?date=${dateStr}`);
    const json = await res.json();
    setTasks(json.tasks ?? []);
    await fetchWeeklyIds();
  }, [session, dateStr]);

  const fetchWeeklyIds = React.useCallback(async () => {
    if (!session) return;
    const dow = new Date().getDay();
    const templ = await fetch(
      `/api/tasks?view=board&day=${dow}`
    ).then((r) => r.json());
    setWeeklyIds(new Set(templ.map((t: any) => t.id)));
  }, [session]);

  useEffect(() => {
    fetchBacklog();
    fetchWeeklyIds();
  }, [fetchBacklog, fetchWeeklyIds]);

  /* -------- data load -------- */
  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/tasks?date=${dateStr}`);
        const json = await res.json();
        setTasks(json.tasks ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [session, dateStr]);

  /* -------- block manual scroll during cinematic -------- */
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

  const persistTask = async (taskId: string, completed: boolean) => {
    if (session) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed } : t))
      );
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, taskId, completed }),
      });
    } else {
      setGuestTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed } : t))
      );
    }
  };

  const { indices } = useWardrobeIndices(!!session);

  /* -------- main toggle with cinematic timeline -------- */

  const handleToggle = async (taskId: string, explicitCompleted?: boolean) => {
    if (cinematic || grab) return;
    const task = data.find((t) => t.id === taskId);
    if (!task) return;

    const completed =
      explicitCompleted !== undefined ? explicitCompleted : !task.completed;

    if (!completed) {
      persistTask(taskId, false);
      return;
    }

    await triggerTongue({
      key: taskId,
      completed,
      onPersist: () => persistTask(taskId, true),
    });
  };

  if (loading && session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-purple-500 rounded-full animate-spin border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Header session={session} router={router} />

        {!session && (
          <div className="relative p-10 mb-8 overflow-hidden text-center bg-white shadow-lg rounded-2xl dark:bg-slate-800">
            <h2 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">
              There’s a frog with a rumbling belly! 🐸
            </h2>
            <p className="mb-8 text-slate-600 dark:text-slate-400">
              The only way to feed it is by completing your tasks.
              <br />
              Sign in and help the frog feel happy and full!
            </p>

            <button
              onClick={() => signIn('google')}
              className="inline-flex items-center gap-2 px-8 py-3 text-lg font-medium text-white shadow-md rounded-xl bg-violet-600 hover:bg-violet-700"
            >
              Sign in / Create account — free! 🚀
            </button>
          </div>
        )}

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
          <div className="relative z-0 -mt-2.5 w-full">
            <ProgressCard rate={rate} done={doneCount} total={data.length} />
          </div>
        </div>

        <div
          className="mt-6"
          style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
        >
          <TaskList
            tasks={data}
            toggle={handleToggle}
            showConfetti={rate === 100}
            visuallyCompleted={visuallyDone}
            renderBullet={(task, isVisuallyDone) =>
              task.completed || isVisuallyDone ? null : (
                <Fly
                  ref={(el) => {
                    flyRefs.current[task.id] = el;
                  }}
                  onClick={() => /* your existing toggle */ null}
                  size={28}
                  y={-4}
                  x={-2}
                />
              )
            }
            onAddRequested={(prefill /*, afterIdx, opts */) => {
              setQuickText(prefill || '');
              setShowQuickAdd(true);
            }}
            weeklyIds={weeklyIds}
            onDeleteToday={async (taskId) => {
              await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, taskId }),
              });
              await refreshToday();
            }}
            onDeleteFromWeek={async (taskId) => {
              const dow = new Date().getDay();
              await fetch('/api/tasks?view=board', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ day: dow, taskId }),
              });
              await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, taskId }),
              });
              await refreshToday();
            }}
          />

          {session && (
            <BacklogPanel
              later={laterThisWeek}
              onRefreshToday={refreshToday}
              onRefreshBacklog={fetchBacklog}
            />
          )}
        </div>
      </div>

      {/* SVG overlay; we update the path `d` every frame in RAF to stay locked to scroll */}
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
            d="M0 0 L0 0" // seeded on first RAF tick
            fill="none"
            stroke="url(#tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 0] }}
            transition={{
              delay: OFFSET_MS / 1000, // sync with RAF start
              duration: TONGUE_MS / 1000,
              times: [0, HIT_AT, 1],
              ease: 'linear',
            }}
          />

          {/* Fly glued to tip only AFTER impact */}
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

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText={quickText}
        defaultRepeat="this-week"
        onSubmit={async ({ text, days, repeat }) => {
          await fetch('/api/tasks?view=board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, days, repeat }),
          });

          // Refresh "today" list
          if (session) {
            const res = await fetch(`/api/tasks?date=${dateStr}`);
            const json = await res.json();
            setTasks(json.tasks ?? []);
            await fetchWeeklyIds();
          } else {
            setGuestTasks((prev) => [
              ...prev,
              { id: crypto.randomUUID(), text, completed: false },
            ]);
          }

          fetchBacklog();
        }}
      />
    </main>
  );
}

/* ---------- header ---------- */
function Header({ session, router }: { session: any; router: any }) {
  return (
    <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white md:text-5xl">
          {format(new Date(), 'EEEE')}
        </h1>
        <p className="flex items-center gap-2 text-lg text-slate-600 dark:text-slate-400">
          <Calendar className="w-5 h-5" />
          {format(new Date(), 'MMMM d, yyyy')}
        </p>
      </div>

      <div className="flex self-start gap-2 md:self-auto">
        <Link
          href="/history"
          className="inline-flex items-center gap-2 px-6 py-3 font-medium transition bg-white shadow-md rounded-xl text-slate-700 hover:shadow-lg dark:bg-slate-800 dark:text-slate-200"
        >
          <History className="w-5 h-5" />
          History
        </Link>

        <button
          onClick={() =>
            session ? router.push('/manage-tasks') : router.push('/login')
          }
          className="inline-flex items-center gap-2 px-6 py-3 font-medium transition bg-white shadow-md rounded-xl text-slate-700 hover:shadow-lg dark:bg-slate-800 dark:text-slate-200"
        >
          🛠️ Manage tasks
        </button>
      </div>
    </div>
  );
}
