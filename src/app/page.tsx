// app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  History as HistoryIcon,
  Sparkles as SparklesIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');

  /* ───────────────────────────────────────── Fetch ───────────────────────────────────────── */
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch(`/api/tasks?date=${dateStr}`);
        const json = await res.json();
        setTasks(json.tasks ?? []);
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTasks();
  }, [dateStr]);

  const updateTask = async (taskId: string, completed: boolean) => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, taskId, completed }),
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed } : t))
      );
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  /* ───────────────────────────────────────── Derived state ───────────────────────────────── */
  const completed = tasks.filter((t) => t.completed).length;
  const progress = tasks.length ? (completed / tasks.length) * 100 : 0;

  /* ───────────────────────────────────────── Loading skeleton ────────────────────────────── */
  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Skeleton className="h-16 w-16 rounded-full" />
      </main>
    );
  }

  /* ───────────────────────────────────────── UI ──────────────────────────────────────────── */
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-muted/50 py-10 text-right dark:bg-background"
    >
      <div className="mx-auto w-full max-w-3xl space-y-10 px-4">
        {/* ───────────────────────────── Header ───────────────────────────── */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              {format(today, 'EEEE', { locale: he })}
            </h1>
            <p className="mt-1 flex items-center gap-1 text-muted-foreground">
              <CalendarIcon className="h-4 w-4" />
              {format(today, 'd בMMMM yyyy', { locale: he })}
            </p>
          </div>

          <Button asChild variant="secondary" className="gap-2">
            <Link href="/history">
              <HistoryIcon className="h-4 w-4" />
              היסטוריה
            </Link>
          </Button>
        </header>

        {/* ────────────────────────── Progress card ───────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <SparklesIcon className="h-5 w-5 text-primary" />
              ההתקדמות שלך היום
            </CardTitle>
            <span className="text-2xl font-bold text-primary">
              {Math.round(progress)}%
            </span>
          </CardHeader>
          <CardContent>
            <Progress value={progress} />
            <p className="mt-2 text-sm text-muted-foreground">
              השלמת {completed} מתוך {tasks.length} משימות
            </p>
          </CardContent>
        </Card>

        {/* ─────────────────────────── Tasks list ─────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>המשימות שלי</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {tasks.map((task, idx) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 rounded-lg bg-background/50 p-3 shadow-sm
                           animate-in fade-in slide-in-from-bottom-2"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <Checkbox
                    checked={task.completed}
                    onCheckedChange={(checked) =>
                      updateTask(task.id, Boolean(checked))
                    }
                    className="ml-1 shrink-0"
                  />
                  <span
                    className={
                      task.completed ? 'line-through text-muted-foreground' : ''
                    }
                  >
                    {task.text}
                  </span>
                  {task.completed && (
                    <Badge
                      variant="outline"
                      className="mr-auto animate-bounce text-lg leading-none"
                    >
                      ✨
                    </Badge>
                  )}
                </li>
              ))}

              {tasks.length === 0 && (
                <p className="text-center text-muted-foreground">
                  אין לך משימות להיום ✨
                </p>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* ─────────────────── Finished-all congratulation ─────────────────── */}
        {progress === 100 && (
          <Card className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white animate-pulse">
            <CardHeader>
              <CardTitle className="flex flex-col items-center gap-1">
                <span className="text-3xl">🎉 כל הכבוד! 🎉</span>
                <span className="text-lg">השלמת את כל המשימות להיום!</span>
              </CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>
    </main>
  );
}
