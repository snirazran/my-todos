import {
  CheckCircle2,
  Circle,
  EllipsisVertical,
  CalendarCheck,
  RotateCcw,
  Trash2,
  Pencil,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
import { AnimatePresence, motion, PanInfo, useMotionValue, useTransform, animate } from 'framer-motion';
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  TouchSensor,
  Modifier,
} from '@dnd-kit/core';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';
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
  getTagDetails: (
    tagId: string
  ) => { id: string; name: string; color: string } | undefined;
  isDragDisabled?: boolean;
  isWeekly?: boolean;
  disableLayout?: boolean;
  onDoLater?: (task: Task) => void;
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
  disableLayout,
  onDoLater,
}: SortableTaskItemProps) {
  /* Swipe Logic */
  const [isOpen, setIsOpen] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const isDraggingRef = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  // Motion Values for Swipe
  const x = useMotionValue(0);
  const swipeThreshold = 60;

  // Transform values based on drag position x
  // Left Swipe (Negative X) -> Do Later (Indigo)
  const doLaterOpacity = useTransform(x, [0, -25], [0, 1]);
  const doLaterScale = useTransform(x, [0, -swipeThreshold], [0.8, 1.2]);
  // Instant color snap at threshold
  const doLaterColor = useTransform(x, [-swipeThreshold + 1, -swipeThreshold], ["#9ca3af", "#6366f1"]); // Slate to Indigo
  const doLaterTextColor = useTransform(x, [-swipeThreshold + 1, -swipeThreshold], ["#ffffff", "#ffffff"]);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: isDragDisabled || isOpen });

  useEffect(() => {
    const handleOtherSwipe = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.id !== task.id) {
        setIsOpen(false);
      }
    };
    
    // Global click listener to close on outside click
    const handleGlobalClick = (e: MouseEvent) => {
       if (!isOpen) return;
       
       // If clicking inside THIS task's actions or card, don't close via this handler
       if (containerRef.current && containerRef.current.contains(e.target as Node)) {
           return;
       }
       
       setIsOpen(false);
    };

    window.addEventListener('task-swipe-open', handleOtherSwipe);
    
    // Only attach click listener if open, using capture to ensure we get it
    if (isOpen) {
        window.addEventListener('click', handleGlobalClick, { capture: true }); 
    }
    
    return () => {
        window.removeEventListener('task-swipe-open', handleOtherSwipe);
        window.removeEventListener('click', handleGlobalClick, { capture: true });
    };
  }, [task.id, isOpen]);

  const handleDragStart = () => {
      isDraggingRef.current = true;
      setIsSwiping(true);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setTimeout(() => {
         isDraggingRef.current = false;
         setIsSwiping(false);
    }, 100);

    const offset = info.offset.x;
    const velocity = info.velocity.x;

    // Strict Spotify-like snap logic (Swapped: Right->Open)
    if (isOpen) {
        // If already open (Right Swipe state), closing needs Left motion
        if (offset < -15 || velocity < -100) {
            setIsOpen(false);
            window.dispatchEvent(
                new CustomEvent('task-swipe-open', { detail: { id: null } })
            );
        } else {
             // Snap back to open
             animate(x, 100, { type: "spring", stiffness: 600, damping: 28 });
        }
    } else {
        // Closed state
        // Opening: Swipe Right (Positive) -> Edit/Trash
        if (offset > 15 || velocity > 100) {
            setIsOpen(true);
             window.dispatchEvent(
                new CustomEvent('task-swipe-open', { detail: { id: task.id } })
            );
        }
        // Action: Swipe Left (Negative) -> Do Later
        else if (offset < -swipeThreshold && onDoLater) {
            onDoLater(task);
            animate(x, 0, { type: "spring", stiffness: 600, damping: 28 });
        }
        else {
             // Snap back
             animate(x, 0, { type: "spring", stiffness: 600, damping: 28 });
        }
    }
  };
  
  const handleCardClick = (e: React.MouseEvent) => {
      if (isDraggingRef.current) return;
      
      if (isOpen) {
          setIsOpen(false);
          return;
      }
      handleTaskToggle(task);
  };

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : isOpen ? 20 : isMenuOpen ? 50 : isExitingLater ? 0 : 1,
  };

  return (
    <div
      ref={(node: HTMLDivElement | null) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative mb-3 ${isDragging ? 'z-[100]' : 'z-auto'}`}
      data-is-active={!isDone}
    >
      <motion.div
        layout={!disableLayout && !isDragging}
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
        exit={isExitingLater ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        transition={{
            layout: { type: 'spring', stiffness: 250, damping: 25 },
        }}
        className={`group relative rounded-xl ${isDragging ? 'overflow-visible' : 'overflow-hidden bg-muted/50'}`}
      >
          {/* Swipe Actions Layer (Behind) - Now on Left (revealed by Right Swipe) */}
          <div 
             className={`absolute inset-y-0 left-0 flex items-center pl-2 gap-2 transition-opacity duration-200 ${isOpen || isSwiping ? 'opacity-100' : 'opacity-0 delay-200'}`}
             aria-hidden={!isOpen}
          >
             <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  onMenuOpen(e, task); 
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-background text-foreground shadow-sm hover:bg-background/80 transition-colors"
                title="More options"
                tabIndex={isOpen ? 0 : -1}
             >
                <Pencil className="w-4 h-4" />
             </button>
             <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  const event = new CustomEvent('task-delete-request', { detail: { id: task.id } });
                  window.dispatchEvent(event);
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 shadow-sm transition-colors"
                title="Delete"
                tabIndex={isOpen ? 0 : -1}
             >
               <Trash2 className="w-4 h-4" />
             </button>
          </div>

          {/* Swipe Actions Layer (Right - for Left Swipe - Do Later) */}
          <div 
              className="absolute inset-y-0 right-0 flex items-center pr-4"
          >
              <motion.div 
                  className="flex items-center justify-center w-8 h-8 rounded-full shadow-sm border border-transparent"
                  style={{ 
                      opacity: doLaterOpacity,
                      scale: doLaterScale,
                      color: doLaterTextColor,
                      backgroundColor: doLaterColor
                  }}
              >
                   <CalendarCheck className="w-5 h-5" />
              </motion.div>
          </div>

          {/* Foreground Card (Swipeable) */}
          <motion.div
            drag={isDesktop ? false : "x"}
            dragListener={!isDragging}
            dragDirectionLock={true} // Lock direction to prevent accidental diagonal swipes
            dragConstraints={{ left: -70, right: 100 }}
            dragElastic={0.1}
            dragMomentum={false}
            
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            animate={{ x: isOpen ? 100 : 0 }}
            style={{ x, touchAction: 'pan-y', cursor: 'grab' }}
            transition={{ type: "spring", stiffness: 600, damping: 28, mass: 1 }} // Snappier spring

            className={`
              relative flex items-center gap-1.5 px-2 py-3.5 
              transition-colors duration-200 rounded-xl 
              bg-card 
              border ${isOpen ? 'border-border shadow-sm' : 'border-transparent'} md:hover:border-border
              md:hover:shadow-sm
              select-none
              ${isDragging ? 'z-[100] opacity-100' : ''}
              ${isDone && !isDragging ? 'md:hover:bg-accent/50' : ''} 
              cursor-pointer
            `}
           // Note: We are using 'style' prop for x motion value to avoid re-renders
           // combined with the style object above, so we pass x via the style prop on the motion component directly
           onClick={handleCardClick}
          >
            <div className={`flex items-center flex-1 min-w-0 gap-3 pl-2 transition-opacity duration-200 ${isDone && !isDragging ? 'opacity-60' : 'opacity-100'}`}>
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
                          className="flex items-center justify-center w-full h-full transition-colors text-muted-foreground/50 md:hover:text-primary"
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
                    opacity: isDone ? 0.8 : 1, // Double ensure text is dimmed
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {task.text}
                </motion.span>
                {(isWeekly || (task.tags && task.tags.length > 0)) && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {isWeekly && (
                      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-900/40 dark:text-purple-200 border border-purple-100 dark:border-purple-800/50 uppercase tracking-wider">
                        <RotateCcw className="w-3 h-3" />
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
            </div>
            {/* Grab handle area for mobile if needed, or just edge drag */}

            {/* Desktop Hover Menu (3 Dots) */}
            <div className={`hidden md:group-hover:block absolute right-2 top-1/2 -translate-y-1/2 transition-opacity ${isDragging ? 'opacity-0' : 'opacity-100'}`}>
                 <button
                   className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors"
                   onClick={(e) => onMenuOpen(e, task)}
                   onPointerDown={(e) => e.stopPropagation()}
                   title="Options"
                 >
                   <EllipsisVertical className="w-5 h-5" />
                 </button>
            </div>
          </motion.div>
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
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [exitAction, setExitAction] = useState<{
    id: string;
    type: 'later';
  } | null>(null);
  const [dialog, setDialog] = useState<{
    task: Task;
    kind: 'regular' | 'weekly' | 'backlog';
  } | null>(null);

  const [tagPopup, setTagPopup] = useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });
  const [isAnyDragging, setIsAnyDragging] = useState(false);
  const activeAreaLimitsRef = React.useRef<{ top: number; bottom: number } | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isAnyDragging) {
      document.documentElement.classList.add('dragging');
      
      // Lock the scroll aggressively for the current gesture
      const handleTouchMove = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
      };
      
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      
      return () => {
        document.documentElement.classList.remove('dragging');
        window.removeEventListener('touchmove', handleTouchMove);
      };
    }
  }, [isAnyDragging]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
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

    const handleDeleteRequest = (e: Event) => {
        const id = (e as CustomEvent<{ id: string }>).detail?.id;
        const task = tasks.find(t => t.id === id);
        if (task) {
           setDialog({ task, kind: taskKind(task) });
           setMenu(null); // Close any open menu
        }
    };

    window.addEventListener('task-menu-open', closeIfOther as EventListener);
    window.addEventListener('task-delete-request', handleDeleteRequest as EventListener);

    return () => {
      window.removeEventListener('task-menu-open', closeIfOther as EventListener);
      window.removeEventListener('task-delete-request', handleDeleteRequest as EventListener);
    };
  }, [tasks]); // Added tasks dependency to find task
  
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

  const handleDragStart = () => {
    setIsAnyDragging(true);
    // Calculate boundary
    const activeNodes = document.querySelectorAll('[data-is-active="true"]');
    const container = scrollContainerRef.current;
    
    if (activeNodes.length > 0 && container) {
      const containerRect = container.getBoundingClientRect();
      const rects = Array.from(activeNodes).map(n => n.getBoundingClientRect());
      
      // Calculate limits relative to the container's *content* top
      // We add scrollTop because we want the position relative to the start of the scrollable content
      const top = Math.min(...rects.map(r => r.top - containerRect.top + container.scrollTop));
      const bottom = Math.max(...rects.map(r => r.bottom - containerRect.top + container.scrollTop));
      
      activeAreaLimitsRef.current = { top, bottom };
    } else {
      activeAreaLimitsRef.current = null;
    }
  };

  const handleDragCancel = () => {
    setIsAnyDragging(false);
    activeAreaLimitsRef.current = null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsAnyDragging(false);
    activeAreaLimitsRef.current = null;
    const { active, over } = event;

    if (!over || !onReorder) return;

    if (active.id !== over.id) {
      const activeTasks = tasks.filter((t) => !t.completed && !vSet.has(t.id));
      const oldIndex = activeTasks.findIndex((t) => t.id === active.id);
      
      if (oldIndex === -1) return;

      let newIndex = activeTasks.findIndex((t) => t.id === over.id);

      // If we are hovering over a completed task (which isn't in activeTasks),
      // we should treat it as dragging to the end of the active list.
      if (newIndex === -1) {
        const overTask = tasks.find((t) => t.id === over.id);
        if (overTask && (overTask.completed || vSet.has(overTask.id))) {
          newIndex = activeTasks.length - 1;
        }
      }

      if (newIndex !== -1 && oldIndex !== newIndex) {
        const newActiveTasks = arrayMove(activeTasks, oldIndex, newIndex);
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

  const restrictToActiveArea: Modifier = ({ transform, draggingNodeRect }) => {
     const limits = activeAreaLimitsRef.current;
     const container = scrollContainerRef.current;

     // Apply parent restriction first
     const parentRestricted = restrictToParentElement({ transform, draggingNodeRect } as any);
     const verticalRestricted = restrictToVerticalAxis({ transform: parentRestricted, draggingNodeRect } as any);
     
     if (limits !== null && draggingNodeRect && container) {
        const containerRect = container.getBoundingClientRect();
        const currentScrollTop = container.scrollTop;
        
        // Calculate absolute viewport boundaries for the active area based on current scroll
        const limitTop = containerRect.top - currentScrollTop + limits.top;
        const limitBottom = containerRect.top - currentScrollTop + limits.bottom;
        
        let newY = verticalRestricted.y;
        
        // Bottom restriction
        const currentBottom = draggingNodeRect.bottom + newY;
        if (currentBottom > limitBottom) {
           newY = limitBottom - draggingNodeRect.bottom;
        }

        // Top restriction
        const currentTop = draggingNodeRect.top + newY;
        if (currentTop < limitTop) {
           newY = limitTop - draggingNodeRect.top;
        }

        return {
           ...verticalRestricted,
           y: newY
        };
     }
     return verticalRestricted;
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

        <div
          className="pb-2 space-y-0 overflow-y-auto min-h-[100px] max-h-[600px] no-scrollbar [mask-image:linear-gradient(to_bottom,black_90%,transparent)]"
          ref={scrollContainerRef}
        >
          {tasks.length === 0 && (
            <button
              onClick={() => onAddRequested('', null, { preselectToday: true })}
              className="w-full flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-xl transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-center w-14 h-14 mb-3 transition-all border rounded-full bg-muted border-muted-foreground/10 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100">
                 <Fly size={32} y={-4} />
              </div>
              <p className="text-sm font-bold text-muted-foreground group-hover:text-primary transition-colors">Start your day</p>
              <p className="mt-1 text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                Tap to add your first task
              </p>
            </button>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            modifiers={[restrictToActiveArea]}
          >
            <div className="relative">
              {/* Unified Tasks Container */}
              <div className="relative overflow-visible">
                <SortableContext
                  items={activeTaskIds}
                  strategy={verticalListSortingStrategy}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {[
                      ...tasks.filter((t) => !t.completed && !vSet.has(t.id)),
                      ...tasks.filter((t) => t.completed || vSet.has(t.id)),
                    ].map((task) => {
                      const isCompleted = task.completed || vSet.has(task.id);
                      const isMenuOpen = menu?.id === task.id;
                      const isExitingLater =
                        exitAction?.id === task.id &&
                        exitAction.type === 'later';

                      return (
                        <SortableTaskItem
                          key={task.id}
                          task={task}
                          isDone={isCompleted}
                          isMenuOpen={isMenuOpen}
                          isExitingLater={isExitingLater}
                          renderBullet={renderBullet}
                          handleTaskToggle={handleTaskToggle}
                          onMenuOpen={openMenu}
                          getTagDetails={getTagDetails}
                          isDragDisabled={isCompleted}
                          isWeekly={taskKind(task) === 'weekly'}
                          disableLayout={isAnyDragging}
                          onDoLater={onDoLater ? (t) => {
                             setExitAction({ id: t.id, type: 'later' });
                             onDoLater(t.id);
                          } : undefined}
                        />
                      );
                    })}
                  </AnimatePresence>
                </SortableContext>
             </div>
            </div>
          </DndContext>
        </div>
      </div>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        isDone={
          menu
            ? tasks.find((t) => t.id === menu.id)?.completed ||
              vSet.has(menu.id)
            : false
        }
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
        isWeekly={
          menu
            ? tasks.find((t) => t.id === menu.id)?.type === 'weekly' ||
              (menu && weeklyIds.has(menu.id))
            : false
        }
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
        initialTags={tasks.find((t) => t.id === tagPopup.taskId)?.tags}
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
