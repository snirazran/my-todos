// app/history/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  ArrowRight,
  Calendar,
  TrendingUp,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface DayRecord {
  date: string;
  tasks: Array<{
    id: string;
    text: string;
    completed: boolean;
  }>;
}

export default function History() {
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/history');
      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent"></div>
      </div>
    );
  }

  // Calculate overall stats
  const totalDays = history.length;
  const totalTasks = history.reduce((acc, day) => acc + day.tasks.length, 0);
  const completedTasks = history.reduce(
    (acc, day) => acc + day.tasks.filter((t) => t.completed).length,
    0
  );
  const overallCompletionRate =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-2">
              היסטוריית משימות
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              30 הימים האחרונים
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-slate-700 dark:text-slate-200 font-medium"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה להיום
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <Calendar className="w-8 h-8 text-blue-500" />
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {totalDays}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-400">ימים נרשמו</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {completedTasks}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-400">משימות הושלמו</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 text-purple-500" />
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {Math.round(overallCompletionRate)}%
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              אחוז השלמה כולל
            </p>
          </div>
        </div>

        {/* History List */}
        <div className="space-y-4">
          {history.map((day, dayIndex) => {
            const completedCount = day.tasks.filter((t) => t.completed).length;
            const totalCount = day.tasks.length;
            const completionRate = Math.round(
              (completedCount / totalCount) * 100
            );

            return (
              <div
                key={day.date}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-200"
                style={{
                  animation: `fadeInUp 0.5s ease-out ${dayIndex * 0.05}s`,
                  animationFillMode: 'both',
                }}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      {format(new Date(day.date), 'EEEE, d בMMMM', {
                        locale: he,
                      })}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {completedCount} מתוך {totalCount} משימות הושלמו
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-2xl font-bold ${
                        completionRate >= 80
                          ? 'text-green-600'
                          : completionRate >= 50
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {completionRate}%
                    </span>
                    <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          completionRate >= 80
                            ? 'bg-green-500'
                            : completionRate >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {day.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center gap-2 p-2 rounded-lg ${
                        task.completed
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span
                        className={`text-sm ${
                          task.completed ? 'line-through' : ''
                        }`}
                      >
                        {task.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
