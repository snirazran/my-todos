import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Inbox, Archive, CalendarRange, Trash2 } from 'lucide-react';
import { Task, draggableIdFor } from './helpers';
import TaskCard from './TaskCard';
import TaskMenu from './TaskMenu';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import TagPopup from '@/components/ui/TagPopup';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onGrab: (params: any) => void;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
  activeDragId: string | null;
  trayRef?: React.RefObject<HTMLDivElement>;
  closeProgress?: number; // 0 = fully open, 1 = fully closed
  onRemove?: (id: string) => void;
  userTags?: { id: string; name: string; color: string }[];
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
  userTags = [],
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Menu & Dialog State
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [confirmItem, setConfirmItem] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  
  const [tagPopup, setTagPopup] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Lock scroll when dragging
  useEffect(() => {
    if (activeDragId && scrollRef.current) {
      scrollRef.current.style.overflowX = 'hidden';
      scrollRef.current.style.touchAction = 'none';
    } else if (scrollRef.current) {
      scrollRef.current.style.overflowX = 'auto';
      scrollRef.current.style.touchAction = 'pan-x';
    }
  }, [activeDragId]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-card-id]')) return;

    setIsDragging(true);
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const stopDragging = () => setIsDragging(false);

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
              tags: newTags
            }),
          });
          window.dispatchEvent(new Event('tags-updated'));
      } catch (e) {
          console.error("Failed to update tags", e);
      }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 - closeProgress }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="fixed inset-0 z-[80] bg-background/40 backdrop-blur-md"
            onClick={onClose}
            style={{ pointerEvents: closeProgress > 0.5 ? 'none' : 'auto' }}
          />

          {/* The Tray */}
          <motion.div
            ref={trayRef}
            initial={{ y: '100%' }}
            animate={{ y: `${closeProgress * 100}%` }}
            exit={{ y: '100%' }}
            transition={closeProgress > 0 ? { type: 'tween', ease: 'linear', duration: 0 } : { type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
            className="fixed bottom-0 left-0 right-0 z-[90] flex flex-col bg-card/95 border-t border-border/50 shadow-[0_-20px_50px_rgba(0,0,0,0.1)] backdrop-blur-3xl pb-[env(safe-area-inset-bottom)] rounded-t-[32px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-border/40" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-8 py-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-primary/10 text-primary">
                  <Archive size={22} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight text-foreground uppercase">
                    Saved Tasks
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                    <CalendarRange size={12} strokeWidth={3} />
                    <span>Drop here to schedule later</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-10 h-10 rounded-2xl bg-secondary hover:bg-secondary/80 text-muted-foreground transition-all active:scale-95"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Horizontal Scroll Content */}
            <div
              ref={scrollRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopDragging}
              onMouseLeave={stopDragging}
              className="flex gap-4 px-8 py-6 overflow-x-auto overflow-y-visible min-h-[160px] items-center no-scrollbar touch-manipulation"
            >
              {tasks.length === 0 ? (
                <div className="w-full flex flex-col items-center justify-center py-10 gap-3 opacity-30">
                  <Inbox size={48} strokeWidth={1.5} />
                  <p className="text-sm font-bold uppercase tracking-widest">Your backlog is empty</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                {tasks.map((t, i) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                    key={t.id}
                    className="w-[280px] sm:w-[320px] shrink-0 relative"
                  >
                    <div className="group relative">
                      <TaskCard
                        innerRef={(el) => setCardRef(draggableIdFor(7, t.id), el)}
                        dragId={draggableIdFor(7, t.id)}
                        task={t}
                        userTags={userTags}
                        menuOpen={menu?.id === t.id}
                        onToggleMenu={(rect) => {
                          setMenu((prev) => {
                            if (prev?.id === t.id) return null;
                            const MENU_W = 180;
                            const MENU_H = 64;
                            const GAP = 12;
                            const MARGIN = 16;
                            const vw = typeof window !== 'undefined' ? window.innerWidth : 480;
                            const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
                            let left = rect.left + rect.width / 2 - MENU_W / 2;
                            left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
                            let top = rect.bottom + GAP;
                            if (top + MENU_H > vh - MARGIN) {
                              top = rect.top - MENU_H - GAP;
                            }
                            return { id: t.id, top, left };
                          });
                        }}
                        hiddenWhileDragging={activeDragId === t.id}
                        isRepeating={t.type === 'weekly'}
                        touchAction="pan-x"
                        isAnyDragging={!!activeDragId}
                        onGrab={(payload) => {
                          const resolvedTags = t.tags?.map(tagId => {
                             const found = userTags?.find(ut => ut.id === tagId || ut.name === tagId);
                             return found || { id: tagId, name: tagId, color: '' };
                          });

                          onGrab({
                              day: 7,
                              index: i,
                              taskId: t.id,
                              taskText: t.text,
                              clientX: payload.clientX,
                              clientY: payload.clientY,
                              pointerType: payload.pointerType,
                              rectGetter: () => {
                                  const id = draggableIdFor(7, t.id);
                                  const el = document.querySelector(`[data-card-id="${id}"]`);
                                  return el?.getBoundingClientRect() ?? new DOMRect(0,0,0,0);
                              },
                              tags: resolvedTags
                          })
                        }}
                      />
                    </div>
                  </motion.div>
                ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>

          <TaskMenu
            menu={menu}
            onClose={() => setMenu(null)}
            onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
            addTagsPosition="first"
            onDelete={() => {
              if (menu) {
                const t = tasks.find((it) => it.id === menu.id);
                if (t) setConfirmItem(t);
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
      )}
    </AnimatePresence>
  );
});