import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { Task, draggableIdFor } from './helpers';
import TaskCard from './TaskCard';
import TaskMenu from './TaskMenu';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import TagsPopup from '@/components/ui/TagsPopup';
import { FilterDropdown, FilterType } from '@/components/ui/FilterDropdown';
import { SideOpenTray } from '@/components/ui/SideOpenTray';
import { TimePopup } from '@/components/ui/TimePopup';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onGrab: (params: {
    day: number;
    index: number;
    taskId: string;
    taskText: string;
    taskType?: 'weekly' | 'regular' | 'backlog';
    clientX: number;
    clientY: number;
    pointerType: 'mouse' | 'touch';
    rectGetter: () => DOMRect;
    tags?: { id: string; name: string; color: string }[];
    calendarEventId?: string;
    startTime?: string;
    endTime?: string;
    reminder?: string;
    notes?: string;
    checklist?: { id: string; text: string; done: boolean }[];
    frogodoroSession?: { date: string; focusTime: number; breakTime: number } | null;
  }) => void;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
  activeDragId: string | null;
  trayRef?: React.RefObject<HTMLDivElement | null>;
  closeProgress?: number; // 0 = fully open, 1 = fully closed
  onRemove?: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
  onToggleRepeat?: (id: string) => void;
  onDoToday?: (id: string) => void;
  onScheduleTask?: (taskId: string, data: { startTime: string; endTime: string; reminder: string }) => Promise<void> | void;
  userTags?: { id: string; name: string; color: string }[];
  filter?: FilterType;
  onFilterChange?: (filter: FilterType) => void;
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  showCompleted?: boolean;
  onShowCompletedChange?: (show: boolean) => void;
  hideDoTodayButton?: boolean;
  backlogDayIndex?: number;
}

export default React.memo(function BacklogTray({
  isOpen,
  onClose,
  tasks,
  onGrab,
  setCardRef,
  activeDragId,
  trayRef,
  closeProgress = 0,
  onRemove,
  onEdit,
  onDoToday,
  onScheduleTask,
  userTags = [],
  filter = 'all',
  onFilterChange,
  selectedTags = [],
  onTagsChange,
  showCompleted = true,
  onShowCompletedChange,
  hideDoTodayButton = false,
  backlogDayIndex = 7,
}: Props) {
  // Menu & Dialog State
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [confirmItem, setConfirmItem] = useState<Task | null>(null);
  const [editItem, setEditItem] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  const [tagPopup, setTagPopup] = useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });

  const [scheduleDialog, setScheduleDialog] = useState<{ task: Task } | null>(null);

  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  const handleDelete = async () => {
    if (!confirmItem || !onRemove) return;
    setBusy(true);
    try {
      await onRemove(confirmItem.id);
    } finally {
      setBusy(false);
      setConfirmItem(null);
    }
  };

  const handleTagSave = async (taskId: string, newTags: string[]) => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: taskId,
          tags: newTags,
        }),
      });
      window.dispatchEvent(new Event('tags-updated'));
    } catch (e) {
      console.error('Failed to update tags', e);
    }
  };

  // Auto-hide when dragging FROM the tray
  const isDraggingAny = !!activeDragId;

  const isFiltered = filter !== 'all' || selectedTags.length > 0 || !showCompleted;

  const filteredTasks = tasks.filter((t) => {
    if (!showCompleted && t.completed) return false;
    if (selectedTags && selectedTags.length > 0) {
      const hasTag = t.tags?.some((tagId) => selectedTags.includes(tagId));
      if (!hasTag) return false;
    }
    return true;
  });

  return (
    <>
      <SideOpenTray
        ref={trayRef}
        isOpen={isOpen}
        onClose={onClose}
        title={`${filteredTasks.length} Saved Tasks`}
        icon={<Icon name="saved" className="h-6 w-6" />}
        iconContainerClassName="bg-primary/10 text-primary"
        className="md:w-[500px]"
        isDraggingAny={isDraggingAny}
        closeProgress={closeProgress}
        rightActions={
          <div className="relative" ref={filterMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFilterMenu(!showFilterMenu);
              }}
              className={`flex items-center justify-center w-9 h-9 rounded-full transition-all active:scale-90 ${
                showFilterMenu || isFiltered
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Filter size={16} />
              {isFiltered && (
                <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
              )}
            </button>

            <FilterDropdown
                  isOpen={showFilterMenu}
                  onClose={() => setShowFilterMenu(false)}
                  triggerRef={filterMenuRef}
                  align="left"
                  filter={filter}
                  onFilterChange={onFilterChange}
                  showTypeFilters={false}
                  availableTags={userTags}
                  selectedTags={selectedTags}
                  onTagsChange={(tags) => onTagsChange?.(tags)}
                  showCompleted={showCompleted}
                  onShowCompletedChange={(show) => onShowCompletedChange?.(show)}
                />
          </div>
        }
      >
        <div className="h-3 shrink-0" aria-hidden />
        <AnimatePresence mode="popLayout" initial={false}>
          {filteredTasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-30 min-h-[300px]">
              <Icon name="saved" className="h-16 w-16" />
              <p className="text-sm font-bold uppercase tracking-widest">
                No saved tasks
              </p>
            </div>
          ) : (
            filteredTasks.map((t) => {
              const originalIndex = tasks.findIndex((it) => it.id === t.id);
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.9,
                    transition: { duration: 0.15 },
                  }}
                  key={t.id}
                  layout
                  className="w-full relative"
                >
                  <div className="group relative">
                    <TaskCard
                      innerRef={(el) =>
                        setCardRef(draggableIdFor(backlogDayIndex as any, t.id), el)
                      }
                      dragId={draggableIdFor(backlogDayIndex as any, t.id)}
                      task={t}
                      userTags={userTags}
                      menuOpen={menu?.id === t.id}
                      onToggleMenu={(rect) => {
                        setMenu((prev) => {
                          if (prev?.id === t.id) return null;
                          const MENU_W = 160;
                          const MENU_H = 180; // Approximate height with all options
                          const MARGIN = 10;
                          const vw = window.innerWidth;
                          const vh = window.innerHeight;

                          let left =
                            rect.left + rect.width / 2 - MENU_W / 2;

                          // Clamp horizontal position
                          left = Math.max(
                            MARGIN,
                            Math.min(left, vw - MENU_W - MARGIN),
                          );

                          let top = rect.bottom + 8;
                          // If menu would go off bottom, flip to above
                          if (top + MENU_H > vh - MARGIN) {
                            top = rect.top - MENU_H - 8;
                          }

                          return { id: t.id, top, left };
                        });
                      }}
                      hiddenWhileDragging={activeDragId === t.id}
                      isRepeating={t.type === 'weekly'}
                      touchAction="auto" // Vertical scroll, so auto is fine? Or none? TaskCard usually handles handle
                      isAnyDragging={!!activeDragId}
                      onGrab={(payload) => {
                        // Same grab logic
                        const resolvedTags = t.tags?.map((tagId) => {
                          const found = userTags?.find(
                            (ut) => ut.id === tagId || ut.name === tagId,
                          );
                          return (
                            found || { id: tagId, name: tagId, color: '' }
                          );
                        });
                        onGrab({
                          day: backlogDayIndex,
                          index: originalIndex,
                          taskId: t.id,
                          taskText: t.text,
                          taskType: t.type,
                          clientX: payload.clientX,
                          clientY: payload.clientY,
                          pointerType: payload.pointerType,
                          rectGetter: () => {
                            const id = draggableIdFor(backlogDayIndex as any, t.id);
                            const el = document.querySelector(
                              `[data-card-id="${id}"]`,
                            );
                            return (
                              el?.getBoundingClientRect() ??
                              new DOMRect(0, 0, 0, 0)
                            );
                          },
                          tags: resolvedTags,
                          calendarEventId: t.calendarEventId,
                          startTime: t.startTime,
                          endTime: t.endTime,
                          reminder: t.reminder,
                          notes: t.notes,
                          checklist: t.checklist,
                          frogodoroSession: t.frogodoroSession,
                        });
                      }}
                      onDoToday={
                        onDoToday ? () => onDoToday(t.id) : undefined
                      }
                      hideDoTodayButton={hideDoTodayButton}
                      compact
                    />
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </SideOpenTray>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
        addTagsPosition="first"
        isWeekly={
          menu
            ? tasks.find((t) => t.id === menu.id)?.type === 'weekly'
            : false
        }
        onEdit={(id) => {
          const t = tasks.find((it) => it.id === id);
          if (t && onEdit) {
            setEditItem(t);
          }
          setMenu(null);
        }}
        onDoToday={() => {
          if (menu && onDoToday) onDoToday(menu.id);
          setMenu(null);
        }}
        onDelete={() => {
          if (menu) {
            const t = tasks.find((it) => it.id === menu.id);
            if (t) setConfirmItem(t);
          }
          setMenu(null);
        }}
        onSchedule={onScheduleTask ? () => {
          if (menu) {
            const t = tasks.find(it => it.id === menu.id);
            if (t) setScheduleDialog({ task: t });
          }
          setMenu(null);
        } : undefined}
      />

      {onScheduleTask && (
        <TimePopup
          open={!!scheduleDialog}
          taskName={scheduleDialog?.task.text ?? ''}
          initialStartTime={scheduleDialog?.task.startTime || ''}
          initialReminder={scheduleDialog?.task.reminder || ''}
          onClose={() => setScheduleDialog(null)}
          onSave={async (data) => {
            if (!scheduleDialog) return;
            await onScheduleTask(scheduleDialog.task.id, data);
            setScheduleDialog(null);
          }}
        />
      )}

      <TagsPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={tasks.find((t) => t.id === tagPopup.taskId)?.tags}
        onClose={() => setTagPopup({ open: false, taskId: null })}
        onSave={handleTagSave}
      />

      <EditTaskDialog
          open={!!editItem}
          initialText={editItem?.text ?? ''}
          busy={busy}
          onClose={() => setEditItem(null)}
          onSave={async (newText) => {
            if (!editItem || !onEdit) return;
            setBusy(true);
            await onEdit(editItem.id, newText);
            setBusy(false);
            setEditItem(null);
          }}
        />

      <DeleteDialog
        open={!!confirmItem}
        variant="backlog"
        itemLabel={confirmItem?.text}
        busy={busy}
        onClose={() => {
          if (!busy) setConfirmItem(null);
        }}
        onDeleteAll={handleDelete}
      />
    </>
  );
});
