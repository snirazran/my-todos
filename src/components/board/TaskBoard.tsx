'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Task, DAYS, draggableIdFor, todayIndex } from './helpers';
import DayColumn from './DayColumn';
import TaskCard from './TaskCard';

/* ---------------- Inline Composer ---------------- */
function InlineComposer({
  value,
  onChange,
  onConfirm,
  onCancel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  };
  React.useEffect(grow, [value]);

  return (
    <div className="px-3 py-3 bg-slate-50 dark:bg-slate-700 rounded-xl">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="שם משימה…"
        rows={1}
        className="w-full resize-none overflow-hidden leading-6 min-h-[40px] px-3 py-2 bg-white border rounded-md dark:bg-slate-800 border-slate-200 dark:border-slate-600"
        onInput={grow}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus={autoFocus}
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-white rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
          disabled={!value.trim()}
        >
          הוסף
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-md bg-slate-200 dark:bg-slate-600"
          title="ביטול"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

function GapRail({
  onAdd,
  overlayHidden = false,
}: {
  onAdd: () => void;
  overlayHidden?: boolean;
}) {
  return (
    // This element provides the actual gap height
    <div className="relative h-2 select-none md:h-2">
      {/* Hover overlay (desktop only) */}
      {!overlayHidden && (
        <div className="absolute inset-0 z-10 items-center justify-center hidden transition-opacity opacity-0 pointer-events-none md:flex hover:opacity-100">
          <div className="flex-1">
            <div className="w-full h-px text-violet-400">
              <div
                className="w-full h-[2px]"
                style={{
                  // tune these two:
                  ['--dash' as any]: '6px', // dash length  ⟵ make this bigger for wider dashes
                  ['--gap' as any]: '6px', // gap length
                  backgroundImage:
                    'repeating-linear-gradient(to right, currentColor 0 var(--dash), transparent var(--dash) calc(var(--dash) + var(--gap)))',
                }}
              />
            </div>
          </div>

          <button
            type="button"
            title="הוסף משימה כאן"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="pointer-events-auto mx-1 h-6 w-6 rounded bg-white dark:bg-slate-800
                       text-violet-700 dark:text-violet-300 ring-1 ring-violet-200/70
                       dark:ring-violet-900/40 shadow-sm grid place-items-center
                       hover:scale-[1.04] transition-transform"
          >
            +
          </button>

          <div className="flex-1">
            <div className="w-full h-px text-violet-400">
              <div
                className="w-full h-[2px]"
                style={{
                  // tune these two:
                  ['--dash' as any]: '6px', // dash length  ⟵ make this bigger for wider dashes
                  ['--gap' as any]: '6px', // gap length
                  backgroundImage:
                    'repeating-linear-gradient(to right, currentColor 0 var(--dash), transparent var(--dash) calc(var(--dash) + var(--gap)))',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Drag state ---------------- */
type DragState = {
  active: boolean;
  fromDay: number;
  fromIndex: number;
  taskId: string;
  taskText: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
};

export default function TaskBoard({
  titles,
  week,
  setWeek,
  saveDay,
  removeTask,
  onRequestAdd,
}: {
  titles: string[];
  week: Task[][];
  setWeek: React.Dispatch<React.SetStateAction<Task[][]>>;
  saveDay: (day: number, tasks: Task[]) => Promise<void>;
  removeTask: (day: number, id: string) => Promise<void>;
  onRequestAdd: (day: number, text?: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [pageIndex, setPageIndex] = useState(todayIndex());

  const [drag, setDrag] = useState<DragState | null>(null);
  const [targetDay, setTargetDay] = useState<number | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);

  const [snapSuppressed, setSnapSuppressed] = useState(false);
  const [panActive, setPanActive] = useState(false);
  const canPanRef = useRef(false);
  const panActiveRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartScrollLeftRef = useRef(0);

  // long-press on touch
  const longPressTimer = useRef<number | null>(null);
  const pressStartXY = useRef<{ x: number; y: number } | null>(null);
  const LONG_MS = 230;
  const MOVE_TOL = 8;

  // inline composer
  const [composer, setComposer] = useState<{
    day: number;
    afterIndex: number | null;
  } | null>(null);
  const [draft, setDraft] = useState('');

  // for edge autoscroll
  const pointerXRef = useRef(0);
  const pointerYRef = useRef(0);
  const pxPrevRef = useRef(0);
  const pxVelRef = useRef(0);
  const pxVelSmoothedRef = useRef(0);

  const slides = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, day) => ({ day, key: `day-${day}` })),
    []
  );

  const setSlideRef =
    (day: number) =>
    (el: HTMLDivElement | null): void => {
      slideRefs.current[day] = el;
    };
  const setListRef =
    (day: number) =>
    (el: HTMLDivElement | null): void => {
      listRefs.current[day] = el;
    };
  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) cardRefs.current.delete(id);
    else cardRefs.current.set(id, el);
  }, []);

  const recomputeCanPan = useCallback(() => {
    const s = scrollerRef.current;
    if (!s) return;
    canPanRef.current = s.scrollWidth - s.clientWidth > 2;
  }, []);

  useEffect(() => {
    const s = scrollerRef.current;
    const t = todayIndex();
    const el = slideRefs.current[t];
    if (!s || !el) return;
    s.scrollTo({
      left: el.offsetLeft - (s.clientWidth - el.clientWidth) / 2,
      // @ts-ignore
      behavior: 'instant',
    });
    setPageIndex(t);
    recomputeCanPan();
  }, [recomputeCanPan]);

  useEffect(() => {
    const ro = new ResizeObserver(() => recomputeCanPan());
    if (scrollerRef.current) ro.observe(scrollerRef.current);
    const onResize = () => recomputeCanPan();
    window.addEventListener('resize', onResize);
    requestAnimationFrame(recomputeCanPan);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [week, titles, recomputeCanPan]);

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const handler = () => {
      const idx = slideRefs.current.findIndex((col) => {
        if (!col) return false;
        const colCenter = col.offsetLeft + col.clientWidth / 2;
        const scrollCenter = s.scrollLeft + s.clientWidth / 2;
        return Math.abs(colCenter - scrollCenter) < col.clientWidth / 2;
      });
      if (idx >= 0) setPageIndex(idx);
    };
    s.addEventListener('scroll', handler, { passive: true });
    return () => s.removeEventListener('scroll', handler);
  }, []);

  /* ---------------- drag helpers ---------------- */
  const beginDragFromCard = useCallback(
    (
      day: number,
      index: number,
      taskId: string,
      taskText: string,
      clientX: number,
      clientY: number,
      rect: DOMRect
    ) => {
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none';

      pointerXRef.current = clientX;
      pointerYRef.current = clientY;
      pxPrevRef.current = clientX;
      pxVelRef.current = 0;
      pxVelSmoothedRef.current = 0;

      setDrag({
        active: true,
        fromDay: day,
        fromIndex: index,
        taskId,
        taskText,
        x: clientX,
        y: clientY,
        dx: clientX - rect.left,
        dy: clientY - rect.top,
        width: rect.width,
        height: rect.height,
      });
      setTargetDay(day);
      setTargetIndex(index);
      setComposer(null);
      setDraft('');
    },
    []
  );

  const onGrab = useCallback(
    (params: {
      day: number;
      index: number;
      taskId: string;
      taskText: string;
      clientX: number;
      clientY: number;
      rect: DOMRect;
      pointerType: 'mouse' | 'touch';
    }) => {
      const {
        day,
        index,
        taskId,
        taskText,
        clientX,
        clientY,
        rect,
        pointerType,
      } = params;

      if (pointerType === 'mouse') {
        beginDragFromCard(day, index, taskId, taskText, clientX, clientY, rect);
        return;
      }

      // long-press on touch
      pressStartXY.current = { x: clientX, y: clientY };
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
      longPressTimer.current = window.setTimeout(() => {
        beginDragFromCard(
          day,
          index,
          taskId,
          taskText,
          pointerXRef.current,
          pointerYRef.current,
          rect
        );
      }, LONG_MS);
    },
    [beginDragFromCard]
  );

  useEffect(() => {
    const cancelLP = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
    const move = (ev: TouchEvent | PointerEvent | MouseEvent) => {
      // @ts-ignore
      const pt = 'touches' in ev ? ev.touches?.[0] : ev;
      const x = (pt?.clientX ?? 0) as number;
      const y = (pt?.clientY ?? 0) as number;
      pointerXRef.current = x;
      pointerYRef.current = y;
      const s = pressStartXY.current;
      if (s && (Math.abs(x - s.x) > MOVE_TOL || Math.abs(y - s.y) > MOVE_TOL))
        cancelLP();
    };
    window.addEventListener('pointermove', move as any, { passive: true });
    window.addEventListener('touchmove', move as any, { passive: true });
    window.addEventListener('pointerup', cancelLP, { passive: true });
    window.addEventListener('touchend', cancelLP as any, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move as any);
      window.removeEventListener('touchmove', move as any);
      window.removeEventListener('pointerup', cancelLP as any);
      window.removeEventListener('touchend', cancelLP as any);
    };
  }, []);

  const centerColumnSmooth = (day: number) => {
    const s = scrollerRef.current;
    const col = slideRefs.current[day];
    if (!s || !col) return;
    const targetLeft = col.offsetLeft - (s.clientWidth - col.clientWidth) / 2;
    setSnapSuppressed(true);
    s.scrollTo({ left: targetLeft, behavior: 'smooth' });
    window.setTimeout(() => setSnapSuppressed(false), 550);
  };

  const endDrag = useCallback(() => {
    if (!drag) return;
    document.body.style.userSelect = '';
    document.body.style.touchAction = '';

    const toDay = targetDay ?? drag.fromDay;
    const toIndex = targetIndex ?? drag.fromIndex;

    setDrag(null);
    setTargetDay(null);
    setTargetIndex(null);

    centerColumnSmooth(toDay);

    if (drag.fromDay === toDay && drag.fromIndex === toIndex) return;

    setWeek((prev) => {
      const next = prev.map((d) => d.slice());
      const [moved] = next[drag.fromDay].splice(drag.fromIndex, 1);
      next[toDay].splice(Math.min(toIndex, next[toDay].length), 0, moved);
      Promise.all(
        drag.fromDay === toDay
          ? [saveDay(toDay, next[toDay])]
          : [
              saveDay(drag.fromDay, next[drag.fromDay]),
              saveDay(toDay, next[toDay]),
            ]
      ).catch(() => {});
      return next;
    });
  }, [drag, targetDay, targetIndex, saveDay, setWeek]);

  const cancelDrag = useCallback(() => {
    document.body.style.userSelect = '';
    document.body.style.touchAction = '';
    setDrag(null);
    setTargetDay(null);
    setTargetIndex(null);
  }, []);

  useEffect(() => {
    if (!drag) return;

    const handleMove = (ev: PointerEvent | MouseEvent | TouchEvent) => {
      // @ts-ignore
      const pt = 'touches' in ev ? ev.touches?.[0] : ev;
      const x = (pt?.clientX ?? 0) as number;
      const y = (pt?.clientY ?? 0) as number;

      pointerXRef.current = x;
      pointerYRef.current = y;

      const instV = x - pxPrevRef.current;
      pxPrevRef.current = x;
      pxVelRef.current = instV;

      setDrag((d) => (d ? { ...d, x, y } : d));

      // find column
      let newDay: number | null = null;
      for (let day = 0; day < DAYS; day++) {
        const col = slideRefs.current[day];
        if (!col) continue;
        const r = col.getBoundingClientRect();
        if (x >= r.left && x <= r.right) {
          newDay = day;
          break;
        }
      }
      if (newDay == null) {
        let minDist = Infinity,
          best: number | null = null;
        for (let day = 0; day < DAYS; day++) {
          const col = slideRefs.current[day];
          if (!col) continue;
          const r = col.getBoundingClientRect();
          const dist = x < r.left ? r.left - x : x - r.right;
          if (dist < minDist) {
            minDist = dist;
            best = day;
          }
        }
        newDay = best;
      }

      // index using ONLY cards (no separators)
      let newIndex = 0;
      if (newDay != null) {
        const list = listRefs.current[newDay];
        if (list) {
          const cardEls = Array.from(
            list.querySelectorAll<HTMLElement>('[data-card-id]')
          );
          if (cardEls.length === 0) newIndex = 0;
          else {
            let placed = false;
            for (let i = 0; i < cardEls.length; i++) {
              const cr = cardEls[i].getBoundingClientRect();
              const mid = cr.top + cr.height / 2;
              if (y < mid) {
                newIndex = i;
                placed = true;
                break;
              }
            }
            if (!placed) newIndex = cardEls.length;
          }
        }
      }
      setTargetDay(newDay);
      setTargetIndex(newIndex);
    };

    const handleUp = () => endDrag();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDrag();
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('touchmove', handleMove as any, { passive: true });
    window.addEventListener('pointerup', handleUp, { passive: true });
    window.addEventListener('touchend', handleUp as any, { passive: true });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointermove', handleMove as any);
      window.removeEventListener('touchmove', handleMove as any);
      window.removeEventListener('pointerup', handleUp as any);
      window.removeEventListener('touchend', handleUp as any);
      window.removeEventListener('keydown', handleKey);
    };
  }, [drag, endDrag, cancelDrag]);

  /* ---------------- edge auto-scroll (unchanged) ---------------- */
  useEffect(() => {
    if (!drag) return;
    const s = scrollerRef.current;
    if (!s) return;

    let raf = 0;
    const EDGE_X = 96,
      EDGE_Y = 72,
      VP_EDGE_Y = 80,
      HYST = 10;
    const MIN_V = 2,
      MAX_V = 24;
    const clamp = (v: number, a: number, b: number) =>
      Math.max(a, Math.min(b, v));
    const easeCubic = (t: number) => t * t * t;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const tick = () => {
      const px = pointerXRef.current;
      const py = pointerYRef.current;

      // horizontal
      const rect = s.getBoundingClientRect();
      let distFactor = 0,
        dir = 0;
      if (px > rect.right - EDGE_X) {
        const d = px - (rect.right - EDGE_X);
        if (d > HYST) {
          distFactor = clamp((d - HYST) / (EDGE_X - HYST), 0, 1);
          dir = +1;
        }
      } else if (px < rect.left + EDGE_X) {
        const d = rect.left + EDGE_X - px;
        if (d > HYST) {
          distFactor = clamp((d - HYST) / (EDGE_X - HYST), 0, 1);
          dir = -1;
        }
      }
      const inst = pxVelRef.current;
      const velSmoothed = lerp(pxVelSmoothedRef.current, inst, 0.18);
      pxVelSmoothedRef.current = velSmoothed;
      const speedFactor = clamp(Math.abs(velSmoothed) / 20, 0, 1);
      const combined = clamp(
        easeCubic(distFactor) * 0.85 + speedFactor * 0.35,
        0,
        1
      );
      const vx = dir * (MIN_V + (MAX_V - MIN_V) * combined);
      if (dir !== 0) s.scrollLeft += vx;

      // vertical
      const dayForV = targetDay != null ? targetDay : drag.fromDay;
      const list = listRefs.current[dayForV];
      if (list) {
        const lr = list.getBoundingClientRect();
        let distY = 0,
          dirY = 0;
        if (py > lr.bottom - EDGE_Y) {
          const d = py - (lr.bottom - EDGE_Y);
          if (d > HYST) {
            distY = clamp((d - HYST) / (EDGE_Y - HYST), 0, 1);
            dirY = +1;
          }
        } else if (py < lr.top + EDGE_Y) {
          const d = lr.top + EDGE_Y - py;
          if (d > HYST) {
            distY = clamp((d - HYST) / (EDGE_Y - HYST), 0, 1);
            dirY = -1;
          }
        }
        if (dirY === 0) {
          const vpBottom = window.innerHeight,
            vpTop = 0,
            VP = VP_EDGE_Y;
          if (py > vpBottom - VP) {
            const d = py - (vpBottom - VP);
            if (d > HYST) {
              distY = clamp((d - HYST) / (VP - HYST), 0, 1);
              dirY = +1;
            }
          } else if (py < vpTop + VP) {
            const d = vpTop + VP - py;
            if (d > HYST) {
              distY = clamp((d - HYST) / (VP - HYST), 0, 1);
              dirY = -1;
            }
          }
        }
        if (dirY !== 0) {
          const vy = dirY * (MIN_V + (MAX_V - MIN_V) * easeCubic(distY));
          list.scrollTop += vy;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag, targetDay]);

  /* ---------------- desktop drag-to-pan ---------------- */
  const startPanIfEligible = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag?.active) return;
    if (e.pointerType !== 'mouse') return;
    if (!canPanRef.current) return;
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (
      target.closest('[data-card-id]') ||
      target.closest('button, a, input, textarea, [role="button"]')
    )
      return;

    const s = scrollerRef.current;
    if (!s) return;
    e.preventDefault();

    panActiveRef.current = true;
    setPanActive(true);
    panStartXRef.current = e.clientX;
    panStartScrollLeftRef.current = s.scrollLeft;
    s.setPointerCapture?.(e.pointerId);
    document.body.style.userSelect = 'none';
    (s as any).style.scrollSnapType = 'none';
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panActiveRef.current) return;
    const s = scrollerRef.current;
    if (!s) return;
    e.preventDefault();
    s.scrollLeft =
      panStartScrollLeftRef.current - (e.clientX - panStartXRef.current);
  };
  const endPan = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (!panActiveRef.current) return;
    panActiveRef.current = false;
    setPanActive(false);
    const s = scrollerRef.current;
    if (s && e) s.releasePointerCapture?.(e.pointerId);
    (s as any).style.scrollSnapType = '';
    document.body.style.userSelect = '';
  };
  useEffect(() => {
    const up = () => endPan();
    window.addEventListener('pointerup', up, { passive: true });
    return () => window.removeEventListener('pointerup', up);
  }, []);

  /* ---------------- composer helpers ---------------- */
  const openBottomComposer = (day: number) => {
    setComposer({ day, afterIndex: null });
    setDraft('');
  };
  const openBetweenComposer = (day: number, afterIndex: number) => {
    setComposer({ day, afterIndex });
    setDraft('');
  };
  const cancelComposer = () => {
    setComposer(null);
    setDraft('');
  };
  const confirmComposer = (day: number) => {
    const text = draft.trim();
    if (!text) return;
    const txt = text;
    cancelComposer();
    onRequestAdd(day, txt);
  };

  /* ---------------- render list (cards + separators) ---------------- */
  const renderListWithUI = useCallback(
    (day: number) => {
      const items = week[day];

      const placeholderAt =
        drag && targetDay === day && targetIndex != null ? targetIndex : null;

      const rows: React.ReactNode[] = [];

      /* ── TOP rail (before first card) ───────────────────────────── */
      if (items.length > 0) {
        const topOpen =
          !!composer && composer.day === day && composer.afterIndex === -1;

        rows.push(
          <GapRail
            key={`rail-top-${day}`}
            overlayHidden={topOpen}
            onAdd={() => openBetweenComposer(day, -1)} // -1 = before first
          />
        );

        // ⬇️ Missing piece: render the inline composer for the top gap
        if (topOpen) {
          rows.push(
            <InlineComposer
              key={`composer-top-${day}`}
              value={draft}
              onChange={setDraft}
              onConfirm={() => confirmComposer(day)}
              onCancel={cancelComposer}
              autoFocus
            />
          );
        }
      }

      /* ── Placeholder at index 0 (drop before first) ─────────────── */
      if (placeholderAt === 0) {
        rows.push(
          <div
            key={`ph-top-${day}`}
            className="h-12 my-2 border-2 border-dashed rounded-xl border-violet-400/70"
          />
        );
      }

      /* ── Cards + middle rails/composers ─────────────────────────── */
      for (let i = 0; i < items.length; i++) {
        const t = items[i];
        const isDragged =
          drag && drag.active && drag.fromDay === day && drag.fromIndex === i;

        const children: React.ReactNode[] = [];

        // card (no margin—rails own the gap)
        children.push(
          <TaskCard
            key={`card-${t.id}`}
            innerRef={(el) => setCardRef(draggableIdFor(day, t.id), el)}
            dragId={draggableIdFor(day, t.id)}
            index={i}
            task={t}
            onDelete={() => removeTask(day, t.id)}
            onGrab={(payload) => {
              const el = cardRefs.current.get(draggableIdFor(day, t.id));
              const rect =
                el?.getBoundingClientRect() ??
                new DOMRect(payload.clientX - 1, payload.clientY - 1, 1, 1);
              onGrab({
                day,
                index: i,
                taskId: t.id,
                taskText: t.text,
                clientX: payload.clientX,
                clientY: payload.clientY,
                rect,
                pointerType: payload.pointerType,
              });
            }}
            hiddenWhileDragging={!!isDragged}
          />
        );

        // placeholder BEFORE next card
        if (placeholderAt === i + 1) {
          children.push(
            <div
              key={`ph-${day}-${i + 1}`}
              className="h-12 my-2 border-2 border-dashed rounded-xl border-violet-400/70"
            />
          );
        }

        // between this and the next card
        if (i < items.length - 1) {
          const gapOpen =
            !!composer && composer.day === day && composer.afterIndex === i;

          children.push(
            <GapRail
              key={`rail-${day}-${i}`}
              overlayHidden={gapOpen}
              onAdd={() => openBetweenComposer(day, i)}
            />
          );

          if (gapOpen) {
            children.push(
              <InlineComposer
                key={`composer-gap-${day}-${i}`}
                value={draft}
                onChange={setDraft}
                onConfirm={() => confirmComposer(day)}
                onCancel={cancelComposer}
                autoFocus
              />
            );
          }
        }

        rows.push(
          <div key={`wrap-${day}-${t.id}`} className="relative">
            {children}
          </div>
        );
      }

      /* ── Placeholder at end ─────────────────────────────────────── */
      if (placeholderAt != null && placeholderAt >= items.length) {
        rows.push(
          <div
            key={`ph-end-${day}`}
            className="h-12 my-2 border-2 border-dashed rounded-xl border-violet-400/70"
          />
        );
      }

      /* ── Bottom composer or “add” button ────────────────────────── */
      if (composer && composer.day === day && composer.afterIndex === null) {
        rows.push(
          <div key={`composer-bottom-wrap-${day}`} className="mt-2">
            <InlineComposer
              value={draft}
              onChange={setDraft}
              onConfirm={() => confirmComposer(day)}
              onCancel={cancelComposer}
              autoFocus
            />
          </div>
        );
      } else {
        rows.push(
          <button
            key={`add-bottom-${day}`}
            onClick={() => openBottomComposer(day)}
            className="w-full px-3 py-2 mt-2 text-right rounded-xl bg-violet-50/70 hover:bg-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300"
          >
            + הוסף משימה
          </button>
        );
      }

      return rows;
    },
    [
      week,
      drag,
      targetDay,
      targetIndex,
      composer,
      draft,
      onGrab,
      removeTask,
      setCardRef,
    ]
  );

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        dir="ltr"
        data-role="board-scroller"
        onPointerDown={startPanIfEligible}
        onPointerMove={onPanMove}
        onPointerUp={endPan}
        className={[
          'no-scrollbar',
          'w-full overflow-x-auto overflow-y-visible overscroll-x-contain px-2 md:px-4',
          drag?.active || snapSuppressed || panActive
            ? 'snap-none'
            : 'snap-x snap-mandatory scroll-smooth',
        ].join(' ')}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: drag?.active || panActive ? 'auto' : undefined,
        }}
      >
        <div className="flex gap-3 pb-2 md:gap-5" dir="ltr">
          {slides.map(({ day, key }) => (
            <div
              key={key}
              ref={setSlideRef(day)}
              data-col="true"
              className="shrink-0 snap-center w-[88vw] sm:w-[460px] md:w-[400px]"
            >
              <DayColumn
                title={titles[day]}
                listRef={setListRef(day)}
                maxHeightClass="max-h-[calc(100svh-210px)] md:max-h-[calc(100vh-170px)]"
              >
                {renderListWithUI(day)}
              </DayColumn>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile pagination dots */}
      <div
        className="fixed left-0 right-0 z-30 flex justify-center md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm shadow">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full ${
                i === pageIndex ? 'bg-violet-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Drag overlay */}
      {drag?.active && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${drag.x - drag.dx}px`,
            top: `${drag.y - drag.dy}px`,
            width: `${drag.width}px`,
          }}
        >
          <div
            className={[
              'flex items-center gap-3 p-3 select-none rounded-xl',
              'bg-white/90 dark:bg-slate-700/90',
              'border border-slate-200 dark:border-slate-600',
              'shadow-2xl',
            ].join(' ')}
            style={{
              height: drag.height,
              transform: 'rotate(-3.5deg) scale(1.02)',
              opacity: 0.92,
              transition: 'transform 80ms ease-out, opacity 120ms ease-out',
            }}
          >
            <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
              {drag.taskText}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
