'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Task, draggableIdFor } from './helpers';
import TaskCard from './TaskCard';
import { DragState } from './hooks/useDragManager';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onGrab: (params: any) => void;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
  drag: DragState | null;
  trayRef?: React.RefObject<HTMLDivElement>;
  closeProgress?: number; // 0 = fully open, 1 = fully closed
}

export default function BacklogTray({
  isOpen,
  onClose,
  tasks,
  onGrab,
  setCardRef,
  drag,
  trayRef,
  closeProgress = 0,
}: Props) {
  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

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
                  Later This Week
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Drag tasks here to save them for later. Drag out to schedule.
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
              className="flex gap-4 p-4 overflow-x-auto overflow-y-visible min-h-[140px] items-center no-scrollbar"
            >
              {tasks.length === 0 ? (
                <div className="w-full text-center py-8 text-slate-400 text-sm italic">
                  No tasks for later. Drop some here!
                </div>
              ) : (
                tasks.map((t, i) => (
                  <div key={t.id} className="w-[300px] shrink-0 relative">
                     {/* 
                        We wrap TaskCard. 
                        Note: TaskCard expects to be in a list usually, but here it's horizontal.
                        We need to ensure the DragManager can handle grabbing from here.
                     */}
                    <TaskCard
                      innerRef={(el) => setCardRef(draggableIdFor(7, t.id), el)}
                      dragId={draggableIdFor(7, t.id)}
                      task={t}
                      menuOpen={false} // Context menu might be tricky in horizontal layout, simplify for now
                      onToggleMenu={() => {}}
                      hiddenWhileDragging={!!drag?.active && drag.taskId === t.id}
                      isRepeating={t.type === 'weekly'}
                      onGrab={(payload) => {
                        onGrab({
                            day: 7, // 7 is our Backlog index
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
        </>
      )}
    </AnimatePresence>
  );
}
