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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-2">
              {format(today, 'EEEE', { locale: he })}
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {format(today, 'd בMMMM yyyy', { locale: he })}
            </p>
          </div>
          <Link
            href="/history"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-slate-700 dark:text-slate-200 font-medium"
          >
            <History className="w-5 h-5" />
            היסטוריה
          </Link>
        </div>

        {/* Progress Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-500" />
              ההתקדמות שלך היום
            </h2>
            <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {Math.round(completionRate)}%
            </span>
          </div>
          <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out"
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            השלמת {completedCount} מתוך {tasks.length} משימות
          </p>
        </div>

        {/* Tasks List */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            המשימות שלי
          </h2>
          <div className="space-y-2">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className="group p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 cursor-pointer"
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
                      <Circle className="w-6 h-6 text-slate-400 group-hover:text-purple-500 transition-colors" />
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
          <div className="mt-6 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-2xl shadow-lg p-6 text-center animate-pulse">
            <h3 className="text-2xl font-bold mb-2">🎉 כל הכבוד! 🎉</h3>
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
