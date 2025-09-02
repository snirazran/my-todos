'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { signIn, useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Calendar,
  History as HistoryIcon,
  TrendingUp,
  CheckCircle2,
  Shirt,
} from 'lucide-react';

import Frog, { FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import StatCard from '@/components/ui/StatCard';
import ProgressBadge from '@/components/ui/ProgressBadge';
import HistoryTaskList, { HistoryTask } from '@/components/ui/HistoryTaskList';
import { byId } from '@/lib/skins/catalog';
import useSWR from 'swr';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';

/* === import SAME tunables you used on Home === */
const TONGUE_MS = 1111;
const OFFSET_MS = 160;
const PRE_PAN_MS = 600;
const PRE_LINGER_MS = 180;
const CAM_START_DELAY = 140;
const ORIGIN_Y_ADJ = -5;
const TONGUE_STROKE = 8;
const FOLLOW_EASE = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const HIT_AT = 0.5;
const FLY_PX = 24;

interface DayRecord {
  date: string; // 'YYYY-MM-DD'
  tasks: HistoryTask[];
}

export default function History() {
  const { data: session } = useSession();
  const [openWardrobe, setOpenWardrobe] = useState(false);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- frog animation shared state ---- */
  const cooldownUntil = useRef(0);
  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [visuallyDone, setVisuallyDone] = useState<Set<string>>(new Set());
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  const [cinematic, setCinematic] = useState(false);
  const tonguePathEl = useRef<SVGPathElement | null>(null);
  const geomRef = useRef<{
    total: number;
    getPointAtLength: (s: number) => DOMPoint;
    hidImpact: boolean;
    raf: number;
  } | null>(null);

  const [grab, setGrab] = useState<{
    date: string;
    taskId: string;
    completed: boolean;
    originDoc: { x: number; y: number };
    targetDoc: { x: number; y: number };
    returnToY: number;
    startAt: number;
    camStartAt: number;
    follow: boolean;
    frogFocusY: number;
    flyFocusY: number;
  } | null>(null);

  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [tipVisible, setTipVisible] = useState(false);

  /* ---- data load ---- */
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

  const totalDays = history.length;
  const totalTasks = history.reduce((a, d) => a + d.tasks.length, 0);
  const completedTasks = history.reduce(
    (a, d) => a + d.tasks.filter((t) => t.completed).length,
    0
  );
  const overallCompletionRate =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  /* ---- viewport tracking (same as Home) ---- */
  useEffect(() => {
    const set = () => {
      const vv = window.visualViewport;
      if (vv) {
        setVp({ w: Math.round(vv.width), h: Math.round(vv.height) });
      } else {
        setVp({ w: window.innerWidth, h: window.innerHeight });
      }
    };
    set();
    window.addEventListener('resize', set);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', set);
      window.visualViewport.addEventListener('scroll', set);
    }
    return () => {
      window.removeEventListener('resize', set);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', set);
        window.visualViewport.removeEventListener('scroll', set);
      }
    };
  }, []);

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

  const { data: wardrobeData } = useSWR(
    session ? '/api/skins/inventory' : null,
    (u) => fetch(u).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  const indices = useMemo(() => {
    const eq = wardrobeData?.wardrobe?.equipped ?? {};
    return {
      skin: eq?.skin ? byId[eq.skin].riveIndex : 0,
      hat: eq?.hat ? byId[eq.hat].riveIndex : 0,
      scarf: eq?.scarf ? byId[eq.scarf].riveIndex : 0,
      hand_item: eq?.hand_item ? byId[eq.hand_item].riveIndex : 0,
    };
  }, [wardrobeData]);
  /* ---- helpers (same as Home) ---- */
  const getMouthDoc = useCallback(() => {
    const p = frogRef.current?.getMouthPoint() ?? { x: 0, y: 0 };
    const vv = window.visualViewport;
    const offX = window.scrollX + Math.max(0, vv?.offsetLeft ?? 0);
    const offY = window.scrollY + Math.max(0, vv?.offsetTop ?? 0);
    return { x: p.x + offX, y: p.y + offY + ORIGIN_Y_ADJ };
  }, []);

  const getFlyDoc = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const offX = window.scrollX + Math.max(0, vv?.offsetLeft ?? 0);
    const offY = window.scrollY + Math.max(0, vv?.offsetTop ?? 0);
    return { x: r.left + r.width / 2 + offX, y: r.top + r.height / 2 + offY };
  }, []);

  const visibleRatio = (r: DOMRect) => {
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const xOverlap = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const yOverlap = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const visArea = xOverlap * yOverlap;
    const totalArea = Math.max(1, r.width * r.height);
    return visArea / totalArea;
  };

  const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
  const animateScrollTo = (targetY: number, duration: number) =>
    new Promise<void>((resolve) => {
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

  /* ---- persist toggle for a specific date ---- */
  const persistTask = async (
    date: string,
    taskId: string,
    completed: boolean
  ) => {
    // optimistic local change
    setHistory((prev) =>
      prev.map((day) =>
        day.date !== date
          ? day
          : {
              ...day,
              tasks: day.tasks.map((t) =>
                t.id === taskId ? { ...t, completed } : t
              ),
            }
      )
    );
    // server
    if (session) {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, taskId, completed }),
      });
    }
  };

  /* ---- main toggle (copies Home logic; adds date + composite key) ---- */
  const handleToggle = async (
    date: string,
    taskId: string,
    explicit?: boolean
  ) => {
    if (cinematic || grab || performance.now() < cooldownUntil.current) return;
    const day = history.find((d) => d.date === date);
    if (!day) return;
    const task = day.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const completed = explicit !== undefined ? explicit : !task.completed;
    if (!completed) {
      // un-complete = no animation
      persistTask(date, taskId, false);
      return;
    }

    const key = `${date}::${taskId}`;
    const flyEl = flyRefs.current[key];
    if (!flyEl) {
      persistTask(date, taskId, true);
      return;
    }

    const startY = window.scrollY;
    const originDoc0 = getMouthDoc();
    const targetDoc0 = getFlyDoc(flyEl);

    let frogFocusY = Math.max(0, originDoc0.y - window.innerHeight * 0.35);
    let flyFocusY = Math.max(0, targetDoc0.y - window.innerHeight * 0.45);

    const flyR = flyEl.getBoundingClientRect();
    const frogR = frogBoxRef.current?.getBoundingClientRect();
    const frogRatio = frogR ? visibleRatio(frogR) : 0;
    const flyVisible =
      flyR.top < window.innerHeight &&
      flyR.bottom > 0 &&
      flyR.left < window.innerWidth &&
      flyR.right > 0;

    const needCine = frogRatio < 0.75 || !flyVisible;
    setCinematic(true);

    if (needCine) {
      await animateScrollTo(frogFocusY, PRE_PAN_MS);
      await new Promise((r) => setTimeout(r, PRE_LINGER_MS));
    }

    const originDoc = getMouthDoc();
    const targetDoc = getFlyDoc(flyEl);
    frogFocusY = Math.max(0, originDoc.y - window.innerHeight * 0.35);
    flyFocusY = Math.max(0, targetDoc.y - window.innerHeight * 0.45);

    const startAt = performance.now() + OFFSET_MS;
    const camStartAt = startAt + CAM_START_DELAY;

    flyEl.style.visibility = 'visible';
    setTipVisible(false);

    setGrab({
      date,
      taskId,
      completed,
      originDoc,
      targetDoc,
      returnToY: startY,
      startAt,
      camStartAt,
      follow: needCine,
      frogFocusY,
      flyFocusY,
    });
  };

  /* ---- RAF: identical to Home, except: use grab.date in keys and persistTask(grab.date, ...) ---- */
  useEffect(() => {
    if (!grab) return;

    let p0Doc = getMouthDoc();
    const p2 = grab.targetDoc;

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

    const settleUntil = grab.startAt + 140;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const tRaw = (now - grab.startAt) / TONGUE_MS;
      const t = Math.max(0, Math.min(1, tRaw));
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

      const forward =
        t <= HIT_AT ? t / HIT_AT : 1 - (t - HIT_AT) / (1 - HIT_AT);

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

      const sLen = geomRef.current!.total * forward;
      const pt = geomRef.current!.getPointAtLength(sLen);
      const ahead = geomRef.current!.getPointAtLength(
        Math.min(geomRef.current!.total, sLen + 1)
      );
      const dx = ahead.x - pt.x,
        dy = ahead.y - pt.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (dx / len) * (TONGUE_STROKE / 2);
      const oy = (dy / len) * (TONGUE_STROKE / 2);
      setTip({ x: pt.x + ox - offX, y: pt.y + oy - offY });

      if (!geomRef.current!.hidImpact && t >= HIT_AT) {
        geomRef.current!.hidImpact = true;
        setVisuallyDone((prev) =>
          new Set(prev).add(`${grab.date}::${grab.taskId}`)
        );
        setTipVisible(true);
      }

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
        setTip(null);
        setTipVisible(false);
        persistTask(grab.date, grab.taskId, grab.completed);
        setVisuallyDone((prev) => {
          const s = new Set(prev);
          s.delete(`${grab.date}::${grab.taskId}`);
          return s;
        });
        cooldownUntil.current = performance.now() + 220;
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
  }, [grab, getMouthDoc, getFlyDoc]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-purple-500 rounded-full animate-spin border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
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
            <HistoryIcon className="w-5 h-5" />
            חזרה להיום
          </Link>
        </div>

        {/* Frog + KPIs */}
        <div className="flex flex-col items-center w-full">
          <div ref={frogBoxRef} className="relative z-10">
            <Frog
              ref={frogRef}
              mouthOpen={!!grab}
              mouthOffset={{ y: -4 }}
              indices={indices}
            />
            <button
              onClick={() => setOpenWardrobe(true)}
              className="absolute p-2 rounded-full shadow -right-2 top-2 bg-white/80 dark:bg-slate-800 hover:shadow-md"
              title="Wardrobe"
            >
              <Shirt className="w-5 h-5" />
            </button>
          </div>
          <WardrobePanel open={openWardrobe} onOpenChange={setOpenWardrobe} />
        </div>

        <div className="grid grid-cols-1 gap-4 mb-8 -mt-2.5 md:grid-cols-3">
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

        {/* History list */}
        <div className="space-y-4">
          {history.map((day, i) => {
            const completedCount = day.tasks.filter((t) => t.completed).length;
            const pct = day.tasks.length
              ? Math.round((completedCount / day.tasks.length) * 100)
              : 0;
            return (
              <div
                key={day.date}
                className="p-6 transition-shadow duration-200 bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg"
                style={{
                  animation: `fadeInUp 0.5s ease-out ${i * 0.05}s`,
                  animationFillMode: 'both',
                }}
              >
                <div className="flex flex-col items-start justify-between gap-4 mb-4 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      {format(new Date(day.date), 'EEEE, d בMMMM', {
                        locale: he,
                      })}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {completedCount} / {day.tasks.length} משימות הושלמו
                    </p>
                  </div>
                  {day.tasks.length > 0 && <ProgressBadge pct={pct} />}
                </div>

                <HistoryTaskList
                  date={day.date}
                  tasks={day.tasks}
                  toggle={handleToggle}
                  visuallyCompleted={visuallyDone}
                  renderBullet={(key: string, task: HistoryTask) => (
                    <Fly
                      ref={(el) => {
                        flyRefs.current[key] = el;
                      }}
                      onClick={(e) => {
                        e.stopPropagation(); // don't trigger row click
                        handleToggle(day.date, task.id, true); // fire the tongue
                      }}
                      size={30}
                      y={-6}
                      x={-4}
                    />
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* SVG overlay – identical to Home; we only changed state/keys */}
      {grab && (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-40 pointer-events-none"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
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
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 0] }}
            transition={{
              delay: OFFSET_MS / 1000,
              duration: TONGUE_MS / 1000,
              times: [0, HIT_AT, 1],
              ease: 'linear',
            }}
          />

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
