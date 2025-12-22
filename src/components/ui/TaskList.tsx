import {
  CheckCircle2,
  Circle,
  EllipsisVertical,
  CalendarCheck,
  RotateCcw,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  TouchSensor,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { AddTaskButton } from '@/components/ui/AddTaskButton';
import TaskMenu from '../board/TaskMenu';
import TagPopup from '@/components/ui/TagPopup';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  type?: 'regular' | 'weekly' | 'backlog';
  origin?: 'regular' | 'weekly' | 'backlog';
  kind?: 'regular' | 'weekly' | 'backlog';
  tags?: string[];
}

interface SortableTaskItemProps {
  task: Task;
  isDone: boolean;
  isMenuOpen: boolean;
  isExitingLater: boolean;
  renderBullet?: (task: Task, isVisuallyDone: boolean) => React.ReactNode;
  handleTaskToggle: (task: Task, forceState?: boolean) => void;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>, task: Task) => void;
  getTagDetails: (tagId: string) => { id: string; name: string; color: string } | undefined;
  isDragDisabled?: boolean;
  isWeekly?: boolean;
}

function SortableTaskItem({
  task,
  isDone,
  isMenuOpen,
  isExitingLater,
  renderBullet,
  handleTaskToggle,
  onMenuOpen,
  getTagDetails,
  isDragDisabled,
  isWeekly,
}: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: isDragDisabled });

  React.useEffect(() => {
    if (isDragging && typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }, [isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : isMenuOpen ? 50 : isExitingLater ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative mb-3">
      <motion.div
        layout={!isDragging}
        initial={{ opacity: 0, y: 20 }}
        animate={
          isExitingLater
            ? {
                opacity: 0,
                x: 200,
                scale: 0.8,
                transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] },
              }
            : { opacity: 1, x: 0, y: 0 }
        }
        exit={
          isExitingLater
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.95 }
        }
        transition={{
          layout: { type: 'spring', stiffness: 300, damping: 30 },
        }}
        className={`group relative ${isMenuOpen ? 'z-50' : 'z-auto'}`}
      >
        <div
          {...attributes}
          {...listeners}
          onClick={() => handleTaskToggle(task)}
          className={`
          relative flex items-center gap-3 px-3 py-3.5 
          transition-all duration-200 cursor-pointer rounded-xl 
          border border-transparent hover:border-border
          hover:bg-accent hover:shadow-sm
          select-none
          ${
            isMenuOpen
              ? 'bg-card border-border shadow-md'
              : ''
          }
          ${isDragging ? 'shadow-2xl ring-2 ring-primary/50 bg-card z-[100] opacity-100' : ''}
          ${isDone && !isDragging ? 'opacity-60 hover:opacity-100' : ''}
        `}
          style={{
            touchAction: 'pan-y', 
            WebkitUserSelect: 'none',
            userSelect: 'none',
          } as React.CSSProperties}
        >
          {/* Bullet */}
          <div className="relative flex-shrink-0 w-7 h-7">
            <AnimatePresence initial={false}>
              {!isDone ? (
                <motion.div
                  key="fly"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {renderBullet ? (
                    renderBullet(task, false)
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskToggle(task, true);
                      }}
                      className="flex items-center justify-center w-full h-full transition-colors text-muted-foreground/50 hover:text-primary"
                    >
                      <Circle className="w-6 h-6" />
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="check"
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 25,
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTaskToggle(task, false);
                    }}
                  >
                    <CheckCircle2 className="text-green-500 w-7 h-7 drop-shadow-sm" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 min-w-0">
            <motion.span
              className={`block text-base font-medium md:text-lg transition-colors duration-200 ${
                isDone
                  ? 'text-muted-foreground line-through'
                  : 'text-foreground'
              }`}
              animate={{
                opacity: isDone ? 0.8 : 1,
              }}
              transition={{ duration: 0.2 }}
            >
              {task.text}
            </motion.span>
            {(isWeekly || (task.tags && task.tags.length > 0)) && (
              <div className="flex flex-wrap gap-1 mt-1">
                {isWeekly && (
                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-900/40 dark:text-purple-200 border border-purple-100 dark:border-purple-800/50 uppercase tracking-wider">
                    <RotateCcw className="h-3 w-3" />
                    Weekly
                  </span>
                )}
                <AnimatePresence mode="popLayout">
                  {task.tags?.map((tagId) => {
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
          <div className="relative shrink-0">
            <button
              className={`
              p-2 rounded-lg transition-colors
              ${
                isMenuOpen
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }
            `}
              onClick={(e) => onMenuOpen(e, task)}
            >
              <EllipsisVertical className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function TaskList({
  tasks,
  toggle,
  showConfetti,
  renderBullet,
  visuallyCompleted,
  onAddRequested,
  weeklyIds = new Set<string>(),
  onDeleteToday,
  onDeleteFromWeek,
  onDoLater,
  onReorder,
  onToggleRepeat,
}: {
  tasks: Task[];
  toggle: (id: string, completed?: boolean) => void;
  showConfetti: boolean;
  renderBullet?: (task: Task, isVisuallyDone: boolean) => React.ReactNode;
  visuallyCompleted?: Set<string>;
  onAddRequested: (
    prefill: string,
    insertAfterIndex: number | null,
    opts?: { preselectToday?: boolean }
  ) => void;

  weeklyIds?: Set<string>;
  onDeleteToday: (taskId: string) => Promise<void> | void;
  onDeleteFromWeek: (taskId: string) => Promise<void> | void;
  onDoLater?: (taskId: string) => Promise<void> | void;
  onReorder?: (tasks: Task[]) => void;
  onToggleRepeat?: (taskId: string) => Promise<void> | void;
}) {
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

  const vSet = visuallyCompleted ?? new Set<string>();

  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [exitAction, setExitAction] = useState<{ id: string; type: 'later' } | null>(null);
  const [dialog, setDialog] = useState<{
    task: Task;
    kind: 'regular' | 'weekly' | 'backlog';
  } | null>(null);
  
  const [tagPopup, setTagPopup] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Listen for other menus opening to auto-close this one
  React.useEffect(() => {
    const closeIfOther = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      setMenu((curr) => (curr && curr.id !== id ? null : curr));
    };

    window.addEventListener('task-menu-open', closeIfOther as EventListener);

    return () => {
      window.removeEventListener(
        'task-menu-open',
        closeIfOther as EventListener
      );
    };
  }, []);
  
  const handleTagSave = async (taskId: string, newTags: string[]) => {
      try {
          await fetch('/api/tasks', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId, tags: newTags }),
          });
          
          window.dispatchEvent(new Event('tags-updated'));
      } catch (e) {
          console.error("Failed to update tags", e);
      }
  };

  const taskKind = (t: Task) => {
    const sourceType = t.type ?? t.origin ?? t.kind;
    if (sourceType === 'weekly') return 'weekly';
    if (sourceType === 'backlog') return 'backlog';
    if (sourceType === 'regular') return 'regular';
    return weeklyIds.has(t.id) ? 'weekly' : 'regular';
  };

  const confirmDeleteToday = async () => {
    if (!dialog) return;
    const taskId = dialog.task.id;
    setBusy(true);
    try {
      await onDeleteToday(taskId);
      setDialog(null);
      setMenu(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteWeek = async () => {
    if (!dialog) return;
    const taskId = dialog.task.id;
    setBusy(true);
    try {
      await onDeleteFromWeek(taskId);
      setDialog(null);
      setMenu(null);
    } finally {
      setBusy(false);
    }
  };

  const dialogVariant: 'regular' | 'weekly' | 'backlog' = dialog
    ? taskKind(dialog.task)
    : 'regular';

  const handleTaskToggle = (task: Task, forceState?: boolean) => {
    const isCompleting =
      forceState === true || (forceState === undefined && !task.completed);

    if (isCompleting) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      fetch('/api/statistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete_task',
          taskId: task.id,
          timezone: tz,
        }),
      }).catch((err) => console.error('Failed to update stats', err));
    }

    toggle(task.id, forceState);
  };

  const activeTaskIds = tasks
    .filter((t) => !t.completed && !vSet.has(t.id))
    .map((t) => t.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && onReorder) {
      const activeTasks = tasks.filter((t) => !t.completed && !vSet.has(t.id));
      const oldIndex = activeTasks.findIndex((t) => t.id === active.id);
      const newIndex = activeTasks.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Reorder only the active tasks locally
        const newActiveTasks = arrayMove(activeTasks, oldIndex, newIndex);
        
        // Reconstruct the full list: newActiveTasks + existing completed tasks
        // NOTE: We rely on the fact that completed tasks are usually at the bottom.
        // If they are mixed (during animation), this might be slightly jumpy, 
        // but the user wants dragging *only* for active tasks.
        const currentCompleted = tasks.filter((t) => t.completed || vSet.has(t.id));
        onReorder([...newActiveTasks, ...currentCompleted]);
      }
    }
  };

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, task: Task) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const id = `task:${task.id}`;
    window.dispatchEvent(
      new CustomEvent('task-menu-open', {
        detail: { id },
      })
    );
    
    setMenu((prev) => {
      if (prev?.id === task.id) return null;
      const MENU_W = 160;
      const MENU_H = 80;
      const GAP = 8;
      const MARGIN = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      
      let left = rect.left + rect.width / 2 - MENU_W / 2;
      left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
      
      let top = rect.bottom + GAP;
      if (top + MENU_H > vh - MARGIN) {
        top = rect.top - MENU_H - GAP;
      }
      return { id: task.id, top, left };
    });
  };

  return (
    <>
      <div
        dir="ltr"
        className="px-6 pt-6 pb-4 overflow-visible rounded-[20px] bg-card/80 backdrop-blur-2xl border border-border/50 shadow-sm"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="flex items-center gap-3 text-xl font-black tracking-tight uppercase text-foreground">
            <CalendarCheck className="w-6 h-6 md:w-7 md:h-7 text-primary" />
            Your Tasks
          </h2>
          {tasks.length > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1 text-[11px] font-bold text-muted-foreground">
              {tasks.length}
            </span>
          )}
        </div>

        <div className="pb-2 space-y-0 overflow-visible min-h-[100px]">
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed text-muted-foreground border-border bg-muted/30 rounded-xl">
              <CalendarCheck className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No tasks for today.</p>
              <p className="mt-1 text-xs opacity-60">
                Add one below to get started!
              </p>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={activeTaskIds}
              strategy={verticalListSortingStrategy}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {tasks.map((task) => {
                  const isDone = task.completed || vSet.has(task.id);
                  const isMenuOpen = menu?.id === task.id;
                  const isExitingLater =
                    exitAction?.id === task.id && exitAction.type === 'later';
                    
                  return (
                    <SortableTaskItem
                      key={task.id}
                      task={task}
                      isDone={isDone}
                      isMenuOpen={isMenuOpen}
                      isExitingLater={isExitingLater}
                      renderBullet={renderBullet}
                      handleTaskToggle={handleTaskToggle}
                      onMenuOpen={openMenu}
                      getTagDetails={getTagDetails}
                      isDragDisabled={isDone}
                      isWeekly={taskKind(task) === 'weekly'}
                    />
                  );
                })}
              </AnimatePresence>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        isDone={menu ? (tasks.find(t => t.id === menu.id)?.completed || vSet.has(menu.id)) : false}
        onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
        addTagsPosition="second"
        onDoLater={
          onDoLater
            ? () => {
                if (menu) {
                  const id = menu.id;
                  setMenu(null);
                  setExitAction({ id, type: 'later' });
                  onDoLater(id);
                }
              }
            : undefined
        }
        onToggleRepeat={
          onToggleRepeat
            ? () => {
                if (menu) {
                  const id = menu.id;
                  // Don't close immediately if we want to show loading, but UI usually optimistic.
                  // Closing menu feels snappier.
                  onToggleRepeat(id);
                  setMenu(null);
                }
              }
            : undefined
        }
        isWeekly={menu ? (tasks.find(t => t.id === menu.id)?.type === 'weekly' || (menu && weeklyIds.has(menu.id))) : false}
        onDelete={() => {
          if (menu) {
            const t = tasks.find((it) => it.id === menu.id);
            if (t) {
              setDialog({
                task: t,
                kind: taskKind(t) as 'regular' | 'weekly' | 'backlog',
              });
            }
          }
          setMenu(null);
        }}
      />

      <TagPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={tasks.find(t => t.id === tagPopup.taskId)?.tags}
        onClose={() => setTagPopup({ open: false, taskId: null })}
        onSave={handleTagSave}
      />

      <DeleteDialog
        open={!!dialog}
        variant={dialogVariant}
        itemLabel={dialog?.task.text}
        busy={busy}
        onClose={() => setDialog(null)}
        onDeleteToday={
          dialogVariant !== 'backlog' ? confirmDeleteToday : undefined
        }
        onDeleteAll={
          dialogVariant === 'weekly'
            ? confirmDeleteWeek
            : dialogVariant === 'backlog'
            ? confirmDeleteToday
            : undefined
        }
      />

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
    </>
  );
}