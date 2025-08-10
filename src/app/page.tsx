'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Calendar, History, CheckCircle2 } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';

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
    // block during animation or brief cooldown
    if (cinematic || grab || performance.now() < cooldownUntil.current) return;

    const task = data.find((t) => t.id === taskId);
    if (!task) return;

    const completed =
      explicitCompleted !== undefined ? explicitCompleted : !task.completed;

    // un-complete: normal update
    if (!completed) {
      persistTask(taskId, false);
      return;
    }

    const flyEl = flyRefs.current[taskId];
    if (!flyEl) {
      // no visual fly? just complete
      persistTask(taskId, true);
      return;
    }

    // ---------- decide if we need the camera move ----------
    const flyR = flyEl.getBoundingClientRect();
    const frogR = frogBoxRef.current?.getBoundingClientRect();

    const frogVisible = frogR ? visibleRatio(frogR) : 0;
    const flyVisible =
      flyR.top < window.innerHeight &&
      flyR.bottom > 0 &&
      flyR.left < window.innerWidth &&
      flyR.right > 0;

    // tune threshold as you like: 0.5 (50%) or 0.75 (you used 0.75 earlier)
    const needCine = frogVisible < 0.75 || !flyVisible;

    // ---------- compute GSAP scroll targets (DOC Y) ----------
    // Focus near the frog mouth: center the frog box around ~35% from top
    const frogFocusY = (() => {
      if (!frogR)
        return Math.max(0, window.scrollY - window.innerHeight * 0.35);
      const docTop = frogR.top + window.scrollY;
      return Math.max(0, docTop - window.innerHeight * 0.35);
    })();

    // Focus near the fly: center it around ~45% from top
    const flyFocusY = (() => {
      const docTop = flyR.top + window.scrollY;
      return Math.max(0, docTop - window.innerHeight * 0.45);
    })();

    // ---------- kick off the GSAP timeline via grab ----------
    // (Most fields below aren’t used anymore by the GSAP effect,
    // but we fill them to keep your existing type happy)
    setCinematic(true);
    setTipVisible(false);

    setGrab({
      taskId,
      completed,
      // legacy fields (not used by the GSAP effect now)
      originDoc: { x: 0, y: 0 },
      targetDoc: { x: 0, y: 0 },
      returnToY: window.scrollY,
      startAt: performance.now(), // still useful as a key if you keep it
      camStartAt: 0,
      // GSAP fields we actually use
      follow: needCine,
      frogFocusY,
      flyFocusY,
    });
  };

  /* -------- unified RAF: tongue, camera follow (down only), tip glue, impact -------- */
  useEffect(() => {
    if (!grab) return;

    // ------- helpers (viewport space) -------
    const getMouthV = () => {
      // viewport coordinates straight from Rive wrapper
      const p = frogRef.current?.getMouthPoint();
      return p ?? { x: -9999, y: -9999 };
    };

    let lastFlyV: { x: number; y: number } | null = null;
    let impacted = false;
    const getFlyV = () => {
      if (!impacted) {
        const el = flyRefs.current[grab.taskId];
        if (el) {
          const r = el.getBoundingClientRect();
          lastFlyV = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      return lastFlyV ?? getMouthV(); // fallback
    };

    const pathEl = tonguePathEl.current!;
    const tipShowAt = HIT_AT; // 0..1

    // dash vars
    let totalLen = 0;

    // small "settle" to smooth the first frames (Rive mouth moves a bit)
    const settleMs = 140;
    const startTs = performance.now();

    const updateGeometry = (draw01: number) => {
      // 1) Read endpoints in **viewport** every frame
      let p0 = getMouthV();
      const p2 = getFlyV();

      // 1a) light smoothing for the first ~140ms
      const now = performance.now();
      if (now - startTs < settleMs) {
        const fresh = getMouthV();
        p0 = {
          x: p0.x + (fresh.x - p0.x) * 0.35,
          y: p0.y + (fresh.y - p0.y) * 0.35,
        };
      }

      // 2) Build quadratic in viewport space
      const p1 = { x: (p0.x + p2.x) / 2, y: p0.y - 120 };
      const d = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
      pathEl.setAttribute('d', d);

      // 3) Manual dash (draw from start)
      totalLen = pathEl.getTotalLength();
      const drawn = totalLen * draw01; // how much is visible
      pathEl.style.strokeDasharray = `${totalLen}`;
      pathEl.style.strokeDashoffset = `${totalLen - drawn}`;

      // 4) Tip (rounded end-cap alignment)
      if (drawn > 0 && drawn <= totalLen) {
        const s = drawn;
        const pt = pathEl.getPointAtLength(s);
        const ahead = pathEl.getPointAtLength(Math.min(totalLen, s + 1));
        const dx = ahead.x - pt.x,
          dy = ahead.y - pt.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (dx / len) * (TONGUE_STROKE / 2);
        const oy = (dy / len) * (TONGUE_STROKE / 2);
        setTip({ x: pt.x + ox, y: pt.y + oy });
      }
    };

    // ------- GSAP timeline -------
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      onStart: () => {
        setCinematic(true);
        setTipVisible(false);
      },
      onUpdate: () => {
        // nothing: updates are handled by tweens' onUpdate below
      },
      onComplete: () => {
        // cleanup at end of retract
        setTip(null);
        setTipVisible(false);
        persistTask(grab.taskId, grab.completed);
        setVisuallyDone((prev) => {
          const s = new Set(prev);
          s.delete(grab.taskId);
          return s;
        });
        // short cooldown
        cooldownUntil.current = performance.now() + 220;
        setTimeout(() => {
          setCinematic(false);
          setGrab(null);
        }, 140);
      },
    });

    // Optionally pre-pan to frog if needed (you can keep your own needCine logic)
    if (grab.follow) {
      tl.to(window, {
        scrollTo: grab.frogFocusY,
        duration: PRE_PAN_MS / 1000,
        ease: 'power2.out',
      });
      tl.to({}, { duration: PRE_LINGER_MS / 1000 }); // small pause
    }

    // Anticipation delay before tongue
    if (OFFSET_MS > 0) {
      tl.to({}, { duration: OFFSET_MS / 1000 });
    }

    // The state we tween: t goes 0→1 during "extend", then 1→0 on "retract"
    const state = { t: 0 };

    // EXTEND: 0 -> 1
    tl.to(state, {
      t: 1,
      duration: (TONGUE_MS * HIT_AT) / 1000,
      ease: 'linear',
      onUpdate: () => {
        const draw01 = state.t; // 0..1 during extend
        updateGeometry(draw01);
        // still before impact, keep sampling fly each frame
      },
      onComplete: () => {
        // Impact!
        impacted = true; // stop sampling fly rect
        setVisuallyDone((prev) => new Set(prev).add(grab.taskId));
        setTipVisible(true);

        // If we want camera follow down (only until impact)
        if (grab.follow) {
          // Start follow-down after a small delay from tongue start
          const flyDur =
            Math.max(0, TONGUE_MS * HIT_AT - CAM_START_DELAY) / 1000;
          gsap.to(window, {
            scrollTo: grab.flyFocusY,
            duration: flyDur,
            ease: 'power3.inOut',
            overwrite: 'auto',
          });
        }
      },
    });

    // RETRACT: 1 -> 0
    tl.to(state, {
      t: 0,
      duration: (TONGUE_MS * (1 - HIT_AT)) / 1000,
      ease: 'linear',
      onUpdate: () => {
        // during retract, draw length shrinks from 1 -> 0
        const draw01 = state.t; // 1..0 but our math expects 0..1 amount
        updateGeometry(draw01);
      },
    });

    return () => {
      tl.kill();
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

          <path
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
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
