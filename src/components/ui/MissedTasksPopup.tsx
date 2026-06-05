'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CalendarCheck, CalendarClock, CalendarPlus, CheckCircle2, FolderOpen, Loader2, RotateCcw, X } from 'lucide-react';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { type FrogHandle } from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useNotification } from '@/components/providers/NotificationProvider';
import { cn } from '@/lib/utils';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';
import type { Task } from '@/hooks/useTaskData';

const FLY_PX = 24;

export type MissedTasksStatus = {
  today: string;
  yesterday: string;
  reviewedToday: boolean;
  isPremium: boolean;
  flyBalance: number;
  completionCost: number;
  items: MissedTaskItem[];
};

export type MissedTaskItem = Task & {
  date: string;
  type: 'regular' | 'weekly';
};

type RepeatMoveMode = 'change-repeat' | 'just-once';

type Props = {
  show: boolean;
  status: MissedTasksStatus;
  tags: { id: string; name: string; color: string }[];
  hunger?: number;
  maxHunger?: number;
  questClaimableCount?: number;
  questActiveCount?: number;
  isPremium?: boolean;
  onClose: () => void;
  onItemResolved: (id: string, flyBalance?: number) => void | Promise<void>;
  onStatusChanged: () => void | Promise<void>;
};

export function MissedTasksPopup({
  show,
  status,
  tags,
  hunger,
  maxHunger,
  questClaimableCount = 0,
  questActiveCount = 0,
  isPremium = false,
  onClose,
  onItemResolved,
  onStatusChanged,
}: Props) {
  const [items, setItems] = useState<MissedTaskItem[]>(status.items);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [repeatChoiceId, setRepeatChoiceId] = useState<string | null>(null);
  const [localFlyBalance, setLocalFlyBalance] = useState(status.flyBalance);
  const { showNotification } = useNotification();

  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const { indices } = useWardrobeIndices(true);

  const {
    vp,
    cinematic,
    grab,
    tipGroupEl,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
    speedUpTongue,
  } = useFrogTongue({ frogRef, frogBoxRef, flyRefs, scrollContainerRef });
  const overscrollDrag = useSheetOverscrollDrag();

  useEffect(() => {
    if (!show) return;
    setItems(status.items.filter((item) => !resolvedIds.has(item.id)));
    setLocalFlyBalance(status.flyBalance);
    setRepeatChoiceId(null);
  }, [show, status.items, status.flyBalance, resolvedIds]);

  useEffect(() => {
    if (!show) {
      setResolvedIds(new Set());
    }
  }, [show, status.today]);

  useEffect(() => {
    if (!cinematic) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const stop = (event: Event) => event.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('wheel', stop);
      el.removeEventListener('touchmove', stop);
    };
  }, [cinematic]);

  const activeCount = items.length;
  const completedCount = status.items.length - activeCount;
  const totalCount = status.items.length;
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const taskItems = items;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const dismiss = async () => {
    await fetch('/api/missed-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss', timezone }),
    });
    onClose();
    void onStatusChanged();
  };

  const removeItem = async (id: string) => {
    setResolvedIds((current) => new Set(current).add(id));
    setItems((current) => current.filter((item) => item.id !== id));
    setRepeatChoiceId((current) => (current === id ? null : current));
  };

  const runAction = async (
    item: MissedTaskItem,
    action: 'complete' | 'save-later' | 'do-today',
    mode?: RepeatMoveMode,
  ) => {
    setBusyId(item.id);
    try {
      const res = await fetch('/api/missed-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          taskId: item.id,
          mode,
          timezone,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update missed item');
      }

      if (typeof data.flyBalance === 'number') {
        setLocalFlyBalance(data.flyBalance);
      }

      if (action === 'complete') {
        showNotification(
          data.awarded
            ? (
                <div className="flex items-center gap-3 pr-2">
                  <Fly size={28} y={-4} />
                  <div className="flex flex-col leading-none">
                    <span className="font-black text-base">
                      +1 Fly Collected!
                    </span>
                    <span className="text-[10px] text-muted-foreground font-bold mt-0.5 uppercase tracking-wider">
                      Keep it up!
                    </span>
                  </div>
                </div>
              )
            : 'Marked as done yesterday',
        );
      } else if (action === 'save-later') {
        showNotification('Moved to Saved Tasks');
      } else {
        showNotification('Moved to Today');
      }

      await onItemResolved(item.id, data.flyBalance);
      await removeItem(item.id);
      return true;
    } catch (error) {
      console.error('Missed task action failed', error);
      showNotification('Could not update missed item');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const completeItem = async (item: MissedTaskItem) => {
    if (busyId || cinematic || grab) return;

    await triggerTongue({
      key: item.id,
      completed: true,
      onPersist: async () => {
        await runAction(item, 'complete');
      },
    });
  };

  const moveToToday = async (item: MissedTaskItem, mode?: RepeatMoveMode) => {
    if (busyId || cinematic || grab) return;
    if (item.type === 'weekly' && !mode) {
      setRepeatChoiceId(item.id);
      return;
    }
    await runAction(item, 'do-today', mode);
  };

  const getTagDetails = (tagIdentifier: string) => {
    const byId = tags.find((tag) => tag.id === tagIdentifier);
    if (byId) return byId;
    return tags.find((tag) => tag.name === tagIdentifier);
  };

  // Keep the sheet mounted when `show` flips to false so BaseSheet's
  // AnimatePresence can play the slide-down exit instead of vanishing.
  if (status.items.length === 0) return null;

  const isBusy = !!busyId || cinematic;

  return (
    <>
      <BaseSheet
        open={show}
        onOpenChange={(open) => {
          if (!open) void dismiss();
        }}
        className="h-[92vh] sm:h-[88vh] sm:max-w-[620px] bg-background"
        zIndex={1070}
      >
        {({ isDesktop, dragControls, isDragging }) => {
          overscrollDrag.setContext(dragControls, !isDesktop);
          return (
          <div ref={sheetRef} className="relative flex h-full flex-col">
            <div
              onPointerDown={(event) => !isDesktop && !cinematic && dragControls.start(event)}
              className="shrink-0 border-b border-border/50 px-4 py-4 md:px-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <CalendarCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-black leading-tight tracking-tight text-foreground">
                      Did you finish yesterday&apos;s <span className="text-primary">tasks?</span>
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => void dismiss()}
                  disabled={isBusy}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-all hover:bg-muted disabled:opacity-50"
                  aria-label="Skip missed tasks"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div
              ref={(el) => {
                scrollContainerRef.current = el;
                overscrollDrag.bind(el);
              }}
              className="flex-1 min-h-0 overflow-y-auto pb-24 overscroll-none"
              style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
            >
              <div className="relative px-3 pt-1 pb-10">
                <picture
                  aria-hidden
                  className="absolute top-0 -bottom-2 inset-x-0 -z-10 pointer-events-none"
                >
                  <img
                    src="/yesterday.webp"
                    alt=""
                    className="w-full h-full object-cover object-top"
                  />
                </picture>
                <FrogDisplay
                  frogRef={frogRef}
                  frogBoxRef={frogBoxRef}
                  indices={indices}
                  flyBalance={localFlyBalance}
                  rate={completionRate}
                  done={completedCount}
                  total={totalCount}
                  openWardrobe={wardrobeOpen}
                  onOpenChange={setWardrobeOpen}
                  mouthOpen={!!grab}
                  mouthOffset={{ y: -4 }}
                  hunger={hunger}
                  maxHunger={maxHunger}
                  animateHunger
                  isCatching={cinematic}
                  questClaimableCount={questClaimableCount}
                  questActiveCount={questActiveCount}
                  paused={wardrobeOpen || isDragging}
                  showSpeechBubble={false}
                />
              </div>
              <div
                className="relative z-20 -mt-4 flex flex-col gap-2 rounded-t-[24px] bg-background px-3 pt-6 pb-4 before:absolute before:inset-x-0 before:bottom-0 before:top-8 before:-z-10 before:bg-background"
              >
              {items.length === 0 ? (
                <div className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center">
                  <p className="text-sm font-black text-foreground">
                    All caught up.
                  </p>
                  <button
                    onClick={() => void dismiss()}
                    className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-sm"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {taskItems.length > 0 && (
                    <div className="flex items-center gap-2 ml-3 px-2 md:px-0">
                      <CalendarCheck className="w-5 h-5 text-primary" />
                      <span className="text-sm font-black tracking-tight lowercase text-foreground">
                        {taskItems.length} {taskItems.length === 1 ? 'fly' : 'flies'} from yesterday
                      </span>
                    </div>
                  )}
                  <div className="w-full rounded-[18px] bg-card/40 border border-border/50 shadow-sm overflow-hidden p-2 space-y-1.5">
                  {taskItems.map((item) => {
                    const showRepeatChoice = repeatChoiceId === item.id;
                    const itemBusy = busyId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="relative w-full rounded-xl border border-border/50 bg-card px-2 py-2 shadow-sm shadow-black/5 dark:shadow-black/20"
                      >
                        <div className="flex items-center gap-2 pl-1.5">
                          <div className="relative flex-shrink-0 w-10 h-10">
                            <div
                              ref={(node) => {
                                if (node) flyRefs.current[item.id] = node;
                                else delete flyRefs.current[item.id];
                              }}
                              className={cn(
                                'flex items-center justify-center w-10 h-10 border rounded-full bg-muted border-muted-foreground/10 shrink-0',
                                visuallyDone.has(item.id) && 'opacity-0',
                              )}
                            >
                              {itemBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              ) : (
                                <Fly size={36} y={-3} x={0} paused={isBusy} />
                              )}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            {item.tags && item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {item.tags.map((tagId) => {
                                  const tag = getTagDetails(tagId);
                                  if (!tag) return null;
                                  return (
                                    <span
                                      key={tagId}
                                      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-normal shadow-sm transition-colors"
                                      style={{
                                        backgroundColor: `${tag.color}20`,
                                        borderColor: `${tag.color}40`,
                                        color: tag.color,
                                      }}
                                    >
                                      {tag.name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold leading-snug break-words text-foreground">
                                {item.text}
                              </span>
                              {item.type === 'weekly' && (
                                <RotateCcw className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                              )}
                            </span>

                            <div className="mt-3 flex flex-wrap items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => void completeItem(item)}
                                disabled={isBusy}
                                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[10px] font-black uppercase tracking-[0.08em] text-primary-foreground shadow-sm ring-1 ring-primary/40 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Did Yesterday
                              </button>
                              <button
                                type="button"
                                onClick={() => void runAction(item, 'save-later')}
                                disabled={isBusy}
                                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-[10px] font-black uppercase tracking-[0.08em] text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-50"
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                                Do Later
                              </button>
                              <button
                                type="button"
                                onClick={() => void moveToToday(item)}
                                disabled={isBusy}
                                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-primary shadow-sm transition-all hover:bg-primary/15 active:scale-95 disabled:opacity-50"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                                Do Today
                              </button>
                            </div>
                          </div>
                        </div>

                        {showRepeatChoice && (
                          <div className="mt-2 ml-11 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2">
                            <p className="text-[11px] font-bold leading-snug text-emerald-700 dark:text-emerald-300">
                              This repeats weekly. Move only yesterday's missed
                              instance, or change the repeat day to today?
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => void moveToToday(item, 'just-once')}
                                disabled={isBusy}
                                className="h-8 rounded-xl bg-card px-3 text-[10px] font-black uppercase tracking-wider text-foreground ring-1 ring-border/70 disabled:opacity-50"
                              >
                                Just Today
                              </button>
                              <button
                                type="button"
                                onClick={() => void moveToToday(item, 'change-repeat')}
                                disabled={isBusy}
                                className="h-8 rounded-xl bg-emerald-600 px-3 text-[10px] font-black uppercase tracking-wider text-white shadow-sm disabled:opacity-50"
                              >
                                Change Repeat
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        );}}
      </BaseSheet>

      {grab && (() => {
        const sr = sheetRef.current?.getBoundingClientRect();
        const cr = scrollContainerRef.current?.getBoundingClientRect();
        const clipTop = cr ? cr.top : (sr?.top ?? 0);
        const clip = sr
          ? `inset(${clipTop}px ${window.innerWidth - sr.right}px ${window.innerHeight - sr.bottom}px ${sr.left}px round 0 0 32px 32px)`
          : undefined;
        return (
          <svg
            key={grab.startAt}
            className="fixed inset-0 z-[1085] pointer-events-none"
            width={vp.w}
            height={vp.h}
            viewBox={`0 0 ${vp.w} ${vp.h}`}
            preserveAspectRatio="none"
            style={{ width: vp.w, height: vp.h, clipPath: clip }}
          >
            <defs>
              <linearGradient id="tongue-grad-missed" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#ff6b6b" />
                <stop offset="1" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            <path
              ref={tonguePathEl}
              d="M0 0 L0 0"
              fill="none"
              stroke="url(#tongue-grad-missed)"
              strokeWidth={TONGUE_STROKE}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
              <circle r={10} fill="transparent" />
              <image
                href="/fly.svg"
                x={-FLY_PX / 2}
                y={-FLY_PX / 2}
                width={FLY_PX}
                height={FLY_PX}
              />
            </g>
          </svg>
        );
      })()}

      {cinematic && (
        <MissedCinematicOverlay onSkip={speedUpTongue} />
      )}
    </>
  );
}

function MissedSectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-card text-primary">
          {icon}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.16em]">
          {title}
        </span>
      </div>
      <span className="rounded-full bg-muted/70 px-2 py-1 text-[10px] font-black text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function MissedCinematicOverlay({ onSkip }: Readonly<{ onSkip: () => void }>) {
  const [active, setActive] = React.useState(false);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    // Render into the shared notification stack so the hint rises and stacks
    // exactly like the fly toast / Frogodoro pill (same container + motion).
    setPortalTarget(document.getElementById('frog-bottom-stack-bottom'));
  }, []);

  const handleSkip = React.useCallback(() => {
    if (active) return;
    setActive(true);
    onSkip();
  }, [active, onSkip]);

  return (
    <>
      <button
        type="button"
        aria-label="Tap anywhere to fast-forward tongue animation"
        className="fixed inset-0 z-[1090] cursor-default bg-transparent"
        onClick={handleSkip}
        onTouchStart={handleSkip}
      />

      {portalTarget &&
        createPortal(
          <motion.div
            layout
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`pointer-events-none w-full md:w-[380px] md:self-end flex items-center gap-3 px-4 py-3 rounded-[18px] border shadow-sm backdrop-blur-2xl transition-colors duration-200 ${
              active
                ? 'bg-card/90 text-foreground border-primary/40'
                : 'bg-card/90 text-foreground border-border/50'
            }`}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/25 shrink-0"
              aria-hidden
            >
              {active ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M13 19V5l8 7-8 7z" fill="currentColor" />
                  <path d="M3 19V5l8 7-8 7z" fill="currentColor" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 3l14 9-14 9V3z" fill="currentColor" />
                </svg>
              )}
            </span>
            <span
              className={`flex-1 text-sm font-semibold select-none transition-colors duration-200 ${active ? 'text-primary' : 'text-foreground'}`}
            >
              {active ? 'x2 speed' : 'Tap to speed'}
            </span>
          </motion.div>,
          portalTarget,
        )}
    </>
  );
}
