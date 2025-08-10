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
gsap.registerPlugin(ScrollToPlugin);

/* === Tunables ============================================================ */
const TONGUE_MS = 1111; // legacy baseline (we switch to distance-based anyway)
const OFFSET_MS = 160; // anticipation delay before tongue starts
const PRE_PAN_MS = 600; // camera pre-pan up to frog
const PRE_LINGER_MS = 180; // small pause on frog before firing
const CAM_START_DELAY = 140; // start following down after tongue begins
const TONGUE_STROKE = 8; // base stroke width
const HIT_AT = 0.5; // impact ratio into the total shot
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

  // GSAP-driven sequence state
  const [grab, setGrab] = useState<{
    taskId: string;
    completed: boolean;
    returnToY: number;
    startAt: number;
    follow: boolean;
    frogFocusY: number;
    flyFocusY: number;
  } | null>(null);

  // tip glued fly (viewport)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [tipVisible, setTipVisible] = useState(false);

  // SVG refs
  const tonguePathEl = useRef<SVGPathElement | null>(null);
  const bodyBackRef = useRef<SVGPathElement | null>(null);
  const tongueHeadRef = useRef<SVGGElement | null>(null);

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

  /* -------- helpers -------- */
  const visibleRatio = (r: DOMRect) => {
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const xOverlap = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const yOverlap = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const visArea = xOverlap * yOverlap;
    const totalArea = Math.max(1, r.width * r.height);
    return visArea / totalArea; // 0..1
  };

  /* -------- toggle (GSAP owns all scrolling now) -------- */
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

    // decide if we need the camera move
    const flyR = flyEl.getBoundingClientRect();
    const frogR = frogBoxRef.current?.getBoundingClientRect();

    const frogVisible = frogR ? visibleRatio(frogR) : 0;
    const flyVisible =
      flyR.top < window.innerHeight &&
      flyR.bottom > 0 &&
      flyR.left < window.innerWidth &&
      flyR.right > 0;

    // require 75% of frog to be visible; tune to 0.5 if you prefer
    const needCine = frogVisible < 0.75 || !flyVisible;

    // GSAP scroll targets (DOC Y)
    const frogFocusY = (() => {
      if (!frogR)
        return Math.max(0, window.scrollY - window.innerHeight * 0.35);
      const docTop = frogR.top + window.scrollY;
      return Math.max(0, docTop - window.innerHeight * 0.35);
    })();

    const flyFocusY = (() => {
      const docTop = flyR.top + window.scrollY;
      return Math.max(0, docTop - window.innerHeight * 0.45);
    })();

    // start sequence
    setCinematic(true);
    setTipVisible(false);

    setGrab({
      taskId,
      completed,
      returnToY: window.scrollY,
      startAt: performance.now(),
      follow: needCine,
      frogFocusY,
      flyFocusY,
    });
  };

  /* -------- GSAP timeline: viewport-only, manual dash, juicy touches -------- */
  useEffect(() => {
    if (!grab) return;

    // ===== helpers in viewport space =====
    const getMouthV = () =>
      frogRef.current?.getMouthPoint() ?? { x: -9999, y: -9999 };

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
      return lastFlyV ?? getMouthV();
    };

    const pathEl = tonguePathEl.current!;
    const backEl = bodyBackRef.current!;
    const headEl = tongueHeadRef.current!;

    // small "settle" to smooth the first frames (mouth micro-shift)
    const settleMs = 140;
    const startTs = performance.now();

    let totalLen = 0;

    const updateGeometry = (draw01: number) => {
      // 1) endpoints in viewport
      let p0 = getMouthV();
      const p2 = getFlyV();

      // 1a) early smoothing
      const now = performance.now();
      if (now - startTs < settleMs) {
        const fresh = getMouthV();
        p0 = {
          x: p0.x + (fresh.x - p0.x) * 0.35,
          y: p0.y + (fresh.y - p0.y) * 0.35,
        };
      }

      // 2) quadratic curve
      const p1 = { x: (p0.x + p2.x) / 2, y: p0.y - 120 };
      const d = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;

      // set both paths (glow + body)
      pathEl.setAttribute('d', d);
      backEl.setAttribute('d', d);

      // 3) manual dash
      totalLen = pathEl.getTotalLength();
      const drawn = totalLen * draw01;

      const setDash = (el: SVGPathElement) => {
        el.style.strokeDasharray = `${totalLen}`;
        el.style.strokeDashoffset = `${totalLen - drawn}`;
      };
      setDash(pathEl);
      setDash(backEl);

      // 4) head position (rounded cap alignment)
      if (drawn > 0 && drawn <= totalLen) {
        const s = drawn;
        const pt = pathEl.getPointAtLength(s);
        const ahead = pathEl.getPointAtLength(Math.min(totalLen, s + 1));
        const dx = ahead.x - pt.x,
          dy = ahead.y - pt.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (dx / len) * (TONGUE_STROKE / 2);
        const oy = (dy / len) * (TONGUE_STROKE / 2);

        // place head (GSAP set avoids React layout)
        gsap.set(headEl, { x: pt.x + ox, y: pt.y + oy });

        // keep React tip state for your fly icon (appears only after impact)
        setTip({ x: pt.x + ox, y: pt.y + oy });
      }
    };

    // seed once so we can measure length
    updateGeometry(0.0001);

    // distance-based durations
    const map = (v: number, a: number, b: number, c: number, d: number) =>
      c + ((v - a) * (d - c)) / (b - a);
    const extendDur = gsap.utils.clamp(
      0.22,
      0.7,
      map(totalLen, 220, 1100, 0.28, 0.7)
    );
    const retractDur = gsap.utils.clamp(
      0.18,
      0.6,
      map(totalLen, 220, 1100, 0.24, 0.6)
    );

    // ===== timeline =====
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      onStart: () => {
        setCinematic(true);
        setTipVisible(false);
        // reset dashes (in case of prior shot)
        pathEl.style.strokeDasharray = '0';
        backEl.style.strokeDasharray = '0';
        // ensure head is visible for the shot
        gsap.set(headEl, { opacity: 1, scaleX: 1, scaleY: 1 });
      },
      onComplete: () => {
        // cleanup
        setTip(null);
        setTipVisible(false);
        pathEl.style.strokeDasharray = '0';
        backEl.style.strokeDasharray = '0';
        pathEl.setAttribute('d', 'M0 0 L0 0');
        backEl.setAttribute('d', 'M0 0 L0 0');

        persistTask(grab.taskId, grab.completed);
        setVisuallyDone((prev) => {
          const s = new Set(prev);
          s.delete(grab.taskId);
          return s;
        });

        cooldownUntil.current = performance.now() + 220;
        setTimeout(() => {
          setCinematic(false);
          setGrab(null);
        }, 140);
      },
    });

    // pre-pan to frog if needed
    if (grab.follow) {
      tl.to(window, {
        scrollTo: grab.frogFocusY,
        duration: PRE_PAN_MS / 1000,
        ease: 'power2.out',
      });
      tl.to({}, { duration: PRE_LINGER_MS / 1000 });
    }

    // anticipation delay
    if (OFFSET_MS > 0) {
      tl.to({}, { duration: OFFSET_MS / 1000 });
    }

    // subtle thickness modulation during extend+retract (in parallel)
    tl.add(() => {
      gsap.fromTo(
        pathEl,
        { attr: { 'stroke-width': TONGUE_STROKE } as any },
        {
          attr: { 'stroke-width': TONGUE_STROKE * 1.06 } as any,
          duration: extendDur,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: 1,
        }
      );
      gsap.fromTo(
        backEl,
        { attr: { 'stroke-width': TONGUE_STROKE + 6 } as any },
        {
          attr: { 'stroke-width': (TONGUE_STROKE + 6) * 1.06 } as any,
          duration: extendDur,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: 1,
        }
      );
    }, '<');

    // EXTEND 0 -> 1
    const state = { t: 0 };
    tl.to(state, {
      t: 1,
      duration: extendDur,
      ease: 'power3.out',
      onUpdate: () => updateGeometry(state.t),
      onComplete: () => {
        // impact
        impacted = true;
        setVisuallyDone((prev) => new Set(prev).add(grab.taskId));
        setTipVisible(true);

        // squash the tongue head a touch
        gsap.fromTo(
          headEl,
          { scaleX: 1, scaleY: 1 },
          {
            scaleX: 1.15,
            scaleY: 0.75,
            duration: 0.08,
            yoyo: true,
            repeat: 1,
            ease: 'power2.out',
          }
        );

        // micro camera bump
        if (grab.follow) {
          gsap.to(window, {
            scrollTo: window.scrollY + 6,
            duration: 0.05,
            yoyo: true,
            repeat: 1,
            ease: 'sine.inOut',
          });
        }

        // follow-down toward fly (only until impact)
        if (grab.follow) {
          const flyDur = Math.max(0, extendDur - CAM_START_DELAY / 1000);
          gsap.to(window, {
            scrollTo: grab.flyFocusY,
            duration: flyDur,
            ease: 'power3.inOut',
            overwrite: 'auto',
          });
        }

        // tiny droplets burst (cute polish)
        const burst = () => {
          const svg = pathEl.ownerSVGElement!;
          const svgRect = svg.getBoundingClientRect();
          const headRect = headEl.getBoundingClientRect();
          const hx = headRect.left - svgRect.left;
          const hy = headRect.top - svgRect.top;

          for (let i = 0; i < 4; i++) {
            const c = document.createElementNS(
              'http://www.w3.org/2000/svg',
              'circle'
            );
            c.setAttribute('r', '2.5');
            c.setAttribute('fill', '#fda4af');
            svg.appendChild(c);
            gsap.set(c, {
              x: hx,
              y: hy,
              opacity: 0.9,
              transformOrigin: '50% 50%',
            });
            gsap.to(c, {
              x: hx + gsap.utils.random(-24, 24, 1),
              y: hy + gsap.utils.random(-14, 6, 1),
              opacity: 0,
              scale: gsap.utils.random(0.7, 1.2),
              duration: 0.35,
              ease: 'power2.out',
              onComplete: () => c.remove(),
            });
          }
        };
        burst();
      },
    });

    // RETRACT 1 -> 0
    tl.to(state, {
      t: 0,
      duration: retractDur,
      ease: 'expo.in',
      onUpdate: () => updateGeometry(state.t),
      onComplete: () => {
        // hide head at the very end
        gsap.set(headEl, { opacity: 0 });
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

      {/* SVG overlay — z-40 keeps it under your header (z-50) */}
      {grab && (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-40 w-screen h-screen pointer-events-none"
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

            {/* gooey merge for body+head */}
            <filter id="tongue-goo" colorInterpolationFilters="sRGB">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="1.2"
                result="b"
              />
              <feColorMatrix
                in="b"
                mode="matrix"
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 18 -8"
                result="goo"
              />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>

            {/* highlight for head */}
            <radialGradient id="tongue-head-grad" cx="50%" cy="35%" r="75%">
              <stop offset="0" stopColor="#ffe1e1" />
              <stop offset="1" stopColor="#f43f5e" />
            </radialGradient>
          </defs>

          <g filter="url(#tongue-goo)">
            {/* faint glow/back body */}
            <path
              ref={bodyBackRef}
              d="M0 0 L0 0"
              fill="none"
              stroke="#f43f5e"
              opacity="0.2"
              strokeWidth={TONGUE_STROKE + 6}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {/* main body */}
            <path
              ref={tonguePathEl}
              d="M0 0 L0 0"
              fill="none"
              stroke="url(#tongue-grad)"
              strokeWidth={TONGUE_STROKE}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>

          {/* tongue head (rides the tip every frame) */}
          <g ref={tongueHeadRef}>
            <circle r={TONGUE_STROKE * 0.65} fill="url(#tongue-head-grad)" />
          </g>

          {/* Fly glued to tip AFTER impact */}
          {tipVisible && tip && (
            <g transform={`translate(${tip.x}, ${tip.y})`}>
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
