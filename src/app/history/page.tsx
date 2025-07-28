/* app/history/page.tsx */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { format, subDays } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  ArrowRight,
  Calendar,
  TrendingUp,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

/* ---------- types ---------- */
interface DayRecord {
  date: string;
  tasks: { id: string; text: string; completed: boolean }[];
}

/* ---------- static sample preview for guests ---------- */
const sampleHistory: DayRecord[] = [
  {
    date: subDays(new Date(), 1).toISOString().split('T')[0],
    tasks: [
      { id: '1', text: 'מדיטציה', completed: true },
      { id: '2', text: 'קריאת ספר', completed: true },
      { id: '3', text: 'מתיחות בוקר', completed: true },
      { id: '4', text: 'הליכה 5,000 צעדים', completed: true },
      { id: '5', text: 'כתיבת יומן', completed: true },
      { id: '6', text: 'שתיית 2 ליטר מים', completed: true },
      { id: '7', text: 'שיעור קוד 30 דק׳', completed: true },
      { id: '8', text: 'סידור החדר', completed: true },
      { id: '9', text: 'ללא מסך שעה לפני שינה', completed: true },
      { id: '10', text: 'תכנון יום המחר', completed: true },
    ],
  },
  {
    date: subDays(new Date(), 2).toISOString().split('T')[0],
    tasks: [
      { id: '11', text: 'ריצה 3 ק״מ', completed: true },
      { id: '12', text: 'תרגול יוגה', completed: true },
      { id: '13', text: 'לימוד אנגלית 30 דק׳', completed: false },
      { id: '14', text: 'בישול ביתי', completed: true },
      { id: '15', text: 'שיחת טלפון עם משפחה', completed: true },
      { id: '16', text: 'שתיית תה ירוק', completed: true },
      { id: '17', text: 'דקת הכרת תודה ביומן', completed: true },
      { id: '18', text: 'תרגול נשימות', completed: true },
      { id: '19', text: 'ללמוד רומנית', completed: true },
      { id: '20', text: 'לבצע שוד לאור יום', completed: false },
    ],
  },
  {
    date: subDays(new Date(), 3).toISOString().split('T')[0],
    tasks: [
      { id: '21', text: 'מדיטציית בוקר', completed: true },
      { id: '22', text: '10 דקות מתיחות', completed: true },
      { id: '23', text: 'הליכת ערב', completed: true },
      { id: '24', text: 'לימוד React', completed: true },
      { id: '25', text: 'יוגה', completed: true },
      { id: '26', text: 'שיעור גיטרה', completed: false },
      { id: '27', text: 'התנדבות שעה', completed: false },
      { id: '28', text: 'ניקוי אימיילים', completed: true },
      { id: '29', text: 'מסך כבוי לפני שינה', completed: true },
      { id: '30', text: 'לצעוק על זרים מהחלון', completed: false },
    ],
  },
];

export default function History() {
  const { data: session } = useSession();
  const router = useRouter();

  const [history, setHistory] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);

  /* fetch only when logged‑in */
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-purple-500 rounded-full animate-spin border-t-transparent" />
      </div>
    );
  }

  /* choose real or demo data */
  const dataSource = session ? history : sampleHistory;

  /* aggregate stats */
  const totalDays = dataSource.length;
  const totalTasks = dataSource.reduce((a, d) => a + d.tasks.length, 0);
  const completedTasks = dataSource.reduce(
    (a, d) => a + d.tasks.filter((t) => t.completed).length,
    0
  );
  const overallCompletionRate =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* ---------- page header ---------- */}
        <div className="flex flex-col items-start justify-between gap-4 mb-8 md:flex-row md:items-center">
          <div>
            <h1 className="mb-2 text-4xl font-bold md:text-5xl text-slate-900 dark:text-white">
              היסטוריית משימות
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              30 הימים האחרונים
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 font-medium transition-all duration-200 bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg text-slate-700 dark:text-slate-200"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה להיום
          </Link>
        </div>

        {/* ---------- KPI cards (for everyone) ---------- */}
        <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-3">
          <StatCard
            icon={<Calendar className="w-8 h-8 text-blue-500" />}
            value={totalDays}
            label="ימים נרשמו"
          />
          <StatCard
            icon={<CheckCircle2 className="w-8 h-8 text-green-500" />}
            value={completedTasks}
            label="משימות הושלמו"
          />
          <StatCard
            icon={<TrendingUp className="w-8 h-8 text-purple-500" />}
            value={`${Math.round(overallCompletionRate)}%`}
            label="אחוז השלמה כולל"
          />
        </div>

        {/* ---------- guest preview OR real content ---------- */}
        {!session ? (
          <>
            {/* login prompt */}
            <div className="p-8 mb-8 text-center bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
              <h2 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">
                רוצה לעקוב אחרי ההתקדמות שלך?
              </h2>
              <p className="mb-6 text-slate-600 dark:text-slate-400">
                התחבר כדי לראות אילו משימות השלמת בכל יום ולעקוב אחר ההתקדמות
                שלך לאורך זמן.
              </p>
              <button
                onClick={() => signIn()}
                className="inline-flex items-center gap-2 px-8 py-3 text-lg font-medium text-white bg-violet-600 shadow-md rounded-xl hover:bg-purple-700"
              >
                🚀 התחברות / הרשמה בחינם!
              </button>
            </div>

            {/* faded demo list */}
            <h3 className="mt-4 mb-4 text-lg font-semibold text-center text-slate-700 dark:text-slate-300">
              איך זה ייראה אחרי שתתחבר:
            </h3>
            <div className="space-y-4 pointer-events-none select-none opacity-60">
              {sampleHistory.map((day, i) => {
                const completedCount = day.tasks.filter(
                  (t) => t.completed
                ).length;
                const pct = Math.round(
                  (completedCount / day.tasks.length) * 100
                );

                return <HistoryCard key={day.date} day={day} index={i} />;
              })}
            </div>
          </>
        ) : (
          /* ---------- signed‑in branch ---------- */
          <>
            {history.length === 0 ? (
              /* no data yet → call to action */
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
                  className="inline-flex items-center gap-2 px-8 py-3 text-lg font-medium text-white bg-violet-600 shadow-md rounded-xl hover:bg-purple-700"
                >
                  🛠️ יצירת משימות
                </Link>
              </div>
            ) : (
              /* normal history list */
              <div className="space-y-4">
                {history.map((day, i) => {
                  const completedCount = day.tasks.filter(
                    (t) => t.completed
                  ).length;
                  const pct = Math.round(
                    (completedCount / day.tasks.length) * 100
                  );

                  return <HistoryCard key={day.date} day={day} index={i} />;
                })}
              </div>
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

/* ---------- reusable pieces ---------- */

function StatCard({
  icon,
  value,
  label,
}: {
  icon: JSX.Element;
  value: number | string;
  label: string;
}) {
  return (
    <div className="p-6 bg-white shadow-md dark:bg-slate-800 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        {icon}
        <span className="text-3xl font-bold text-slate-900 dark:text-white">
          {value}
        </span>
      </div>
      <p className="text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}

function ProgressBadge({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`text-2xl font-bold ${
          pct >= 80
            ? 'text-green-600'
            : pct >= 50
            ? 'text-yellow-600'
            : 'text-red-600'
        }`}
      >
        {pct}%
      </span>
      <div className="w-32 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full transition-all duration-300 ${
            pct >= 80
              ? 'bg-green-500'
              : pct >= 50
              ? 'bg-yellow-500'
              : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TaskPill({ task }: { task: { text: string; completed: boolean } }) {
  const pillClass = task.completed
    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400';

  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg ${pillClass}`}>
      {task.completed ? (
        <CheckCircle2 className="flex-shrink-0 w-4 h-4" />
      ) : (
        <XCircle className="flex-shrink-0 w-4 h-4" />
      )}
      <span className={`text-sm ${task.completed ? 'line-through' : ''}`}>
        {task.text}
      </span>
    </div>
  );
}

function HistoryCard({ day, index }: { day: DayRecord; index: number }) {
  const completedCount = day.tasks.filter((t) => t.completed).length;
  const totalCount = day.tasks.length;
  const hasTasks = totalCount > 0;
  const pct = hasTasks ? Math.round((completedCount / totalCount) * 100) : 0; // avoid NaN when totalCount === 0

  return (
    <div
      className="p-6 transition-shadow duration-200 bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg"
      style={{
        animation: `fadeInUp 0.5s ease-out ${index * 0.05}s`,
        animationFillMode: 'both',
      }}
    >
      {/* ───── header row ───── */}
      <div className="flex flex-col items-start justify-between gap-4 mb-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {format(new Date(day.date), 'EEEE, d בMMMM', { locale: he })}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {hasTasks
              ? `${completedCount} / ${totalCount} tasks completed`
              : 'אין עדיין משימות ליום זה'}
          </p>
        </div>

        {/* show progress only when there are tasks */}
        {hasTasks && <ProgressBadge pct={pct} />}
      </div>

      {/* task pills – render only if there are tasks */}
      {hasTasks && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {day.tasks.map((t) => (
            <TaskPill key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
