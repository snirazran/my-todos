'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  Calendar,
  History,
  CheckCircle2,
  Circle,
  Sparkles,
} from 'lucide-react';
import { signIn, signOut, useSession } from 'next-auth/react';

/* ---------- types ---------- */
interface Task {
  id: string;
  text: string;
  completed: boolean;
}

/* ---------- guest demo tasks ---------- */
const demoTasks: Task[] = [
  { id: 'g1', text: 'מדיטציה', completed: true },
  { id: 'g2', text: 'קריאת ספר', completed: true },
  { id: 'g3', text: 'קניות לבית', completed: true },
  { id: 'g4', text: 'שתיית 2 ליטר מים', completed: true },
  { id: 'g5', text: 'הליכה 5,000 צעדים', completed: true },
  { id: 'g6', text: 'תרגול יוגה', completed: true },
  { id: 'g7', text: 'כתיבת יומן', completed: true },
  { id: 'g8', text: 'לבדוק שאין מפלצת מתחת למיטה', completed: false },
];

/* ──────────── Top‑bar auth button ──────────── */

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();

  /* ---------------- real tasks ---------------- */
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const res = await fetch(`/api/tasks?date=${dateStr}`);
        const data = await res.json();
        setTasks(data.tasks ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [session, dateStr]);

  const toggleTask = async (taskId: string, completed?: boolean) => {
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: dateStr,
        taskId,
        completed:
          completed !== undefined
            ? completed
            : !tasks.find((t) => t.id === taskId)?.completed,
      }),
    });

    setTasks((t) =>
      t.map((x) =>
        x.id === taskId ? { ...x, completed: completed ?? !x.completed } : x
      )
    );
  };

  /* ---------------- demo tasks ---------------- */
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);
  const toggleGuestTask = (id: string, completed?: boolean) =>
    setGuestTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, completed: completed ?? !t.completed } : t
      )
    );

  /* ---------------- helpers ---------------- */
  const data = session ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  const rate = data.length ? (doneCount / data.length) * 100 : 0;

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
        {/* header */}
        <Header session={session} router={router} />

        {/* ---------- guest OR logged‑in content ---------- */}
        {!session ? (
          /* ───────── guest branch ───────── */
          <>
            {/* login prompt */}
            <div className="p-8 mb-8 text-center bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
              <h2 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">
                ברוך הבא!
              </h2>
              <p className="mb-6 text-slate-600 dark:text-slate-400">
                התחבר כדי ליצור משימות שבועיות ולעקוב אחרי ההתקדמות היומית שלך.
              </p>
              <button
                onClick={() => signIn()}
                className="inline-flex items-center gap-2 px-8 py-3 text-lg font-medium text-white bg-purple-600 shadow-md rounded-xl hover:bg-purple-700"
              >
                🚀 התחברות / הרשמה בחינם!
              </button>
            </div>

            {/* demo progress + tasks */}
            <ProgressCard rate={rate} done={doneCount} total={data.length} />
            <TaskList
              tasks={guestTasks}
              toggle={toggleGuestTask}
              showConfetti={rate === 100}
            />
          </>
        ) : (
          /* ───────── logged‑in branch ───────── */
          <>
            {tasks.length === 0 ? (
              /* no tasks yet – CTA */
              <div className="p-8 text-center bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
                <h2 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">
                  עוד לא יצרת משימות 🔖
                </h2>
                <p className="mb-6 text-slate-600 dark:text-slate-400">
                  לחץ על הכפתור כדי לבנות רשימת משימות שבועית ולהתחיל לעקוב אחרי
                  ההתקדמות שלך.
                </p>
                <Link
                  href="/manage-tasks"
                  className="inline-flex items-center gap-2 px-8 py-3 text-lg font-medium text-white bg-purple-600 shadow-md rounded-xl hover:bg-purple-700"
                >
                  🛠️ יצירת משימות
                </Link>
              </div>
            ) : (
              /* normal daily view */
              <>
                <ProgressCard
                  rate={rate}
                  done={doneCount}
                  total={tasks.length}
                />
                <TaskList
                  tasks={tasks}
                  toggle={toggleTask}
                  showConfetti={rate === 100}
                />
              </>
            )}
          </>
        )}
      </div>

      {/* animation keyframes */}
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

/* ---------- tiny sub‑components ---------- */

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

function ProgressCard({
  rate,
  done,
  total,
}: {
  rate: number;
  done: number;
  total: number;
}) {
  return (
    <div className="p-6 mb-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <Sparkles className="w-6 h-6 text-purple-500" />
          ההתקדמות שלך היום
        </h2>
        <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
          {Math.round(rate)}%
        </span>
      </div>
      <div className="w-full h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 to-pink-500"
          style={{ width: `${rate}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        השלמת {done} מתוך {total} משימות
      </p>
    </div>
  );
}

function TaskList({
  tasks,
  toggle,
  showConfetti,
}: {
  tasks: Task[];
  toggle: (id: string, completed?: boolean) => void;
  showConfetti: boolean;
}) {
  return (
    <>
      <div className="p-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
        <h2 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white">
          המשימות שלי
        </h2>
        <div className="space-y-2">
          {tasks.map((task, i) => (
            <div
              key={task.id}
              className="p-4 transition-all duration-200 cursor-pointer group rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700"
              style={{
                animation: `fadeInUp 0.5s ease-out ${i * 0.05}s`,
                animationFillMode: 'both',
              }}
            >
              <label className="flex items-center gap-4 cursor-pointer">
                <button
                  onClick={() => toggle(task.id, !task.completed)}
                  className="flex-shrink-0"
                >
                  {task.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <Circle className="w-6 h-6 transition-colors text-slate-400 group-hover:text-purple-500" />
                  )}
                </button>
                <span
                  className={`text-lg transition-all duration-200 ${
                    task.completed
                      ? 'text-slate-400 dark:text-slate-500 line-through'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {task.text}
                </span>
                {task.completed && (
                  <span className="mr-auto text-xl animate-bounce">✨</span>
                )}
              </label>
            </div>
          ))}
        </div>
      </div>

      {showConfetti && (
        <div className="p-6 mt-6 text-center text-white shadow-lg bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl animate-pulse">
          <h3 className="mb-2 text-2xl font-bold">🎉 כל הכבוד! 🎉</h3>
          <p className="text-lg">השלמת את כל המשימות להיום!</p>
        </div>
      )}
    </>
  );
}
