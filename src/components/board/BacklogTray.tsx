import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CalendarClock, CalendarRange, Trash2 } from 'lucide-react';
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

  // Auto-hide when dragging FROM the tray
  const isDraggingAny = !!activeDragId;
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isDraggingAny ? 0 : (1 - closeProgress) }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-sm"
            onClick={onClose}
            style={{ pointerEvents: (closeProgress > 0.5 || isDraggingAny) ? 'none' : 'auto' }}
          />

          {/* The Vertical Tray/Drawer */}
          <motion.div
            ref={trayRef}
            initial={{ x: '-100%', opacity: 0 }} // Desktop: Slide from Left
            animate={{ 
                x: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0%' : '0%', // Desktop: Slide In (0%)
                y: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0%' : `${closeProgress * 100}%`, // Mobile: Slide Up (Bottom)
                opacity: isDraggingAny ? 0 : 1,
                scale: isDraggingAny ? 0.95 : 1
            }}
            exit={{ x: '-100%', opacity: 0 }} // Desktop: Slide out Left
            transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
            className={`
                fixed z-[90] flex flex-col bg-card/95 border-r border-border/50 shadow-2xl backdrop-blur-3xl overflow-hidden
                
                /* Mobile: Bottom Sheet */
                inset-x-0 bottom-0 top-[15vh] rounded-t-[32px] border-t
                
                /* Desktop: Left Sidebar */
                md:inset-y-0 md:left-0 md:right-auto md:w-[420px] md:top-0 md:bottom-0 md:rounded-none md:border-t-0
            `}
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: isDraggingAny ? 'none' : 'auto' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-8 md:px-8 shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary shadow-sm">
                  <CalendarClock size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-foreground uppercase">
                    Saved Tasks
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                    <CalendarRange size={12} strokeWidth={3} />
                    <span>{tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'} Saved</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground transition-all active:scale-95"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Vertical Scroll Content */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 md:px-6 pb-8 space-y-3"
            >
              <AnimatePresence mode="popLayout">
                {tasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 opacity-30 min-h-[300px]">
                    <CalendarClock size={64} strokeWidth={1} />
                    <p className="text-sm font-bold uppercase tracking-widest">No saved tasks</p>
                    </div>
                ) : (
                    tasks.map((t, i) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                        key={t.id}
                        layout
                        className="w-full relative"
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
                                    // Adjust menu positioning logic for vertical list if needed
                                    // Simply centering relative to rect is usually fine
                                    const MENU_W = 180;
                                    const MENU_H = 64;
                                    const vw = window.innerWidth;
                                    const vh = window.innerHeight;
                                    
                                    let left = rect.left + rect.width / 2 - MENU_W / 2;
                                    // Ensure menu stays within sidebar bounds if on desktop?
                                    // Actually we want it to pop out.
                                    
                                    let top = rect.bottom + 8;
                                    if (top + MENU_H > vh - 20) {
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
                                    rectGetter: () => { // ... },
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
                    ))
                )}
              </AnimatePresence>
            </div>
            
            {/* Footer / Gradient Cover at bottom? */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />

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