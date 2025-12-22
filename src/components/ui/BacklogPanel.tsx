'use client';

import * as React from 'react';

import { EllipsisVertical, CalendarClock, Plus, Loader2 } from 'lucide-react';

import { AnimatePresence, motion } from 'framer-motion';

import Fly from '@/components/ui/fly';

import { DeleteDialog } from '@/components/ui/DeleteDialog';

import TaskMenu from '../board/TaskMenu';

import useSWR from 'swr';

import TagPopup from '@/components/ui/TagPopup';

type BacklogItem = { id: string; text: string; tags?: string[] };

export default function BacklogPanel({
  later,

  onRefreshToday,

  onRefreshBacklog,

  onMoveToToday,
}: {
  later: BacklogItem[];

  onRefreshToday: () => Promise<void> | void;

  onRefreshBacklog: () => Promise<void> | void;

  onMoveToToday?: (item: BacklogItem) => Promise<void> | void;
}) {
  const [menu, setMenu] = React.useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);

  const [confirmId, setConfirmId] = React.useState<BacklogItem | null>(null);

  const [busy, setBusy] = React.useState(false);

  const [processingIds, setProcessingIds] = React.useState<Set<string>>(
    new Set()
  );

  const [exitAction, setExitAction] = React.useState<{
    id: string;
    type: 'today';
  } | null>(null);

  const [tagPopup, setTagPopup] = React.useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });

  // Fetch Tags for colors

  const { data: tagsData } = useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json())
  );

  const userTags: { id: string; name: string; color: string }[] =
    tagsData?.tags || [];

  const getTagDetails = (tagIdentifier: string) => {
    // Try to find by ID first

    const byId = userTags.find((t) => t.id === tagIdentifier);

    if (byId) return byId;

    // Fallback: try to find by Name

    return userTags.find((t) => t.name === tagIdentifier);
  };

  const handleTagSave = async (taskId: string, newTags: string[]) => {
    // Update tags for a backlog task.

    // We can use the board PUT endpoint which handles updates including tags.

    // We need to pass day=-1 to indicate backlog context if we use board PUT,

    // but actually board PUT takes `tasks` array.

    // Let's rely on the simpler logic:

    // We need to fetch current task details or just construct what we need.

    // Since we only want to update tags, we might need a dedicated endpoint OR

    // re-use existing board PUT logic by sending just the updated task.

    // However, `handleBoardPut` in `api/tasks/route.ts` expects an array of tasks for reordering/updating.

    // If we send just one task, it might be fine, but we need to be careful about `day`.

    // Actually, since `later` items are known, we can find the item.

    const item = later.find((t) => t.id === taskId);

    if (!item) return;

      try {
          await fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: taskId,
              tags: newTags
            }),
          });
          
          window.dispatchEvent(new Event('tags-updated'));
      } catch (e) {
          console.error("Failed to update tags", e);
      }
  };

  // Listen for other menus opening to auto-close this one (syncs with TaskList)

  React.useEffect(() => {
    const closeIfOther = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;

      setMenu((curr) => (curr && curr.id !== id ? null : curr));
    };

    window.addEventListener('task-menu-open', closeIfOther as EventListener);

    return () =>
      window.removeEventListener(
        'task-menu-open',

        closeIfOther as EventListener
      );
  }, []);

  const addToday = async (item: BacklogItem) => {
    if (processingIds.has(item.id)) return;

    setProcessingIds((prev) => new Set(prev).add(item.id));

    setExitAction({ id: item.id, type: 'today' });

    try {
      if (onMoveToToday) {
        await onMoveToToday(item);
        return;
      }

      const dow = new Date().getDay();

      // Start API calls immediately

      await Promise.all([
        fetch('/api/tasks?view=board', {
          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({
            text: item.text,

            days: [dow],

            repeat: 'this-week',

            tags: item.tags,
          }),
        }),

        fetch('/api/tasks?view=board', {
          method: 'DELETE',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ day: -1, taskId: item.id }),
        }),
      ]);

      await onRefreshToday();

      await onRefreshBacklog();
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);

        next.delete(item.id);

        return next;
      });
    }
  };

  const removeLater = async (taskId: string) => {
    setBusy(true);

    try {
      await fetch('/api/tasks?view=board', {
        method: 'DELETE',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ day: -1, taskId }),
      });

      await onRefreshBacklog();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir="ltr"
      // Added overflow-visible to allow menus to spill out if needed

      className="px-6 pt-6 pb-4 overflow-visible rounded-[20px] bg-card/80 backdrop-blur-2xl border border-border/50 shadow-sm"
    >
      {/* Header */}

      <div className="flex items-center justify-between mb-6">
        <h3 className="flex items-center gap-3 text-xl font-black tracking-tight uppercase text-foreground">
          <CalendarClock className="w-6 h-6 text-primary md:w-7 md:h-7" />
          Saved Tasks
        </h3>

        {later.length > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-muted-foreground">
            {later.length}
          </span>
        )}
      </div>

      <div className="pb-2 space-y-3 overflow-visible min-h-[100px]">
        {later.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center border-2 border-dashed text-muted-foreground border-border bg-muted/30 rounded-xl">
            <CalendarClock className="w-10 h-10 mb-3 opacity-20" />

            <p className="text-sm font-medium">No tasks saved yet.</p>

            <p className="mt-1 text-xs opacity-60">
              Save tasks for later and add them when you&apos;re ready!
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {later.map((t, i) => {
              const isMenuOpen = menu?.id === t.id;

              const isExiting = exitAction?.id === t.id;

              return (
                <motion.div
                  layout
                  key={t.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={
                    isExiting
                      ? {
                          opacity: 0,

                          x: -200, // Fly LEFT

                          scale: 0.8,

                          transition: {
                            duration: 0.4,
                            ease: [0.32, 0.72, 0, 1],
                          },
                        }
                      : { opacity: 1, x: 0, y: 0 }
                  }
                  exit={
                    isExiting
                      ? { opacity: 0 } // Already animated out
                      : { opacity: 0, scale: 0.95 }
                  }
                  transition={{ delay: i * 0.05 }}
                  // IMPORTANT: Z-Index logic fixes the clipping/overlap issue

                  className={`group relative ${
                    isMenuOpen ? 'z-50' : isExiting ? 'z-0' : 'z-auto'
                  }`}
                  style={{
                    // Ensure active menu item floats above subsequent items

                    zIndex: isMenuOpen ? 50 : isExiting ? 0 : 1,
                  }}
                >
                  {/* Row */}

                  <div
                    className={`

                        relative flex items-center gap-4 px-3 py-3.5 

                        transition-all duration-200 rounded-xl 

                        border border-transparent hover:bg-accent hover:shadow-sm

                        ${
                          isMenuOpen
                            ? 'bg-card border-border shadow-md'
                            : ''
                        }

                      `}
                  >
                    {/* Fly Icon */}

                    <div className="flex items-center justify-center flex-shrink-0 w-7 h-7">
                      <Fly
                        size={24}
                        className="text-primary transition-all opacity-70 grayscale group-hover:grayscale-0 group-hover:opacity-100"
                      />
                    </div>

                    {/* Text */}

                    <div className="flex-1 min-w-0">
                      <span className="block text-base font-medium md:text-lg text-foreground">
                        {t.text}
                      </span>

                      {t.tags && t.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <AnimatePresence mode="popLayout">
                          {t.tags.map((tagId) => {
                            const tagDetails = getTagDetails(tagId);

                            if (!tagDetails) return null;

                            const color = tagDetails.color;

                            const name = tagDetails.name;

                            return (
                              <motion.span
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ duration: 0.2 }}
                                key={tagId}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider transition-colors border shadow-sm ${
                                  !color
                                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800/50'
                                    : ''
                                }`}
                                style={
                                  color
                                    ? {
                                        backgroundColor: `${color}20`,

                                        color: color,

                                        borderColor: `${color}40`,
                                      }
                                    : undefined
                                }
                              >
                                {name}
                              </motion.span>
                            );
                          })}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="relative flex items-center gap-2 shrink-0">
                      {/* "Do Today!" Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToday(t);
                        }}
                        disabled={processingIds.has(t.id)}
                        className="group/btn flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 active:scale-95 transition-all rounded-full shadow-md shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {processingIds.has(t.id) ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 transition-transform group-hover/btn:rotate-90" />
                        )}
                        <span>Do Today!</span>
                      </button>

                      {/* Menu Button */}
                      <button
                        className={`
                        p-2 rounded-lg transition-colors
                        ${
                          isMenuOpen
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }
                      `}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const id = `backlog:${t.id}`;
                          // Dispatch event to close other menus
                          window.dispatchEvent(
                            new CustomEvent('task-menu-open', {
                              detail: { id },
                            })
                          );

                          setMenu((prev) => {
                            if (prev?.id === t.id) return null;
                            const MENU_W = 160;
                            const MENU_H = 48;
                            const GAP = 8;
                            const MARGIN = 10;
                            const vw = window.innerWidth;
                            const vh = window.innerHeight;

                            let left = rect.left + rect.width / 2 - MENU_W / 2;
                            left = Math.max(
                              MARGIN,
                              Math.min(left, vw - MENU_W - MARGIN)
                            );

                            let top = rect.bottom + GAP;
                            if (top + MENU_H > vh - MARGIN) {
                              top = rect.top - MENU_H - GAP;
                            }
                            return { id: t.id, top, left };
                          });
                        }}
                      >
                        <EllipsisVertical className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
        addTagsPosition="first"
        onDelete={() => {
          if (menu) {
            const t = later.find((it) => it.id === menu.id);
            if (t) setConfirmId(t);
          }
          setMenu(null);
        }}
      />

      <TagPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={later.find((t) => t.id === tagPopup.taskId)?.tags}
        onClose={() => setTagPopup({ open: false, taskId: null })}
        onSave={handleTagSave}
      />

      {confirmId && (
        <DeleteDialog
          open={!!confirmId}
          variant="backlog"
          itemLabel={confirmId.text}
          busy={busy}
          onClose={() => {
            if (!busy) setConfirmId(null);
          }}
          onDeleteAll={() => {
            if (!confirmId) return;
            removeLater(confirmId.id).then(() => setConfirmId(null));
          }}
        />
      )}

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
