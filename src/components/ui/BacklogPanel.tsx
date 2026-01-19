'use client';

import * as React from 'react';

import { EllipsisVertical, CalendarClock, Plus, Loader2, Trash2, Pencil } from 'lucide-react';
import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import Fly from '@/components/ui/fly';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import TaskMenu from '../board/TaskMenu';
import useSWR from 'swr';
import TagPopup from '@/components/ui/TagPopup';

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
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);
  const isDraggingRef = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const isMenuOpen = menu?.id === item.id;
  const isExiting = exitAction?.id === item.id;

  React.useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

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
       // If clicking inside THIS task's actions or card, don't close via this handler
       // But clicking "Do Today" SHOULD probably close it? Maybe not.
       if (containerRef.current && containerRef.current.contains(e.target as Node)) {
           return;
       }
       setIsOpen(false);
    };

    window.addEventListener('task-swipe-open', handleOtherSwipe);
    if (isOpen) {
        window.addEventListener('click', handleGlobalClick, { capture: true }); 
    }
    
    return () => {
        window.removeEventListener('task-swipe-open', handleOtherSwipe);
        window.removeEventListener('click', handleGlobalClick, { capture: true });
    };
  }, [item.id, isOpen]);

  // State to track dragging for visual updates (e.g. keeping icons visible during drag)
  const [isDragging, setIsDragging] = React.useState(false);

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
        if (offset > 15 || velocity > 100) {
            setIsOpen(false);
        }
    } else {
        if (offset < -15 || velocity < -100) {
            setIsOpen(true);
             window.dispatchEvent(
                new CustomEvent('task-swipe-open', { detail: { id: `backlog:${item.id}` } })
            );
        }
    }
  };

  return (
    <motion.div
        ref={containerRef}
        layout
        initial={false}
        animate={
        isExiting
            ? {
                opacity: 0,
                x: -200,
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
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.95 }
        }
        transition={{ delay: index * 0.05 }}
        className={`group relative mb-3 rounded-xl ${isOpen ? 'z-20' : isMenuOpen ? 'z-50' : isExiting ? 'z-0' : 'z-auto'} ${isDesktop ? '' : 'overflow-hidden bg-muted/50'}`}
        style={{ zIndex: isMenuOpen ? 50 : isExiting ? 0 : isOpen ? 20 : 1 }}
    >
        {/* Swipe Actions Layer (Behind) */}
        <div 
             className={`absolute inset-y-0 right-0 flex items-center pr-2 gap-2 transition-opacity duration-200 ${isOpen || isDragging ? 'opacity-100' : 'opacity-0 delay-200'}`}
             aria-hidden={!isOpen}
          >
             <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuOpen(e, item);
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-background text-foreground shadow-sm hover:bg-background/80 transition-colors"
                title="Edit"
                tabIndex={isOpen ? 0 : -1}
             >
                <Pencil className="w-4 h-4" />
             </button>
             <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteRequest(item);
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 shadow-sm transition-colors"
                title="Delete"
                tabIndex={isOpen ? 0 : -1}
             >
               <Trash2 className="w-4 h-4" />
             </button>
        </div>

        {/* Foreground Card */}
        <motion.div
            drag={isDesktop ? false : "x"}
            dragDirectionLock={true}
            dragConstraints={{ left: -100, right: 0 }}
            dragElastic={0.05}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            animate={{ x: isOpen ? -100 : 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 28, mass: 1 }}
            className={`
                relative flex items-center gap-1.5 px-2 py-3.5 
                transition-colors duration-200 rounded-xl 
                border 
                ${isDesktop 
                    ? `md:hover:bg-card md:hover:border-border md:hover:shadow-sm ${isMenuOpen ? 'bg-card border-border shadow-md' : 'bg-transparent border-transparent'}` 
                    : `bg-card ${isOpen ? 'border-border shadow-sm' : 'border-transparent'}`
                }
            `}
            style={{ touchAction: 'pan-y' }}
            onClick={() => {
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

            {/* Actions */}
            <div className="relative flex items-center gap-2 shrink-0">
                {/* "Do Today!" Button - Always visible */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddToday(item);
                    }}
                    disabled={processingIds.has(item.id)}
                    className={`
                        group/btn flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold 
                        text-primary-foreground bg-primary 
                        active:scale-95 transition-all rounded-full shadow-md 
                        shadow-primary/20 disabled:opacity-50 disabled:pointer-events-none
                        ${isDesktop ? 'hover:bg-primary/90 hover:shadow-primary/40' : ''}
                    `}
                >
                    {processingIds.has(item.id) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Plus className="w-3.5 h-3.5 transition-transform md:group-hover/btn:rotate-90" />
                    )}
                    <span>Do Today!</span>
                </button>

                {/* Desktop Menu Button (3 Dots) - Only visible on desktop hover */}
                <div className={`
                    hidden md:block transition-opacity duration-200
                    ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}>
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
}: {
  later: BacklogItem[];
  onRefreshToday: () => Promise<void> | void;
  onRefreshBacklog: () => Promise<void> | void;
  onMoveToToday?: (item: BacklogItem) => Promise<void> | void;
  onAddRequested: () => void;
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

        {later.length > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-muted-foreground">
            {later.length}
          </span>
        )}
      </div>

      <div className="pb-2 space-y-3 overflow-visible min-h-[100px]">
        {later.length === 0 ? (
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
