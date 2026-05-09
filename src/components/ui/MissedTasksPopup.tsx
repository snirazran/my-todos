'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarClock, CalendarPlus, FolderOpen, Loader2, RotateCcw, X } from 'lucide-react';
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
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black leading-tight tracking-tight text-foreground">
                      Leftover flies from yesterday.
                    </h2>
                    <p className="mt-1 max-w-[24rem] text-xs font-semibold leading-snug text-muted-foreground">
                      Maybe you finished these and forgot to mark them.
                    </p>
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
              className="flex-1 min-h-0 overflow-y-auto p-3 pb-24 space-y-3 overscroll-none"
              style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
            >
              <div className="pt-1">
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
                  showActionButtons={false}
                />
              </div>
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
                <div className="space-y-4">
                  {taskItems.length > 0 && (
                    <MissedSectionHeader
                      icon={<CalendarCheck className="h-3.5 w-3.5" />}
                      title="Tasks"
                      count={taskItems.length}
                    />
                  )}
                  {taskItems.map((item) => {
                    const showRepeatChoice = repeatChoiceId === item.id;
                    const itemBusy = busyId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-border/70 bg-card/85 p-2.5 shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/70"
                            aria-hidden
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
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-1">
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
                              {item.type === 'weekly' && (
                                <RotateCcw className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 inline ml-1.5 relative -top-px" />
                              )}
                            </p>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void completeItem(item)}
                                disabled={isBusy}
                                className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[9px] font-black uppercase tracking-wide text-primary-foreground shadow-sm transition disabled:opacity-50"
                              >
                                DID YESTERDAY
                              </button>
                              <button
                                type="button"
                                onClick={() => void runAction(item, 'save-later')}
                                disabled={isBusy}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/70 bg-muted/50 px-2.5 text-[9px] font-black uppercase tracking-wide text-foreground transition hover:bg-muted disabled:opacity-50"
                              >
                                <FolderOpen className="h-3 w-3" />
                                DO LATER
                              </button>
                              <button
                                type="button"
                                onClick={() => void moveToToday(item)}
                                disabled={isBusy}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2.5 text-[9px] font-black uppercase tracking-wide text-primary transition hover:bg-primary/15 disabled:opacity-50"
                              >
                                <CalendarPlus className="h-3 w-3" />
                                DO TODAY
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
              )}
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

      <div className="fixed bottom-0 left-0 right-0 z-[1091] flex justify-center pointer-events-none px-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div
          className={`
            flex items-center gap-2 rounded-full border px-3 py-2
            shadow-sm backdrop-blur-2xl transition-all duration-200
            ${active ? 'bg-card/90 border-primary/40' : 'bg-card/80 border-border/50'}
          `}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors duration-200"
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
            className={`text-[11px] font-semibold select-none whitespace-nowrap transition-colors duration-200 ${active ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {active ? 'x2 speed' : 'Tap to speed'}
          </span>
        </div>
      </div>
    </>
  );
}
