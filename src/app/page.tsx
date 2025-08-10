'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Calendar, History, CheckCircle2 } from 'lucide-react';
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

// ---------- helpers ----------
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function animateScrollTo(targetY: number, duration: number) {
  return new Promise<void>((resolve) => {
    const start = window.scrollY;
    const dy = targetY - start;
    const t0 = performance.now();

    function frame(t: number) {
      const p = Math.min(1, (t - t0) / duration);
      const y = start + dy * easeInOutCubic(p);
      window.scrollTo(0, y);
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();

  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLImageElement | null>>({});

  const [tasks, setTasks] = useState<Task[]>([]);
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);
  const [loading, setLoading] = useState(true);

  // viewport + scroll (for SVG viewBox + doc->viewport mapping)
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });

  // block manual scroll during sequence
  const [cinematic, setCinematic] = useState(false);

  // tongue sequence data in DOC coordinates
  const [grab, setGrab] = useState<{
    taskId: string;
    completed: boolean;
    originDoc: { x: number; y: number };
    targetDoc: { x: number; y: number };
    returnToY: number;
  } | null>(null);

  // live tip position in VIEWPORT coords (keeps fly glued)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  // precomputed DOC path numbers for RAF
  const pathRef = useRef<{
    total: number;
    getPointAtLength: (s: number) => DOMPoint;
    startTime: number;
  } | null>(null);

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const data = session ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;

  // ---- data load ----
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

  // ---- track viewport + scroll ----
  useEffect(() => {
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight });
    const onScroll = () =>
      setScrollPos({ x: window.scrollX, y: window.scrollY });
    onResize();
    onScroll();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // block manual scroll during cinematic
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

  // DOC coordinates (stable)
  const getMouthDoc = useCallback(() => {
    const p = frogRef.current?.getMouthPoint();
    if (!p) return { x: 0, y: 0 };
    return { x: p.x + window.scrollX, y: p.y + window.scrollY - 20 };
  }, []);
  const getFlyDoc = useCallback((el: HTMLImageElement) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 + window.scrollX,
      y: r.top + r.height / 2 + window.scrollY,
    };
  }, []);

  // visibility check (are both frog mouth & fly visible?)
  const bothVisible = (
    mouthV: { x: number; y: number } | null,
    flyRect: DOMRect
  ) => {
    const inV = (x: number, y: number) =>
      x >= 0 && x <= window.innerWidth && y >= 0 && y <= window.innerHeight;
    const mouthOk = !!mouthV && inV(mouthV.x, mouthV.y);
    const flyOk =
      flyRect.left < window.innerWidth &&
      flyRect.right > 0 &&
      flyRect.top < window.innerHeight &&
      flyRect.bottom > 0;
    return mouthOk && flyOk;
  };

  // ---- the cinematic sequence + tongue ----
  const handleToggle = async (taskId: string, explicitCompleted?: boolean) => {
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

    // measure mouth/fly
    const mouthV = frogRef.current?.getMouthPoint() ?? { x: -1, y: -1 };
    const flyR = flyEl.getBoundingClientRect();

    const originDoc = getMouthDoc();
    const targetDoc = getFlyDoc(flyEl);
    const startY = window.scrollY;

    // need cinematic only if one/both are off-screen
    const needCine = !bothVisible(mouthV, flyR);
    setCinematic(true);

    if (needCine) {
      // pan to frog
      const frogFocusY = Math.max(0, originDoc.y - window.innerHeight * 0.35);
      await animateScrollTo(frogFocusY, 350);
    }

    // start after a tiny delay (feel free to tweak)
    setTimeout(() => {
      // hide the fly at impact
      setTimeout(() => {
        flyEl.style.visibility = 'hidden';
      }, TONGUE_MS * HIT_AT);

      setGrab({
        taskId,
        completed,
        originDoc,
        targetDoc,
        returnToY: startY,
      });
    }, OFFSET_MS);

    if (needCine) {
      // move towards the fly
      await animateScrollTo(
        Math.max(0, targetDoc.y - window.innerHeight * 0.45),
        TONGUE_MS * HIT_AT
      );
      // then back to frog
      const frogFocusY = Math.max(0, originDoc.y - window.innerHeight * 0.35);
      await animateScrollTo(frogFocusY, TONGUE_MS * (1 - HIT_AT));
      // return user to where they were
      await animateScrollTo(startY, 350);
    } else {
      // no camera moves—just keep scroll locked briefly
      await new Promise((r) => setTimeout(r, TONGUE_MS + 120));
    }

    setCinematic(false);
  };

  // RAF that keeps the fly glued to the tongue tip (doc path -> viewport coords)
  useEffect(() => {
    if (!grab) return;

    // build the DOC path and length
    const p0 = grab.originDoc;
    const p2 = grab.targetDoc;
    const p1 = { x: (p0.x + p2.x) / 2, y: p0.y - 120 };

    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tmp.setAttribute(
      'd',
      `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`
    );
    const total = tmp.getTotalLength();

    pathRef.current = {
      total,
      getPointAtLength: (s: number) => tmp.getPointAtLength(s),
      startTime: performance.now(),
    };

    let raf = 0;
    const tick = () => {
      const ref = pathRef.current!;
      const elapsed = performance.now() - ref.startTime;
      const t = Math.min(1, elapsed / TONGUE_MS);
      // progress along path: extend then retract
      const forward =
        t <= HIT_AT ? t / HIT_AT : 1 - (t - HIT_AT) / (1 - HIT_AT);

      const pt = ref.getPointAtLength(ref.total * forward);
      // map DOC -> VIEWPORT with current live scroll values
      const sx = window.scrollX;
      const sy = window.scrollY;
      setTip({ x: pt.x - sx, y: pt.y - sy });

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // end
        setTip(null);
        onTongueDone();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grab]);

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
              והדרך היחידה להאכיל אותה היא על ידי השלמת המשימות שלך.
              <br />
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

      {/* Tongue SVG overlay: path built in DOC space; mapped to VIEWPORT each render */}
      {grab &&
        (() => {
          const toV = (p: { x: number; y: number }) => ({
            x: p.x - scrollPos.x,
            y: p.y - scrollPos.y,
          });

          const p0Doc = grab.originDoc;
          const p2Doc = grab.targetDoc;
          const p1Doc = { x: (p0Doc.x + p2Doc.x) / 2, y: p0Doc.y - 120 };

          const p0V = toV(p0Doc);
          const p1V = toV(p1Doc);
          const p2V = toV(p2Doc);

          const tonguePathViewport = `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`;

          return (
            <svg
              style={{
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: 9999,
              }}
              width={vp.w}
              height={vp.h}
              viewBox={`0 0 ${vp.w} ${vp.h}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="tongue-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#ff6b6b" />
                  <stop offset="1" stopColor="#f43f5e" />
                </linearGradient>
              </defs>

              <motion.path
                d={tonguePathViewport}
                fill="none"
                stroke="url(#tongue-grad)"
                strokeWidth={8}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: [0, 1, 0] }}
                transition={{
                  duration: TONGUE_MS / 1000,
                  times: [0, 0.5, 1],
                  ease: 'linear',
                }}
              />

              {/* Fly glued to the tip (RAF updates `tip`) */}
              {tip && (
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
