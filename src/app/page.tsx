'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { he, tr } from 'date-fns/locale';
import { Calendar, History, CheckCircle2, Sparkles } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import { motion } from 'framer-motion';

import Frog, { FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import ProgressCard from '@/components/ui/ProgressCard';
import TaskList from '@/components/ui/TaskList';

const TONGUE_MS = 600;
const OFFSET_MS = 70;
const FLY_PX = 24;
const HIT_AT = 0.5;

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

const demoTasks: Task[] = [
  { id: 'g1', text: 'מדיטציה', completed: true },
  { id: 'g2', text: 'קריאת ספר', completed: true },
  { id: 'g3', text: 'הליכה 5,000 צעדים', completed: true },
  { id: 'g4', text: 'לשתות 2 ליטר מים', completed: true },
  { id: 'g5', text: 'לבדוק שאין מפלצת מתחת למיטה', completed: false },
];

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();
  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLImageElement | null>>({});

  const [tasks, setTasks] = useState<Task[]>([]);
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);
  const [loading, setLoading] = useState(true);

  // ✅ 1. Restore `origin` to the grab state type
  const [grab, setGrab] = useState<{
    taskId: string;
    completed: boolean;
    origin: { x: number; y: number };
    target: { x: number; y: number };
  } | null>(null);

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const data = session ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;

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

  // ✅ 2. Restore original `handleToggle` logic
  const handleToggle = (taskId: string, explicitCompleted?: boolean) => {
    const task = data.find((t) => t.id === taskId);
    if (!task) return;

    const completed =
      explicitCompleted !== undefined ? explicitCompleted : !task.completed;

    if (!completed) {
      persistTask(taskId, false);
      return;
    }

    const flyEl = flyRefs.current[taskId];
    if (!flyEl) {
      persistTask(taskId, true);
      return;
    }

    const pagePt = frogRef.current!.getMouthPoint();
    const rect = flyEl.getBoundingClientRect();

    // ✅ Use viewport coordinates directly
    const origin = {
      x: pagePt.x,
      y: pagePt.y - 20, // The -20 offset is fine
    };
    const target = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    // ➊ wait OFFSET_MS before tongue starts
    setTimeout(() => {
      /* hide the fly exactly when the tongue 'hits' */
      setTimeout(() => {
        flyEl.style.visibility = 'hidden';
      }, TONGUE_MS * HIT_AT);

      setGrab({ taskId, completed, origin, target }); // mouthOpen becomes true
    }, OFFSET_MS);
  };

  const onTongueDone = () => {
    if (!grab) return;
    persistTask(grab.taskId, grab.completed);
    setGrab(null);
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
          <div className="relative p-10 mb-8 overflow-hidden text-center bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
            <h2 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">
              יש פה צפרדע עם בטן מקרקרת!
            </h2>
            <p className="mb-8 text-slate-600 dark:text-slate-400">
              והדרך היחידה להאכיל אותה היא על ידי השלמת המשימות שלך.<br></br>
              בוא/י לעזור לה להרגיש שבעה ומאושרת!
            </p>

            <button
              onClick={() => signIn('google')}
              className="inline-flex items-center gap-2 px-8 py-3 text-lg font-medium text-white shadow-md bg-violet-600 rounded-xl hover:bg-violet-700"
            >
              להתחברות / הרשמה בחינם! 🚀
            </button>
          </div>
        )}

        <div className="flex flex-col items-center w-full">
          <div className="relative z-10">
            <Frog ref={frogRef} mouthOpen={!!grab} />
          </div>
          <div className="relative z-0 w-full -mt-2.5">
            <ProgressCard rate={rate} done={doneCount} total={data.length} />
          </div>
        </div>

        <div className="mt-6">
          <TaskList
            tasks={data}
            toggle={handleToggle}
            showConfetti={rate === 100}
            renderBullet={(task) =>
              task.completed ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(task.id, false);
                  }}
                >
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </button>
              ) : (
                <Fly
                  ref={(el) => {
                    flyRefs.current[task.id] = el;
                  }}
                  onClick={() => handleToggle(task.id, true)}
                />
              )
            }
          />
        </div>
      </div>

      {/* ✅ 3. Restored the original, correct SVG animation block */}
      {grab &&
        (() => {
          const p0 = grab.origin;
          const p2 = grab.target;
          const p1 = { x: (p0.x + p2.x) / 2, y: p0.y - 120 };

          const tonguePath = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
          const times = [0, 0.5, 1];

          const tmp = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path'
          );
          tmp.setAttribute('d', tonguePath);
          const total = tmp.getTotalLength();

          const N = 20;
          const xs: number[] = [];
          const ys: number[] = [];
          const tArr: number[] = [];

          for (let i = 0; i <= N; i++) {
            const f = i / N;
            const pt = tmp.getPointAtLength(f * total);
            xs.push(pt.x);
            ys.push(pt.y);
            tArr.push(f * 0.5);
          }
          for (let i = N; i >= 0; i--) {
            const f = i / N;
            const pt = tmp.getPointAtLength(f * total);
            xs.push(pt.x);
            ys.push(pt.y);
            tArr.push(0.5 + (1 - f) * 0.5);
          }

          return (
            <svg
              className="fixed inset-0 pointer-events-none z-[9999] w-screen h-screen"
              viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="tongue-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#ff6b6b" />
                  <stop offset="1" stopColor="#f43f5e" />
                </linearGradient>
              </defs>
              <motion.path
                d={tonguePath}
                fill="none"
                stroke="url(#tongue-grad)"
                strokeWidth={8}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: [0, 1, 0] }}
                transition={{
                  duration: TONGUE_MS / 1000,
                  times,
                  ease: 'linear',
                }}
                onAnimationComplete={onTongueDone}
              />
              <motion.g
                initial={{ x: xs[0], y: ys[0], scale: 0.8 }}
                animate={{ x: xs, y: ys, scale: [0.8, 1.1, 1] }}
                transition={{
                  duration: TONGUE_MS / 1000,
                  times: tArr,
                  ease: 'linear',
                }}
              >
                <motion.circle
                  r={10}
                  fill="transparent"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: [1, 1, 0], r: [10, 10, 0] }}
                  transition={{
                    duration: TONGUE_MS / 2000,
                    times,
                    ease: 'easeInOut',
                  }}
                />
                <motion.image
                  href="/fly.svg"
                  x={-FLY_PX / 2}
                  y={-FLY_PX / 2}
                  width={FLY_PX}
                  height={FLY_PX}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 1] }}
                  transition={{
                    duration: TONGUE_MS / 1000,
                    times: [HIT_AT - 0.01, HIT_AT, 1],
                    ease: 'easeInOut',
                  }}
                />
              </motion.g>
            </svg>
          );
        })()}
    </main>
  );
}
/* ---------- header (unchanged) ---------- */
function Header({ session, router }: { session: any; router: any }) {
  return (
    <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-4xl font-bold md:text-5xl text-slate-900 dark:text-white">
          {format(new Date(), 'EEEE', { locale: he })}
        </h1>
        <p className="flex items-center gap-2 text-lg text-slate-600 dark:text-slate-400">
          <Calendar className="w-5 h-5" />
          {format(new Date(), 'd בMMMM yyyy', { locale: he })}
        </p>
      </div>

      <div className="flex self-start gap-2 md:self-auto">
        <Link
          href="/history"
          className="inline-flex items-center gap-2 px-6 py-3 font-medium transition bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg text-slate-700 dark:text-slate-200"
        >
          <History className="w-5 h-5" />
          היסטוריה
        </Link>

        <button
          onClick={() =>
            session ? router.push('/manage-tasks') : router.push('/login')
          }
          className="inline-flex items-center gap-2 px-6 py-3 font-medium transition bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg text-slate-700 dark:text-slate-200"
        >
          🛠️ ניהול משימות
        </button>
      </div>
    </div>
  );
}
