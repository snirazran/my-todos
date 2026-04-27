'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarClock, CalendarPlus, Crown, FolderOpen, Loader2, RotateCcw, X } from 'lucide-react';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { type FrogHandle } from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useNotification } from '@/components/providers/NotificationProvider';
import { cn } from '@/lib/utils';
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
  type: 'regular' | 'weekly' | 'habit';
};

type RepeatMoveMode = 'change-repeat' | 'just-once';

type Props = {
  show: boolean;
  status: MissedTasksStatus;
  tags: { id: string; name: string; color: string }[];
  onClose: () => void;
  onItemResolved: (id: string, flyBalance?: number) => void | Promise<void>;
  onStatusChanged: () => void | Promise<void>;
};

export function MissedTasksPopup({
  show,
  status,
  tags,
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
        if (data?.code === 'NOT_ENOUGH_FLIES') {
          setLocalFlyBalance(data.flyBalance ?? localFlyBalance);
          showNotification(
            <span>
              You need {status.completionCost} flies to complete yesterday's
              item.
            </span>,
          );
          return false;
        }
        throw new Error(data?.error || 'Failed to update missed item');
      }

      if (typeof data.flyBalance === 'number') {
        setLocalFlyBalance(data.flyBalance);
      }

      if (action === 'complete') {
        showNotification(
          status.isPremium
            ? 'Completed from yesterday'
            : `Completed for ${status.completionCost} flies`,
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
    if (!status.isPremium && localFlyBalance < status.completionCost) {
      showNotification(
        <span>
          You need {status.completionCost} flies to complete yesterday's item.
        </span>,
      );
      return;
    }

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

  if (!show || status.items.length === 0) return null;

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
        {({ isDesktop, dragControls, isDragging }) => (
          <div ref={sheetRef} className="relative flex h-full flex-col">
            <div
              onPointerDown={(event) => !isDesktop && !cinematic && dragControls.start(event)}
              className="px-4 py-4 md:px-6 border-b border-border/50 shrink-0 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-primary/10 shrink-0">
                  <CalendarClock className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-black tracking-tight text-foreground uppercase leading-none">
                    Yesterday
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                      {status.yesterday}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">
                      {activeCount} missed
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => void dismiss()}
                disabled={isBusy}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition-all active:scale-95 disabled:opacity-50"
                aria-label="Skip missed tasks"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>

            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto p-3 pb-8 space-y-3 overscroll-none"
              style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
            >
              <div className="flex justify-center pb-1 border-b border-border/40 border-dashed">
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
                  animateHunger={false}
                  isCatching={cinematic}
                  paused={wardrobeOpen || isDragging}
                />
              </div>

              <div
                className={cn(
                  'rounded-2xl border px-3 py-2.5 text-xs font-semibold leading-relaxed',
                  status.isPremium
                    ? 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
                    : 'bg-muted/50 border-border/60 text-muted-foreground',
                )}
              >
                <div className="flex items-start gap-2">
                  {status.isPremium ? (
                    <Crown className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <Fly size={22} y={-4} className="shrink-0" />
                  )}
                  <span>
                    {status.isPremium
                      ? 'Premium skips the missed-completion fee.'
                      : `Completing a missed item from yesterday costs ${status.completionCost} flies.`}
                  </span>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center">
                  <p className="text-sm font-black text-foreground">
                    All caught up.
                  </p>
                  <button
                    onClick={() => void dismiss()}
                    className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-sm active:scale-95"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => {
                    const isTask = item.type !== 'habit';
                    const showRepeatChoice = repeatChoiceId === item.id;
                    const itemBusy = busyId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-border/70 bg-card/80 p-2.5 shadow-sm"
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => void completeItem(item)}
                            disabled={isBusy}
                            className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/70 transition active:scale-95 disabled:cursor-wait"
                            aria-label={`Complete ${item.text}`}
                          >
                            <span
                              ref={(node) => {
                                if (node) flyRefs.current[item.id] = node;
                                else delete flyRefs.current[item.id];
                              }}
                              className={cn(
                                'flex h-9 w-9 items-center justify-center',
                                visuallyDone.has(item.id) && 'opacity-0',
                              )}
                            >
                              {itemBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              ) : (
                                <Fly size={25} y={-4} paused={isBusy} />
                              )}
                            </span>
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-1">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-normal',
                                  item.type === 'habit'
                                    ? 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300'
                                    : item.type === 'weekly'
                                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                      : 'border-primary/20 bg-primary/10 text-primary',
                                )}
                              >
                                {item.type === 'habit' ? (
                                  <CalendarClock className="h-3 w-3" />
                                ) : item.type === 'weekly' ? (
                                  <RotateCcw className="h-3 w-3" />
                                ) : (
                                  <CalendarCheck className="h-3 w-3" />
                                )}
                                {item.type === 'habit'
                                  ? 'Habit'
                                  : item.type === 'weekly'
                                    ? 'Repeating'
                                    : 'Task'}
                              </span>
                              {item.tags?.map((tagId) => {
                                const tag = getTagDetails(tagId);
                                if (!tag) return null;
                                return (
                                  <span
                                    key={tagId}
                                    className="inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none"
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
                            <p className="break-words text-sm font-bold leading-snug text-foreground">
                              {item.text}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-11">
                          <button
                            type="button"
                            onClick={() => void completeItem(item)}
                            disabled={isBusy}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow-sm transition active:scale-95 disabled:opacity-50"
                          >
                            Complete
                            {!status.isPremium && (
                              <span className="inline-flex items-center gap-0.5">
                                {status.completionCost}
                                <Fly size={16} y={-3} />
                              </span>
                            )}
                          </button>
                          {isTask && (
                            <>
                              <button
                                type="button"
                                onClick={() => void runAction(item, 'save-later')}
                                disabled={isBusy}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border/70 bg-muted/50 px-3 text-[10px] font-black uppercase tracking-wider text-foreground transition hover:bg-muted active:scale-95 disabled:opacity-50"
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                                Save for Later
                              </button>
                              <button
                                type="button"
                                onClick={() => void moveToToday(item)}
                                disabled={isBusy}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 text-[10px] font-black uppercase tracking-wider text-primary transition hover:bg-primary/15 active:scale-95 disabled:opacity-50"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                                Do Today
                              </button>
                            </>
                          )}
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
                                className="h-8 rounded-xl bg-card px-3 text-[10px] font-black uppercase tracking-wider text-foreground ring-1 ring-border/70 active:scale-95 disabled:opacity-50"
                              >
                                Just Today
                              </button>
                              <button
                                type="button"
                                onClick={() => void moveToToday(item, 'change-repeat')}
                                disabled={isBusy}
                                className="h-8 rounded-xl bg-emerald-600 px-3 text-[10px] font-black uppercase tracking-wider text-white shadow-sm active:scale-95 disabled:opacity-50"
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
              )}
            </div>

            <div className="shrink-0 border-t border-border/50 bg-background/95 px-4 py-3">
              <button
                onClick={() => void dismiss()}
                disabled={isBusy}
                className="w-full rounded-xl border border-border/70 bg-card px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground transition hover:text-foreground active:scale-[0.99] disabled:opacity-50"
              >
                Skip for Today
              </button>
            </div>
          </div>
        )}
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
        <button
          type="button"
          aria-label="Tap anywhere to fast-forward tongue animation"
          className="fixed inset-0 z-[1090] cursor-default bg-transparent"
          onClick={speedUpTongue}
          onTouchStart={speedUpTongue}
        />
      )}
    </>
  );
}
