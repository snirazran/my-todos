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

/* === Tunables ============================================================ */
const TONGUE_MS = 1111; // longer for smoother feel
const OFFSET_MS = 11; // intentional delay before tongue starts
const PRE_PAN_MS = 520; // camera pre-pan duration (to frog)
const PRE_LINGER_MS = 160; // pause on frog before tongue
const RETURN_MS = 520; // camera return to user spot
const FOLLOW_EASE = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
const HIT_AT = 0.5; // impact at 50% of tongue time
const FLY_PX = 24;
/* ======================================================================== */

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

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

function animateScrollTo(targetY: number, duration: number) {
  return new Promise<void>((resolve) => {
    const start = window.scrollY;
    const dy = targetY - start;
    const t0 = performance.now();

    function frame(t: number) {
      const p = Math.min(1, (t - t0) / duration);
      const y = start + dy * easeOutQuad(p);
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

  // viewport + scroll for svg
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });

  // lock manual scroll during sequence
  const [cinematic, setCinematic] = useState(false);

  // tongue sequence data in DOC coordinates
  const [grab, setGrab] = useState<{
    taskId: string;
    completed: boolean;
    originDoc: { x: number; y: number };
    targetDoc: { x: number; y: number };
    returnToY: number;
    startAt: number; // perf timestamp when tongue begins (with delay baked in)
    follow: boolean; // whether to drive the camera
    frogFocusY: number;
    flyFocusY: number;
  } | null>(null);

  // live tip position (viewport) to glue the fly
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [tipVisible, setTipVisible] = useState(false);

  // keep an internal path cache
  const pathRef = useRef<{
    total: number;
    getPointAtLength: (s: number) => DOMPoint;
    hidImpact: boolean;
    raf: number;
  } | null>(null);

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const data = session ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;

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

  /* -------- viewport + scroll tracking -------- */
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

  /* -------- doc-space helpers -------- */
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

  /* -------- main toggle with cinematic timeline -------- */
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

    // Initial measure
    const mouthV = frogRef.current?.getMouthPoint() ?? { x: -1, y: -1 };
    const flyR = flyEl.getBoundingClientRect();

    const startY = window.scrollY;
    const originDoc0 = getMouthDoc();
    const targetDoc0 = getFlyDoc(flyEl);

    // Decide if we need the camera move
    const needCine = !bothVisible(mouthV, flyR);
    setCinematic(true);

    let frogFocusY = Math.max(0, originDoc0.y - window.innerHeight * 0.35);
    let flyFocusY = Math.max(0, targetDoc0.y - window.innerHeight * 0.45);

    if (needCine) {
      // Pre-pan to frog, then linger a bit
      await animateScrollTo(frogFocusY, PRE_PAN_MS);
      await new Promise((r) => setTimeout(r, PRE_LINGER_MS));
    }

    // Re-measure after any layout shift due to scroll bars/sticky headers etc.
    const originDoc = getMouthDoc();
    const targetDoc = getFlyDoc(flyEl);
    frogFocusY = Math.max(0, originDoc.y - window.innerHeight * 0.35);
    flyFocusY = Math.max(0, targetDoc.y - window.innerHeight * 0.45);

    // Schedule the tongue start time (shared by path + camera)
    const startAt = performance.now() + OFFSET_MS;

    // Hide at impact using the same timeline (not setTimeout)
    if (flyEl) flyEl.style.visibility = 'visible';
    setTipVisible(false);
    setGrab({
      taskId,
      completed,
      originDoc,
      targetDoc,
      returnToY: startY,
      startAt,
      follow: needCine,
      frogFocusY,
      flyFocusY,
    });
  };

  /* -------- unified RAF: tongue, camera follow, tip glue, impact -------- */
  useEffect(() => {
    if (!grab) return;

    // Build doc path
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
      hidImpact: false,
      raf: 0,
    };

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const tRaw = (now - grab.startAt) / TONGUE_MS;
      const t = Math.max(0, Math.min(1, tRaw));

      // progress 0..1..0 for extend/retract
      const forward =
        t <= HIT_AT ? t / HIT_AT : 1 - (t - HIT_AT) / (1 - HIT_AT);

      // tip position (doc -> viewport)
      const pt = pathRef.current!.getPointAtLength(total * forward);
      setTip({ x: pt.x - window.scrollX, y: pt.y - window.scrollY });

      // impact hide at exact HIT_AT
      if (!pathRef.current!.hidImpact && t >= HIT_AT) {
        pathRef.current!.hidImpact = true;
        setTipVisible(true); // <-- show the tip now

        const flyEl = Object.values(flyRefs.current).find((el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2 + window.scrollX;
          const y = r.top + r.height / 2 + window.scrollY;
          return Math.abs(x - p2.x) < 1 && Math.abs(y - p2.y) < 1;
        });
        if (flyEl) flyEl.style.visibility = 'hidden';
      }

      // camera follow (only when needed)
      if (grab.follow) {
        const seg = t <= HIT_AT ? t / HIT_AT : (t - HIT_AT) / (1 - HIT_AT);
        const eased = FOLLOW_EASE(seg);
        const from = t <= HIT_AT ? grab.frogFocusY : grab.flyFocusY;
        const to = t <= HIT_AT ? grab.flyFocusY : grab.frogFocusY;
        const camY = from + (to - from) * eased;
        window.scrollTo(0, camY);
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // tongue finished
        setTip(null);
        setTipVisible(false);
        persistTask(grab.taskId, grab.completed);

        // gentle return to where the user was (if we did a camera move)
        (async () => {
          if (grab.follow) {
            await new Promise((r) => setTimeout(r, 140)); // tiny linger
            await animateScrollTo(grab.returnToY, RETURN_MS);
          } else {
            await new Promise((r) => setTimeout(r, 140));
          }
          setCinematic(false);
          setGrab(null);
        })();
      }
    };

    // lock scroll while the whole thing runs
    setCinematic(true);
    raf = requestAnimationFrame(tick);
    pathRef.current!.raf = raf;

    return () => {
      if (pathRef.current?.raf) cancelAnimationFrame(pathRef.current.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grab]);

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

      {/* Tongue SVG overlay — doc path -> viewport each frame.
          NOTE: path animation delay matches OFFSET_MS so visuals sync with RAF. */}
      {grab &&
        (() => {
          const toV = (p: { x: number; y: number }) => ({
            x: p.x - scrollPos.x,
            y: p.y - scrollPos.y,
          });

          const p0V = toV(grab.originDoc);
          const p2V = toV(grab.targetDoc);
          const p1V = { x: (p0V.x + p2V.x) / 2, y: p0V.y - 120 };

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
                  delay: OFFSET_MS / 1000, // <-- sync with RAF start
                  duration: TONGUE_MS / 1000,
                  times: [0, HIT_AT, 1],
                  ease: 'linear',
                }}
              />

              {/* Fly glued to tip (from unified RAF) */}
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
