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
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
/* === Tunables ============================================================ */
const TONGUE_MS = 1111; // tongue extend+retract total
const OFFSET_MS = 160; // anticipation delay before tongue starts
const PRE_PAN_MS = 600; // camera pre-pan up to frog
const PRE_LINGER_MS = 180; // small pause on frog before firing
const CAM_START_DELAY = 140; // start following down after tongue begins
const RETURN_MS = 520; // (not used for return now, but kept for future)
const ORIGIN_Y_ADJ = 0;
const TONGUE_STROKE = 8;
const FOLLOW_EASE = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
const HIT_AT = 0.5; // impact at 50% of tongue
const FLY_PX = 24;
/* ======================================================================== */
gsap.registerPlugin(ScrollToPlugin);
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
  const cooldownUntil = useRef(0);

  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLImageElement | null>>({});

  const [tasks, setTasks] = useState<Task[]>([]);
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);
  const [loading, setLoading] = useState(true);

  const [visuallyDone, setVisuallyDone] = useState<Set<string>>(new Set());

  const [vp, setVp] = useState({ w: 0, h: 0 });
  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  // lock manual scroll during sequence
  const [cinematic, setCinematic] = useState(false);

  // tongue sequence data in DOC coordinates
  const [grab, setGrab] = useState<{
    taskId: string;
    completed: boolean;
    originDoc: { x: number; y: number };
    targetDoc: { x: number; y: number };
    returnToY: number;
    startAt: number; // perf timestamp when tongue begins (after OFFSET_MS)
    camStartAt: number; // when camera follow starts (after CAM_START_DELAY)
    follow: boolean; // whether to drive the camera down
    frogFocusY: number;
    flyFocusY: number;
  } | null>(null);

  // tip glued fly (viewport)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [tipVisible, setTipVisible] = useState(false);

  // SVG path DOM ref (we update `d` every frame so it never drifts on scroll)
  const tonguePathEl = useRef<SVGPathElement | null>(null);

  // path geometry cache (doc space)
  const geomRef = useRef<{
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

  /* -------- viewport tracking (for initial viewBox size) -------- */
  useEffect(() => {
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
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
    const vv = window.visualViewport;
    const offX = window.scrollX + (vv?.offsetLeft ?? 0);
    const offY = window.scrollY + (vv?.offsetTop ?? 0);
    return { x: p.x + offX, y: p.y + offY + ORIGIN_Y_ADJ };
  }, []);

  const getFlyDoc = useCallback((el: HTMLImageElement) => {
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const offX = window.scrollX + (vv?.offsetLeft ?? 0);
    const offY = window.scrollY + (vv?.offsetTop ?? 0);
    return {
      x: r.left + r.width / 2 + offX,
      y: r.top + r.height / 2 + offY,
    };
  }, []);
  const visibleRatio = (r: DOMRect) => {
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const xOverlap = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const yOverlap = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const visArea = xOverlap * yOverlap;
    const totalArea = Math.max(1, r.width * r.height);
    return visArea / totalArea; // 0..1
  };

  /* -------- main toggle with cinematic timeline -------- */

  const handleToggle = async (taskId: string, explicitCompleted?: boolean) => {
    if (cinematic || grab || performance.now() < cooldownUntil.current) return;
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
    const startY = window.scrollY; // you pass this into setGrab

    const originDoc0 = getMouthDoc(); // first measurement
    const targetDoc0 = getFlyDoc(flyEl);

    let frogFocusY = Math.max(0, originDoc0.y - window.innerHeight * 0.35);
    let flyFocusY = Math.max(0, targetDoc0.y - window.innerHeight * 0.45);
    const mouthV = frogRef.current?.getMouthPoint() ?? { x: -1, y: -1 };
    const flyR = flyEl.getBoundingClientRect();
    const frogR = frogBoxRef.current?.getBoundingClientRect();

    const frogRatio = frogR ? visibleRatio(frogR) : 0;
    const flyVisible =
      flyR.top < window.innerHeight &&
      flyR.bottom > 0 &&
      flyR.left < window.innerWidth &&
      flyR.right > 0;

    // Now require 75% of frog to be visible
    const needCine = frogRatio < 0.75 || !flyVisible;
    setCinematic(true);

    if (needCine) {
      // Pre-pan to frog, then linger a bit
      await animateScrollTo(frogFocusY, PRE_PAN_MS);
      await new Promise((r) => setTimeout(r, PRE_LINGER_MS));
    }

    // Re-measure after any layout shift
    const originDoc = getMouthDoc();
    const targetDoc = getFlyDoc(flyEl);
    frogFocusY = Math.max(0, originDoc.y - window.innerHeight * 0.35);
    flyFocusY = Math.max(0, targetDoc.y - window.innerHeight * 0.45);

    const startAt = performance.now() + OFFSET_MS;
    const camStartAt = startAt + CAM_START_DELAY;

    if (flyEl) flyEl.style.visibility = 'visible';
    setTipVisible(false);

    setGrab({
      taskId,
      completed,
      originDoc,
      targetDoc,
      returnToY: startY,
      startAt,
      camStartAt,
      follow: needCine, // follow only if needed
      frogFocusY,
      flyFocusY,
    });
  };

  /* -------- unified RAF: tongue, camera follow (down only), tip glue, impact -------- */
  useEffect(() => {
    if (!grab) return;

    // --- Build doc path with settling & visualViewport support ---
    let p0Doc = getMouthDoc(); // fresh mouth position at fire-time
    const p2 = grab.targetDoc; // target stays fixed for this shot

    const buildGeom = (p0: { x: number; y: number }) => {
      const p1 = { x: (p0.x + p2.x) / 2, y: p0.y - 120 };
      const tmp = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
      tmp.setAttribute(
        'd',
        `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`
      );
      const total = tmp.getTotalLength();
      return { tmp, total, p1 };
    };

    let { tmp, total, p1: p1Doc } = buildGeom(p0Doc);

    geomRef.current = {
      total,
      getPointAtLength: (s: number) => tmp.getPointAtLength(s),
      hidImpact: false,
      raf: 0,
    };

    // Seed the visible path immediately (avoid 1-frame mismatch)
    const seedViewportPath = () => {
      const vv = window.visualViewport;
      const offX = window.scrollX + (vv?.offsetLeft ?? 0);
      const offY = window.scrollY + (vv?.offsetTop ?? 0);

      const p0V = { x: p0Doc.x - offX, y: p0Doc.y - offY };
      const p1V = { x: p1Doc.x - offX, y: p1Doc.y - offY };
      const p2V = { x: p2.x - offX, y: p2.y - offY };
      tonguePathEl.current?.setAttribute(
        'd',
        `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`
      );
    };
    seedViewportPath();

    // Let the mouth "settle" for ~140ms (Rive state machine can move it slightly)
    const settleUntil = grab.startAt + 140;

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const tRaw = (now - grab.startAt) / TONGUE_MS;
      const t = Math.max(0, Math.min(1, tRaw));

      // For the first frames, re-measure mouth and rebuild the curve if it moved
      if (now < settleUntil) {
        const fresh = getMouthDoc();
        const next = {
          x: p0Doc.x + (fresh.x - p0Doc.x) * 0.35,
          y: p0Doc.y + (fresh.y - p0Doc.y) * 0.35,
        };
        if (Math.abs(next.x - p0Doc.x) + Math.abs(next.y - p0Doc.y) > 0.25) {
          p0Doc = next;
          ({ tmp, total, p1: p1Doc } = buildGeom(p0Doc));
          if (geomRef.current) {
            geomRef.current.total = total;
            geomRef.current.getPointAtLength = (s: number) =>
              tmp.getPointAtLength(s);
          }
        }
      }

      // progress 0..1..0 for extend/retract
      const forward =
        t <= HIT_AT ? t / HIT_AT : 1 - (t - HIT_AT) / (1 - HIT_AT);

      // Keep the SVG path aligned to current visual viewport each frame
      {
        const vv = window.visualViewport;
        const offX = window.scrollX + (vv?.offsetLeft ?? 0);
        const offY = window.scrollY + (vv?.offsetTop ?? 0);

        const p0V = { x: p0Doc.x - offX, y: p0Doc.y - offY };
        const p1V = { x: p1Doc.x - offX, y: p1Doc.y - offY };
        const p2V = { x: p2.x - offX, y: p2.y - offY };
        tonguePathEl.current?.setAttribute(
          'd',
          `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`
        );
      }

      // Tip position (doc -> viewport), nudged to the rounded end-cap
      const sLen = total * forward;
      const pt = geomRef.current!.getPointAtLength(sLen);
      const ahead = geomRef.current!.getPointAtLength(
        Math.min(total, sLen + 1)
      );
      const dx = ahead.x - pt.x;
      const dy = ahead.y - pt.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (dx / len) * (TONGUE_STROKE / 2);
      const oy = (dy / len) * (TONGUE_STROKE / 2);
      {
        const vv = window.visualViewport;
        const offX = window.scrollX + (vv?.offsetLeft ?? 0);
        const offY = window.scrollY + (vv?.offsetTop ?? 0);
        setTip({ x: pt.x + ox - offX, y: pt.y + oy - offY });
      }

      // Impact: swap bullet to check + show tip-mounted fly immediately
      if (!geomRef.current!.hidImpact && t >= HIT_AT) {
        geomRef.current!.hidImpact = true;
        setVisuallyDone((prev) => new Set(prev).add(grab.taskId));
        setTipVisible(true);
      }

      // Camera follow (down only) until impact
      if (grab.follow && now >= grab.camStartAt && t <= HIT_AT) {
        const seg =
          (now - grab.camStartAt) / (TONGUE_MS * HIT_AT - CAM_START_DELAY);
        const clamped = Math.max(0, Math.min(1, seg));
        const eased = FOLLOW_EASE(clamped);
        const camY =
          grab.frogFocusY + (grab.flyFocusY - grab.frogFocusY) * eased;
        window.scrollTo(0, camY);
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // Finished
        setTip(null);
        setTipVisible(false);
        persistTask(grab.taskId, grab.completed);
        setVisuallyDone((prev) => {
          const s = new Set(prev);
          s.delete(grab.taskId);
          return s;
        });

        // short cooldown AFTER the shot completes (prevents spam-ghosts)
        cooldownUntil.current = performance.now() + 220; // ~0.2s

        // tiny linger; we don't return the camera up
        setTimeout(() => {
          setCinematic(false);
          setGrab(null);
        }, 140);
      }
    };

    setCinematic(true);
    raf = requestAnimationFrame(tick);
    if (geomRef.current) geomRef.current.raf = raf;

    return () => {
      if (geomRef.current?.raf) cancelAnimationFrame(geomRef.current.raf);
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
          <div ref={frogBoxRef} className="relative z-10">
            <Frog ref={frogRef} mouthOpen={!!grab} mouthOffset={{ y: -4 }} />
          </div>
          <div className="relative z-0 w-full -mt-2.5">
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
                  onClick={() => handleToggle(task.id, true)}
                />
              )
            }
          />
        </div>
      </div>

      {/* SVG overlay; we update the path `d` every frame in RAF to stay locked to scroll */}
      {grab && (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-40 w-screen h-screen pointer-events-none" // <-- was zIndex: 9999 inline
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
