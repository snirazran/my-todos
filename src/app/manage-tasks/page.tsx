'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AddTaskModal from '@/components/ui/addTaskModal';
import TaskBoard from '@/components/board/TaskBoard';
import { byId } from '@/lib/skins/catalog';
import useSWR from 'swr';

import {
  Task,
  DAYS,
  labelForDisplayDay,
  apiDayFromDisplay,
  displayDayFromApi,
} from '@/components/board/helpers';

const EXTRA = 'No day (this week)';

export default function ManageTasksPage() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: DAYS }, () => [])
  );

  const [showModal, setShowModal] = useState(false);
  const [prefillText, setPrefillText] = useState<string>('');
  const [prefillDays, setPrefillDays] = useState<number[]>([]);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [modalRepeat, setModalRepeat] = useState<'this-week' | 'weekly'>(
    'weekly'
  );

  // wardrobe → frog indices (to match your modal’s frog)
  const { data: wardrobeData } = useSWR(
    '/api/skins/inventory',
    (u) => fetch(u).then((r) => r.json()),
    { revalidateOnFocus: false }
  );
  const frogIndices = (() => {
    const eq = wardrobeData?.wardrobe?.equipped ?? {};
    return {
      skin: eq?.skin ? byId[eq.skin].riveIndex : 0,
      hat: eq?.hat ? byId[eq.hat].riveIndex : 0,
      scarf: eq?.scarf ? byId[eq.scarf].riveIndex : 0,
      hand_item: eq?.hand_item ? byId[eq.hand_item].riveIndex : 0,
    };
  })();

  /** 🔁 Map API order (Sun..Sat, extra at 7) → Display order */
  const mapApiToDisplay = (apiWeek: Task[][]): Task[][] => {
    const out: Task[][] = Array.from({ length: DAYS }, () => []);
    for (let apiDay = 0; apiDay <= 6; apiDay++) {
      const displayIdx = displayDayFromApi(apiDay);
      out[displayIdx] = apiWeek[apiDay] ?? [];
    }
    out[7] = apiWeek[7] ?? [];
    return out;
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/manage-tasks');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as Task[][];
        if (Array.isArray(data)) setWeek(mapApiToDisplay(data));
      } catch (err) {
        console.error('Failed to fetch weekly tasks:', err);
      }
    })();
  }, []);

  /** Save order for one display column (maps → API day) */
  const saveDay = async (displayDay: number, tasks: Task[]) => {
    const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
    try {
      await fetch('/api/manage-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay),
          tasks: ordered,
        }),
      });
    } catch (e) {
      console.warn('saveDay failed', e);
    }
  };

  /** Delete from one display column (maps → API day) */
  const removeTask = async (displayDay: number, id: string) => {
    try {
      await fetch('/api/manage-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay),
          taskId: id,
        }),
      });
    } finally {
      setWeek((w) => {
        const clone = [...w];
        clone[displayDay] = clone[displayDay].filter((t) => t.id !== id);
        return clone;
      });
    }
  };

  /** Add task; the modal returns API days (0..6 or -1). After POST, refetch & remap. */
  const onAddTask = async ({
    text,
    days,
    repeat,
  }: {
    text: string;
    days: number[];
    repeat: string;
  }) => {
    await fetch('/api/manage-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        days, // already API days
        repeat,
        insertAt,
      }),
    });

    const data = await fetch('/api/manage-tasks').then((r) => r.json());
    setWeek(mapApiToDisplay(data));

    setShowModal(false);
    setInsertAt(null);
    setPrefillText('');
    setPrefillDays([]);
  };

  /** Titles in display order */
  const titles = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) =>
        i === 7 ? EXTRA : labelForDisplayDay(i)
      ),
    []
  );

  return (
    <main
      className="relative overflow-hidden min-h-100svh pb-safe bg-gradient-to-br from-emerald-900 via-emerald-800 to-lime-900/90"
      style={{
        height: 'calc(100dvh - var(--header-h))',
        minHeight: 'calc(-webkit-fill-available - var(--header-h))',
      }}
    >
      {/* Pond background */}

      {/* Soft ripples */}
      <div className="absolute inset-0 pointer-events-none -z-10 opacity-40">
        <div className="absolute w-[42vmin] h-[42vmin] rounded-full left-[6%] top-[18%] bg-lime-300/15 animate-ripple" />
        <div className="absolute w-[54vmin] h-[54vmin] rounded-full right-[10%] top-[6%] bg-emerald-200/15 animate-ripple-slow" />
        <div className="absolute w-[60vmin] h-[60vmin] rounded-full left-[28%] bottom-[10%] bg-lime-200/15 animate-ripple" />
      </div>

      {/* Board */}
      <div className="absolute inset-0">
        <TaskBoard
          titles={titles}
          week={week}
          setWeek={setWeek}
          saveDay={saveDay}
          removeTask={removeTask}
          // NOTE: updated signature: day can be null, repeat is passed through
          onRequestAdd={(
            displayDayOrNull,
            text,
            afterIndex = null,
            repeat = 'weekly'
          ) => {
            setPrefillText(text ?? '');
            // No default day if global button used
            setPrefillDays(
              displayDayOrNull == null
                ? []
                : [apiDayFromDisplay(displayDayOrNull)]
            );
            setInsertAt(
              afterIndex === null ? null : Math.max(0, afterIndex + 1)
            );
            setModalRepeat(repeat);
            setShowModal(true);
          }}
        />
      </div>

      {showModal && (
        <AddTaskModal
          initialText={prefillText}
          initialDays={prefillDays} // [] → no preselected day
          defaultRepeat={modalRepeat} // from global composer choice
          frogIndices={frogIndices}
          onClose={() => {
            setShowModal(false);
            setInsertAt(null);
          }}
          onSave={onAddTask}
        />
      )}

      {/* Local animations (so you don’t need to touch global.css) */}
      <style jsx global>{`
        @keyframes ripple {
          0% {
            transform: scale(0.9);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.6;
          }
          100% {
            transform: scale(0.9);
            opacity: 0.3;
          }
        }
        .animate-ripple {
          animation: ripple 11s ease-in-out infinite;
        }
        .animate-ripple-slow {
          animation: ripple 16s ease-in-out infinite;
        }
        @keyframes bob {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        .animate-bob {
          animation: bob 3.6s ease-in-out infinite;
        }
        @keyframes buzz {
          0% {
            transform: translate(0, 0) rotate(0deg);
          }
          25% {
            transform: translate(-1px, 1px) rotate(-1deg);
          }
          50% {
            transform: translate(1px, -1px) rotate(1deg);
          }
          75% {
            transform: translate(-1px, 0px) rotate(0deg);
          }
          100% {
            transform: translate(0, 0) rotate(0deg);
          }
        }
        .animate-buzz {
          animation: buzz 400ms linear infinite;
        }
        @keyframes cardShine {
          0% {
            background-position: -150% 0;
          }
          100% {
            background-position: 250% 0;
          }
        }
        .shine {
          background-image: linear-gradient(
            120deg,
            transparent 0%,
            rgba(255, 255, 255, 0.35) 30%,
            transparent 60%
          );
          background-size: 200% 100%;
        }
        .shine:hover {
          animation: cardShine 1200ms ease;
        }
      `}</style>
    </main>
  );
}
