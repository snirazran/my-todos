// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  Calendar,
  History,
  CheckCircle2,
  Circle,
  Sparkles,
} from 'lucide-react';

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch(`/api/tasks?date=${dateStr}`);
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, taskId, completed }),
      });

      setTasks(
        tasks.map((task) =>
          task.id === taskId ? { ...task, completed } : task
        )
      );
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const completionRate =
    tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-4 mb-8 md:flex-row md:items-center">
          <div>
            <h1 className="mb-2 text-4xl font-bold md:text-5xl text-slate-900 dark:text-white">
              {format(today, 'EEEE', { locale: he })}
            </h1>
            <p className="flex items-center gap-2 text-lg text-slate-600 dark:text-slate-400">
              <Calendar className="w-5 h-5" />
              {format(today, 'd בMMMM yyyy', { locale: he })}
            </p>
          </div>
          <Link
            href="/history"
            className="inline-flex items-center gap-2 px-6 py-3 font-medium transition-all duration-200 bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg text-slate-700 dark:text-slate-200"
          >
            <History className="w-5 h-5" />
            היסטוריה
          </Link>
          <Link
            href="/manage-tasks"
            className="inline-flex items-center gap-2 px-6 py-3 font-medium transition-all duration-200 bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg text-slate-700 dark:text-slate-200"
          >
            🛠️ ניהול משימות
          </Link>
        </div>

        {/* Progress Card */}
        <div className="p-6 mb-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
              <Sparkles className="w-6 h-6 text-purple-500" />
              ההתקדמות שלך היום
            </h2>
            <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {Math.round(completionRate)}%
            </span>
          </div>
          <div className="w-full h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 to-pink-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            השלמת {completedCount} מתוך {tasks.length} משימות
          </p>
        </div>

        {/* Tasks List */}
        <div className="p-6 bg-white shadow-lg dark:bg-slate-800 rounded-2xl">
          <h2 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white">
            המשימות שלי
          </h2>
          <div className="space-y-2">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className="p-4 transition-all duration-200 cursor-pointer group rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700"
                style={{
                  animation: `fadeInUp 0.5s ease-out ${index * 0.05}s`,
                  animationFillMode: 'both',
                }}
              >
                <label className="flex items-center gap-4 cursor-pointer">
                  <button
                    onClick={() => toggleTask(task.id, !task.completed)}
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

        {/* Completion Message */}
        {completionRate === 100 && (
          <div className="p-6 mt-6 text-center text-white shadow-lg bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl animate-pulse">
            <h3 className="mb-2 text-2xl font-bold">🎉 כל הכבוד! 🎉</h3>
            <p className="text-lg">השלמת את כל המשימות להיום!</p>
          </div>
        )}
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
