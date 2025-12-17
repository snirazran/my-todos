import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Task, draggableIdFor } from './helpers';
import TaskCard from './TaskCard';
import TaskMenu from './TaskMenu';
import { DeleteDialog } from '@/components/ui/DeleteDialog';

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
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Menu & Dialog State
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [confirmItem, setConfirmItem] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

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
    // Don't drag-scroll if clicking a button (context menu) or a task card (it handles its own drag)
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
    const walk = (x - startX.current) * 1.5; // Scroll-fast
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
            className="fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]"
            onClick={onClose}
            style={{ pointerEvents: closeProgress > 0.5 ? 'none' : 'auto' }}
          />

          {/* The Tray */}
          <motion.div
            ref={trayRef}
            initial={{ y: '100%' }}
            animate={{ y: `${closeProgress * 100}%` }}
            exit={{ y: '100%' }}
            transition={closeProgress > 0 ? { type: 'tween', ease: 'linear', duration: 0 } : { type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[90] flex flex-col bg-white/90 dark:bg-slate-900/95 border-t border-slate-200/80 dark:border-slate-700/80 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()} // Prevent click-through closing
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Saved Tasks
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Tasks you're not sure when to do. Drag in to save, drag out to schedule.
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} className="text-slate-600 dark:text-slate-300" />
              </button>
            </div>

            {/* Horizontal Scroll Content */}
            <div
              ref={scrollRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopDragging}
              onMouseLeave={stopDragging}
              className="flex gap-4 p-4 overflow-x-auto overflow-y-visible min-h-[140px] items-center no-scrollbar touch-manipulation"
            >
              {tasks.length === 0 ? (
                <div className="w-full text-center py-8 text-slate-400 text-sm italic">
                  No tasks for later. Drop some here!
                </div>
              ) : (
                tasks.map((t, i) => (
                  <div key={t.id} className="w-[300px] shrink-0 relative">
                    <TaskCard
                      innerRef={(el) => setCardRef(draggableIdFor(7, t.id), el)}
                      dragId={draggableIdFor(7, t.id)}
                      task={t}
                      menuOpen={menu?.id === t.id}
                      onToggleMenu={(rect) => {
                        setMenu((prev) => {
                          if (prev?.id === t.id) return null;
                          const MENU_W = 160;
                          const MENU_H = 60;
                          const GAP = 8; // increased gap
                          const MARGIN = 10;
                          const vw = typeof window !== 'undefined' ? window.innerWidth : 480;
                          const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
                          let left = rect.left + rect.width / 2 - MENU_W / 2;
                          left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
                          // Position below by default
                          let top = rect.bottom + GAP + 8; // added +8 for lower positioning
                          if (top + MENU_H > vh - MARGIN) {
                            top = rect.top - MENU_H - GAP;
                          }
                          top = Math.max(MARGIN, Math.min(top, vh - MENU_H - MARGIN));
                          return { id: t.id, top, left };
                        });
                      }}
                      hiddenWhileDragging={activeDragId === t.id}
                      isRepeating={t.type === 'weekly'}
                      touchAction="pan-x"
                      onGrab={(payload) => {
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
                            }
                        })
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </motion.div>

          <TaskMenu
            menu={menu}
            onClose={() => setMenu(null)}
            onDelete={() => {
              if (menu) {
                const t = tasks.find((it) => it.id === menu.id);
                if (t) setConfirmItem(t);
              }
              setMenu(null);
            }}
          />

          {/* Delete Dialog */}
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
