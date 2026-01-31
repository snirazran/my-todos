'use client';

import * as React from 'react';

import { EllipsisVertical, CalendarClock, CalendarCheck, Plus, Loader2, Trash2 } from 'lucide-react';
import { animate, useMotionValue, useTransform, motion, AnimatePresence, useAnimation, PanInfo } from "framer-motion";
import Fly from '@/components/ui/fly';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import TaskMenu from '../board/TaskMenu';
import useSWR from 'swr';
import TagPopup from '@/components/ui/TagPopup';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';

type BacklogItem = { id: string; text: string; tags?: string[] };

function BacklogTaskItem({
  item,
  index,
  menu,
  processingIds,
  exitAction,
  onAddToday,
  onMenuOpen,
  onDeleteRequest,
  getTagDetails,
  allowNudge,
}: {
  item: BacklogItem;
  index: number;
  menu: { id: string } | null;
  processingIds: Set<string>;
  exitAction: { id: string } | null;
  onAddToday: (item: BacklogItem) => void;
  onMenuOpen: (e: React.MouseEvent, item: BacklogItem) => void;
  onDeleteRequest: (item: BacklogItem) => void;
  getTagDetails: (id: string) => { name: string; color: string } | undefined;
  allowNudge: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);
  const isDraggingRef = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isNudging, setIsNudging] = React.useState(false);

  // Motion Values for Spotify-like swipe (Swapped: Now Left Swipe trigges Plus)
  const x = useMotionValue(0);
  const swipeThreshold = 60;

  // Transform values based on drag position x (Negative for Left Swipe)
  const doTodayOpacity = useTransform(x, [0, -25], [0, 1]);
  const doTodayScale = useTransform(x, [0, -swipeThreshold], [0.8, 1.2]);
  // Instant color snap at threshold
  // Dynamic color snap at threshold (Gray -> Green)
  const dynaColor = useTransform(x, [-swipeThreshold + 1, -swipeThreshold], ["#9ca3af", "#16a34a"]);
  const doTodayColor = isNudging ? "#16a34a" : dynaColor;

  const doTodayTextColor = useTransform(x, [-swipeThreshold + 1, -swipeThreshold], ["#ffffff", "#ffffff"]);
  const doTodayBgOpacity = useTransform(x, [-40, -swipeThreshold], [0, 1]);

  const isMenuOpen = menu?.id === item.id;
  const isExiting = exitAction?.id === item.id;

  React.useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // "The Nudge" - Discovery animation for new users (on mobile)
  const initialIndex = React.useRef(index);

  React.useEffect(() => {
    // Only nudge the first 2 items, only on mobile, only once on mount
    // checking initialIndex ensures we don't nudge items that *slide into* the top spots later
    // allowNudge ensures we don't nudge items that are added later (after the panel is already open)
    if (!isDesktop && initialIndex.current < 2 && allowNudge) {
      const timeout = setTimeout(() => {
        setIsNudging(true);
        // Peek: Slide to -60px (Left) - MUCH slower/smoother
        animate(x, -60, {
          type: "spring",
          stiffness: 150,
          damping: 25
        });

        // Snap back with a longer stay
        setTimeout(() => {
          animate(x, 0, {
            type: "spring",
            stiffness: 150,
            damping: 25
          });
          // Reset nudging after snap back completes (longer timeout to match slower spring)
          setTimeout(() => setIsNudging(false), 500);
        }, 800);
      }, 800 + (initialIndex.current * 200));

      return () => clearTimeout(timeout);
    }
  }, [isDesktop, x, allowNudge]);

  // Sync swipe close with other interactions
  React.useEffect(() => {
    const handleOtherSwipe = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.id !== `backlog:${item.id}`) {
        setIsOpen(false);
      }
    };

    const handleGlobalClick = (e: MouseEvent) => {
      if (!isOpen) return;
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    window.addEventListener('task-swipe-open', handleOtherSwipe);
    if (isOpen) {
      window.addEventListener('click', handleGlobalClick, { capture: true });

      // Also close on scroll
      const handleScroll = () => {
        setIsOpen(false);
      };
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

      return () => {
        window.removeEventListener('task-swipe-open', handleOtherSwipe);
        window.removeEventListener('click', handleGlobalClick, { capture: true });
        window.removeEventListener('scroll', handleScroll, { capture: true });
      };
    }

    return () => {
      window.removeEventListener('task-swipe-open', handleOtherSwipe);
    };
  }, [item.id, isOpen]);

  // State to track dragging for visual updates (e.g. keeping icons visible during drag)
  const [isDragging, setIsDragging] = React.useState(false);
  const [hasTriggeredExit, setHasTriggeredExit] = React.useState(false); // Immediate exit tracking

  // Sync exit state
  React.useEffect(() => {
    if (isExiting) {
      setHasTriggeredExit(true);
    }
  }, [isExiting]);

  const handleDragStart = () => {
    isDraggingRef.current = true;
    setIsDragging(true);
  };



  const handleDragEnd = (_: any, info: PanInfo) => {
    setTimeout(() => {
      isDraggingRef.current = false;
      setIsDragging(false);
    }, 100);

    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (isOpen) {
      // If already open (Right Swipe -> Trash State) | x is positive (~100)
      // Close if we swipe left a bit
      if (offset < -15 || velocity < -100) {
        setIsOpen(false);
      } else {
        // Snap back to 100 (Trash visible)
        animate(x, 100, { type: "spring", stiffness: 600, damping: 28 });
      }
    } else {
      // Closed state
      // Check for Right Swipe (Trash/Edit) -> Positive Offset
      // Increased threshold to 60
      if (offset > 60 || velocity > 200) {
        setIsOpen(true);
        window.dispatchEvent(
          new CustomEvent('task-swipe-open', { detail: { id: `backlog:${item.id}` } })
        );
      }
      // Check for Left Swipe (Plus) -> Negative Offset
      else if (offset < -swipeThreshold) {
        // Trigger Add Today with clean exit
        setHasTriggeredExit(true); // Immediately hide menu
        setIsOpen(false); // Close menu immediately for clean exit
        window.dispatchEvent(
          new CustomEvent('task-swipe-open', { detail: { id: null } })
        );
        onAddToday(item);
        // Continue the movement outwards with smooth timing
        // Use larger distance for desktop (wider container) vs mobile
        const exitDistance = isDesktop ? -800 : -450;
        animate(x, exitDistance, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
      }
      else {
        // Not enough swipe - Snap back
        animate(x, 0, { type: "spring", stiffness: 600, damping: 28 });
      }
    }
  };

  return (
    <motion.div
      ref={containerRef}
      layout={!isDragging && !isExiting}
      initial={false}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={
        isExiting
          ? { opacity: 1 }
          : { opacity: 0, scale: 0.95 }
      }
      transition={{ delay: index * 0.05 }}
      className={`group relative mb-3 rounded-xl ${isOpen ? 'z-20' : isMenuOpen ? 'z-50' : isExiting ? 'z-0' : 'z-auto'} ${isDesktop ? '' : 'overflow-hidden bg-muted/50'} ${isExiting ? 'will-change-transform' : ''}`}
      style={{ zIndex: isMenuOpen ? 50 : isExiting ? 0 : isOpen ? 20 : 1 }}
    >
      {/* Swipe Actions Layer (Left - for Right Swipe - Trash) */}
      {!isDesktop && (
        <div
          className={`absolute inset-y-0 left-0 flex items-center pl-2 gap-2 transition-opacity ${!(isExiting || hasTriggeredExit) && (isOpen || isDragging) ? 'opacity-100 duration-200' : (isExiting || hasTriggeredExit) ? 'opacity-0 duration-0' : 'opacity-0 duration-200 delay-200'}`}
          aria-hidden={!isOpen || isExiting || hasTriggeredExit}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(item);
            }}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 shadow-sm transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMenuOpen(e, item);
            }}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-background text-foreground shadow-sm hover:bg-background/80 transition-colors"
            title="More options"
          >
            <EllipsisVertical className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Swipe Actions Layer (Right - for Left Swipe - Plus) */}
      {!isDesktop && (
        <div
          className="absolute inset-y-0 right-0 flex items-center pr-4"
        >
          <motion.div
            className="flex items-center justify-center w-8 h-8 rounded-full shadow-sm border border-transparent"
            style={{
              opacity: doTodayOpacity,
              scale: doTodayScale,
              color: doTodayTextColor,
              backgroundColor: doTodayColor
            }}
          >
            <CalendarCheck className="w-5 h-5" />
          </motion.div>
        </div>
      )}

      {/* Foreground Card */}
      <motion.div
        drag={(isDesktop || isNudging) ? false : "x"}
        dragDirectionLock={true}
        dragConstraints={{ left: -70, right: 100 }} // Left: Plus (-70), Right: Trash (100)
        dragElastic={0.1} // More elasticity for the "pull" feel
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        initial={false}
        animate={{ x: isExiting ? (isDesktop ? -800 : -450) : (isOpen ? 100 : 0) }}
        style={{
          touchAction: 'pan-y',
          willChange: isExiting ? 'transform' : 'auto',
          x: x // Always use motion value
        }}
        transition={
          isExiting
            ? {
              type: "tween",
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1]
            }
            : { type: "spring", stiffness: 600, damping: 28, mass: 1 }
        }
        className={`
                relative flex items-center gap-1.5 px-2 py-3.5 
                transition-colors duration-200 rounded-xl 
                border border-border/40 shadow-sm
                ${isDesktop
            ? `md:hover:bg-card md:hover:border-border ${isMenuOpen ? 'bg-card border-border shadow-md' : 'bg-transparent'}`
            : `bg-card ${(isOpen || isDragging || isNudging) ? '' : ''}`
          }
                ${isExiting ? 'pointer-events-none' : ''}
            `}
        onClick={() => {
          if (isNudging) return;
          if (isOpen) setIsOpen(false);
        }}
      >
        {/* Content Container (Matches TaskList structure) */}
        <div className="flex items-center flex-1 min-w-0 gap-3 pl-2">
          {/* Fly Icon */}
          <div className="flex items-center justify-center flex-shrink-0 w-7 h-7">
            <Fly
              size={28}
              y={-4}
              x={-2}
              className="text-primary transition-all opacity-70 grayscale md:group-hover:grayscale-0 md:group-hover:opacity-100"
            />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <span className="block text-base font-medium md:text-lg text-foreground">
              {item.text}
            </span>

            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                <AnimatePresence mode="popLayout">
                  {item.tags.map((tagId) => {
                    const tagDetails = getTagDetails(tagId);
                    if (!tagDetails) return null;
                    const { color, name } = tagDetails;

                    return (
                      <motion.span
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        transition={{ duration: 0.2 }}
                        key={tagId}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider transition-colors border shadow-sm ${!color
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

        {/* Actions */}
        <div className="relative flex items-center gap-1 shrink-0">
          {/* Desktop Group: Add Today + Menu */}
          <div className={`
                    hidden md:flex items-center gap-1 transition-opacity duration-200
                    ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}>
            {/* Hover Toggle "Do Today" Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToday(item);
              }}
              disabled={processingIds.has(item.id)}
              className="p-2 rounded-lg text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              title="Do Today"
            >
              {processingIds.has(item.id) ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>

            {/* 3-Dots Menu */}
            <button
              className={`
                            p-2 rounded-lg transition-colors
                            ${isMenuOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}
                        `}
              onClick={(e) => onMenuOpen(e, item)}
            >
              <EllipsisVertical className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function BacklogPanel({
  later,
  onRefreshToday,
  onRefreshBacklog,
  onMoveToToday,
  onAddRequested,
  onEditTask,
  pendingToBacklog,
  tags,
}: {
  later: BacklogItem[];
  onRefreshToday: () => Promise<void> | void;
  onRefreshBacklog: () => Promise<void> | void;
  onMoveToToday?: (item: BacklogItem) => Promise<void> | void;
  onAddRequested: () => void;
  onEditTask?: (taskId: string, newText: string) => Promise<void> | void;
  pendingToBacklog?: number;
  tags?: { id: string; name: string; color: string }[];
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

  const userTags = tags || [];

  const getTagDetails = (tagIdentifier: string) => {
    // Try to find by ID first
    const byId = userTags.find((t) => t.id === tagIdentifier);
    if (byId) return byId;
    // Fallback: try to find by Name
    return userTags.find((t) => t.name === tagIdentifier);
  };

  const handleTagSave = async (taskId: string, newTags: string[]) => {
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

    } catch (e) {
      console.error("Failed to update tags", e);
    }
  };

  // Only allow nudges in the first 1s of mounting
  const [allowNudge, setAllowNudge] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setAllowNudge(false), 1000);
    return () => clearTimeout(t);
  }, []);

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
    setTimeout(() => setExitAction(null), 600); // Clear after animation

    try {
      if (onMoveToToday) {
        // Break batching to preserve exit animation
        setTimeout(() => onMoveToToday(item), 0);
        return;
      }

      const dow = new Date().getDay();
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

  const handleMenuOpen = (e: React.MouseEvent, t: BacklogItem) => {
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

        <TaskCounter count={later.length} pendingCount={pendingToBacklog} />
      </div>

      <div
        className={`pb-2 space-y-0 overflow-y-auto min-h-[100px] max-h-[600px] no-scrollbar [mask-image:linear-gradient(to_bottom,black_90%,transparent)] ${exitAction ? 'overflow-x-visible' : 'overflow-x-hidden'}`}
      >
        {later.length === 0 && !exitAction ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <button
              onClick={onAddRequested}
              className="w-full flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-xl transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-center w-14 h-14 mb-3 transition-all border rounded-full bg-muted border-muted-foreground/10 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100">
                <Fly size={32} y={-4} />
              </div>
              <p className="text-sm font-bold text-muted-foreground group-hover:text-primary transition-colors">Start your backlog</p>
              <p className="mt-1 text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                Tap to save a task for later
              </p>
            </button>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {later.map((t, i) => (
              <BacklogTaskItem
                key={t.id}
                item={t}
                index={i}
                menu={menu}
                processingIds={processingIds}
                exitAction={exitAction}
                onAddToday={addToday}
                onMenuOpen={handleMenuOpen}
                onDeleteRequest={(item) => setConfirmId(item)}
                getTagDetails={getTagDetails}
                allowNudge={allowNudge}
              />
            ))}
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
        onEdit={(taskId) => {
          const t = later.find((it) => it.id === taskId);
          if (t) {
            // HACK: Use confirmId state but prefix ID to distinguish Edit vs Delete
            // Or add separate state. Let's add separate state if possible? No, reusing is cleaner for this quick implementation?
            // Actually, let's just make a new object:
            setConfirmId({ ...t, id: `EDIT-${t.id}` });
          }
          setMenu(null);
        }}
        onDoToday={() => {
          if (menu) {
            const t = later.find((it) => it.id === menu.id);
            if (t) addToday(t);
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

      {/* Reusing Busy/Delete state for Edit as well, or simpler to separate? Simple to reuse confirmId for dialog logic but we need text editing */}
      {/* For Backlog, we only have one delete variant. Let's add Edit Dialog separately */}
      <EditTaskDialog
        open={!!confirmId && confirmId.id.startsWith('EDIT-')}
        initialText={confirmId && confirmId.id.startsWith('EDIT-') ? confirmId.text : ''}
        busy={busy}
        onClose={() => setConfirmId(null)}
        onSave={async (newText) => {
          if (confirmId && onEditTask) {
            // Strip prefix
            const realId = confirmId.id.replace('EDIT-', '');
            setBusy(true);
            await onEditTask(realId, newText);
            setBusy(false);
            setConfirmId(null);
          }
        }}
      />

      <DeleteDialog
        open={!!confirmId && !confirmId.id.startsWith('EDIT-')}
        variant="backlog"
        itemLabel={confirmId?.text}
        busy={busy}
        onClose={() => {
          if (!busy) setConfirmId(null);
        }}
        onDeleteAll={() => {
          if (!confirmId) return;
          removeLater(confirmId.id).then(() => setConfirmId(null));
        }}
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
    </div>
  );
}
// Helper component for add-only animation
// Helper component for add-only animation
function TaskCounter({ count, pendingCount }: { count: number; pendingCount?: number }) {
  const controls = useAnimation();
  const prevCount = React.useRef(count);

  React.useEffect(() => {
    if (count > prevCount.current) {
      // Only animate if count INCREASED
      controls.start({
        scale: [1, 1.35, 1],
        color: ["hsl(var(--muted-foreground))", "hsl(var(--primary))", "hsl(var(--muted-foreground))"],
        transition: { duration: 0.3, ease: "easeInOut" }
      });
    }
    prevCount.current = count;
  }, [count, controls]);

  if (count === 0 && (!pendingCount || pendingCount === 0)) return null;

  return (
    <div className="flex items-center gap-1.5">
      {count > 0 && (
        <motion.span
          animate={controls}
          className={`flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1 text-[11px] font-bold text-muted-foreground ${count === 0 ? 'hidden' : ''}`}
        >
          {count}
        </motion.span>
      )}
      {(pendingCount ?? 0) > 0 && (
        <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground/60" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
    </div>
  );
}
