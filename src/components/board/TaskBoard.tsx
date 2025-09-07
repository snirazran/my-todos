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
}: {
  titles: string[];
  week: Task[][];
  setWeek: React.Dispatch<React.SetStateAction<Task[][]>>;
  saveDay: (day: number, tasks: Task[]) => Promise<void>;
  removeTask: (day: number, id: string) => Promise<void>;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [panActive, setPanActive] = useState(false);
  const [pageIndex, setPageIndex] = useState(todayIndex());

  // card-drag state
  const [drag, setDrag] = useState<DragState | null>(null);
  const [targetDay, setTargetDay] = useState<number | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);

  // smooth-scroll snapping suppression
  const [snapSuppressed, setSnapSuppressed] = useState(false);

  // desktop pan state
  const [canPan, setCanPan] = useState(false);
  const canPanRef = useRef(false);
  const panActiveRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartScrollLeftRef = useRef(0);

  // pointer refs for edge auto-scroll
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

  const setSlideRef = useCallback(
    (day: number) => (el: HTMLDivElement | null) => {
      slideRefs.current[day] = el;
    },
    []
  );
  const setListRef = useCallback(
    (day: number) => (el: HTMLDivElement | null) => {
      listRefs.current[day] = el;
    },
    []
  );
  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) cardRefs.current.delete(id);
    else cardRefs.current.set(id, el);
  }, []);

  // recompute overflow => canPan
  const recomputeCanPan = useCallback(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const overflow = s.scrollWidth - s.clientWidth > 2;
    setCanPan(overflow);
    canPanRef.current = overflow;
  }, []);

  // snap to today
  useEffect(() => {
    const s = scrollerRef.current;
    const t = todayIndex();
    const el = slideRefs.current[t];
    if (!s || !el) return;
    s.scrollTo({
      left: el.offsetLeft - (s.clientWidth - el.clientWidth) / 2,
      behavior: 'instant',
    });
    setPageIndex(t);
    recomputeCanPan();
  }, [recomputeCanPan]);

  // observe size changes / window resize
  useEffect(() => {
    const onResize = () => recomputeCanPan();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => recomputeCanPan());
    if (scrollerRef.current) ro.observe(scrollerRef.current);
    requestAnimationFrame(recomputeCanPan);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, [week, titles, recomputeCanPan]);

  // pagination index
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

  // ----- CARD DRAG -----
  const onGrab = useCallback(
    (params: {
      day: number;
      index: number;
      taskId: string;
      taskText: string;
      clientX: number;
      clientY: number;
      rect: DOMRect;
    }) => {
      const { day, index, taskId, taskText, clientX, clientY, rect } = params;

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
    },
    []
  );

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

  // track card drag pointer & targets
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

      // which column?
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
        // clamp to nearest
        let minDist = Infinity;
        let best: number | null = null;
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

      // index inside column
      let newIndex = 0;
      if (newDay != null) {
        const list = listRefs.current[newDay];
        if (list) {
          const children = Array.from(list.children) as HTMLElement[];
          if (children.length === 0) {
            newIndex = 0;
          } else {
            let placed = false;
            for (let i = 0; i < children.length; i++) {
              const cr = children[i].getBoundingClientRect();
              const mid = cr.top + cr.height / 2;
              if (y < mid) {
                newIndex = i;
                placed = true;
                break;
              }
            }
            if (!placed) newIndex = children.length;
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

  // edge auto-scroll loop (board + list + viewport assist)
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

      // vertical (current column)
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

  // ---------- DESKTOP DRAG-TO-PAN ----------
  const startPanIfEligible = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canPanRef.current) return; // no overflow => no pan
    if (drag?.active) return; // don't pan while dragging a card
    if (e.pointerType !== 'mouse') return; // desktop only
    if (e.button !== 0) return; // left click only

    const target = e.target as HTMLElement;
    // Do not start pan if clicking a CARD; allow panning on columns/background.
    if (target.closest('[data-card-id]')) return;

    const s = scrollerRef.current;
    if (!s) return;

    // prevent the browser from starting text selection
    e.preventDefault();

    panActiveRef.current = true;
    setPanActive(true);
    panStartXRef.current = e.clientX;
    panStartScrollLeftRef.current = s.scrollLeft;

    s.setPointerCapture?.(e.pointerId);
    document.body.style.userSelect = 'none';
  };

  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panActiveRef.current) return;
    e.preventDefault();
    const s = scrollerRef.current;
    if (!s) return;
    s.scrollLeft =
      panStartScrollLeftRef.current - (e.clientX - panStartXRef.current);
  };

  const endPan = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (!panActiveRef.current) return;
    panActiveRef.current = false;
    setPanActive(false);
    const s = scrollerRef.current;
    if (s && e) s.releasePointerCapture?.(e.pointerId);
    document.body.style.userSelect = '';
  };

  // End pan if pointer released outside element
  useEffect(() => {
    const up = () => endPan();
    window.addEventListener('pointerup', up, { passive: true });
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const renderListWithPlaceholder = useCallback(
    (day: number) => {
      const items = week[day];
      const placeholderAt =
        drag && targetDay === day && targetIndex != null ? targetIndex : null;

      const children: React.ReactNode[] = [];
      for (let i = 0; i < items.length; i++) {
        if (placeholderAt === i) {
          children.push(
            <div
              key={`ph-${day}-${i}`}
              className="h-12 mb-2 border-2 border-dashed rounded-xl border-violet-400/70"
            />
          );
        }
        const t = items[i];
        const isDragged =
          drag &&
          drag.active &&
          drag.fromDay === day &&
          drag.fromIndex === i &&
          draggableIdFor(day, t.id) === draggableIdFor(drag.fromDay, t.id);

        children.push(
          <TaskCard
            key={t.id}
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
              });
            }}
            hiddenWhileDragging={!!isDragged}
          />
        );
      }
      if (placeholderAt != null && placeholderAt >= items.length) {
        children.push(
          <div
            key={`ph-end-${day}`}
            className="h-12 mb-2 border-2 border-dashed rounded-xl border-violet-400/70"
          />
        );
      }
      return children;
    },
    [week, drag, targetDay, targetIndex, onGrab, removeTask, setCardRef]
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
          // On desktop, if there is no overflow, disable horizontal panning entirely.
          // (Scrolling will be inert anyway.)
        }}
      >
        <div className="flex gap-3 pb-2 md:gap-5" dir="ltr">
          {slides.map(({ day, key }) => (
            <div
              key={key}
              ref={setSlideRef(day)}
              data-col="true"
              className="shrink-0 snap-center w-full sm:w-[460px] md:w-[400px]"
            >
              <DayColumn title={titles[day]} listRef={setListRef(day)}>
                {renderListWithPlaceholder(day)}
              </DayColumn>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination dots (mobile only) */}
      <div className="flex justify-center mt-3 mb-6 md:hidden">
        {slides.map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full mx-1 ${
              i === pageIndex ? 'bg-violet-600' : 'bg-gray-300'
            }`}
          />
        ))}
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
              'flex items-center gap-3 p-3 mb-2 select-none rounded-xl',
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
