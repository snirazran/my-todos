import React from 'react';
import { cn } from '@/lib/utils';
import {
  BOARD_CARD_SURFACE,
  BOARD_LIST_SURFACE,
  HOME_CARD_SURFACE,
  TASK_CARD_SURFACE,
} from './taskSurfaces';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton rounded-lg', className)} />;
}

function SkeletonShell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function TaskRowSkeleton({
  width,
  className,
  circleClassName,
}: {
  width: string;
  className?: string;
  circleClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card px-3 py-2.5 shadow-sm',
        className,
      )}
    >
      <Skeleton className="h-4 w-1 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className={cn('h-3.5 rounded-full', width)} />
      </div>
      <Skeleton
        className={cn('h-10 w-10 shrink-0 rounded-full', circleClassName)}
      />
    </div>
  );
}

export function HomePageSkeleton() {
  return (
    <SkeletonShell
      label="Loading your tasks"
      className="relative min-h-screen overflow-x-hidden pb-20 md:pb-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[calc(440px+env(safe-area-inset-top))] -z-10 bg-[hsl(var(--board-list))] dark:hidden md:top-[640px]"
      />
      <div className="mx-auto max-w-4xl px-3 pt-[calc(3rem+env(safe-area-inset-top))] pb-4 md:px-6 md:pt-40">
        <div className="h-[226px] md:h-[254px]" />
        <div className="relative z-[25] -mt-2 w-full pt-4 md:mx-auto md:w-[calc(min(100%,48rem)-6rem)] xl:w-[calc(min(100%,48rem)-7rem)]">
          <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 top-0 -z-10 w-screen -translate-x-1/2 rounded-t-[28px] bg-[hsl(var(--board-list))] shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:bg-background dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)] md:rounded-t-[32px]" />
          <div className="w-full rounded-[20px] bg-[hsl(var(--card-raised))] shadow-[0_0_0_1px_rgba(15,23,42,0.035),0_2px_0_0_rgba(15,23,42,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_0_0_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3">
              <div className="flex h-5 items-center justify-between">
                <Skeleton className="h-3.5 w-24 rounded-full" />
                <Skeleton className="h-3.5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full rounded-full" />
            </div>
          </div>
        </div>

        <div className="relative z-20 -mx-3 -mt-6 bg-[hsl(var(--board-list))] px-1.5 pt-10 dark:bg-background md:mx-auto md:w-full md:max-w-3xl md:bg-transparent md:px-8 md:pt-12 xl:px-10">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 hidden w-screen -translate-x-1/2 bg-[hsl(var(--board-list))] dark:bg-background md:block" />
          <div className="mb-2 flex min-h-11 items-center justify-between pl-5 pr-2 md:min-h-9 md:pl-8 md:pr-5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3.5 w-12 rounded-full" />
            </div>
            <div className="flex items-center gap-1 md:gap-0.5">
              <Skeleton className="hidden h-9 w-9 rounded-xl md:block" />
              <Skeleton className="h-11 w-11 rounded-2xl md:h-9 md:w-9 md:rounded-xl" />
              <Skeleton className="h-11 w-11 rounded-2xl md:h-9 md:w-9 md:rounded-xl" />
            </div>
          </div>

          <div className="mb-16 px-1.5 md:px-4">
            {['w-2/5', 'w-1/4', 'w-1/3', 'w-2/5', 'w-1/4'].map((w, i) => (
              <div key={i} className="pb-3">
                <div
                  className={cn(
                    'flex items-center gap-3 py-[15px] pl-3.5 pr-2.5 md:py-4 md:pl-4 md:pr-3',
                    TASK_CARD_SURFACE,
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className={cn('h-4 rounded-full', w)} />
                  </div>
                  <Skeleton className="h-11 w-11 shrink-0 rounded-full md:h-12 md:w-12" />
                </div>
              </div>
            ))}
            <div className="pt-1">
              <div className="flex h-16 items-center gap-4 rounded-[18px] bg-foreground/[0.04] pl-4 pr-3.5 dark:bg-white/[0.05] md:pl-[18px]">
                <span className="h-8 w-8 shrink-0 rounded-full bg-primary/80 dark:bg-[#4a8a44]/80" />
                <Skeleton className="h-4 w-24 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

function PlannerColumnSkeleton({
  rows,
  isPast = false,
  today = false,
  className,
}: {
  rows: number;
  isPast?: boolean;
  today?: boolean;
  className?: string;
}) {
  const heading = (
    <div className="flex items-baseline gap-2">
      <Skeleton className="h-5 w-20 rounded-md" />
      <Skeleton className="h-3 w-12 rounded-full" />
    </div>
  );
  const actions = (
    <div className="flex items-center gap-1 md:gap-0.5">
      {Array.from({ length: today ? 3 : 2 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-11 w-11 rounded-2xl md:h-9 md:w-9 md:rounded-xl"
        />
      ))}
    </div>
  );
  return (
    <div
      className={cn(
        'flex h-full w-[calc(100vw-24px)] max-w-[480px] shrink-0 flex-col md:w-[330px] md:max-w-none lg:w-[310px] xl:w-[292px]',
        className,
      )}
    >
      <div className="flex min-h-11 items-center justify-between pb-1.5 pl-3.5 pr-2 md:hidden">
        {heading}
        {actions}
      </div>
      <div
        className={cn(
          'flex min-h-0 flex-col overflow-hidden md:max-h-full',
          BOARD_LIST_SURFACE,
        )}
      >
        <div className="hidden min-h-[48px] items-center justify-between pb-0.5 pl-3 pr-2.5 pt-1.5 md:flex">
          {heading}
          {actions}
        </div>
        <div className="min-h-0 overflow-hidden px-2 pt-2">
          {['w-3/5', 'w-2/5', 'w-1/2', 'w-1/3', 'w-2/5'].slice(0, rows).map((w, i) => (
            <div key={i} className="pb-3">
              <div
                className={cn(
                  'flex items-center gap-2.5 py-3 pl-3.5 pr-2.5 md:py-2.5 md:pl-3',
                  BOARD_CARD_SURFACE,
                  isPast && 'opacity-60',
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className={cn('h-4 rounded-full', w)} />
                </div>
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="px-2 pb-2">
          {!isPast && (
            <div className="flex h-12 items-center gap-3 pl-3.5 pr-3 md:h-11 md:gap-2.5 md:pl-3">
              <span className="h-7 w-7 shrink-0 rounded-full bg-primary/80 dark:bg-[#4a8a44]/80" />
              <Skeleton className="h-4 w-24 rounded-full" />
            </div>
          )}
          <div className="md:hidden">
            {!isPast && <div className="mx-3.5 my-1.5 h-px bg-foreground/[0.08]" />}
            <div className="flex h-11 items-center gap-3 pl-3.5 pr-3">
              <span className="grid w-7 shrink-0 place-items-center">
                <Skeleton className="h-[18px] w-[18px] rounded-md" />
              </span>
              <Skeleton className="h-3.5 w-14 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlannerPageSkeleton() {
  return (
    <SkeletonShell
      label="Loading your planner"
      className="relative h-full w-full overflow-hidden bg-background"
    >
      <div className="absolute left-0 right-0 top-[calc(0.25rem+env(safe-area-inset-top))] z-10 flex flex-col items-center gap-2 px-3 md:top-[80px]">
        <div className="hidden items-center gap-2.5 md:flex">
          <Skeleton className="h-11 w-80 rounded-2xl" />
          <Skeleton className="h-11 w-28 rounded-2xl" />
        </div>
        <div className="w-full max-w-[480px] md:hidden">
          <div className="flex h-10 items-center pl-3.5">
            <Skeleton className="h-[18px] w-32 rounded-full" />
          </div>
          <div className="mt-1 flex h-[54px]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-1 flex-col items-center justify-center gap-[5px]"
              >
                <Skeleton className="h-2.5 w-2.5 rounded-sm" />
                <Skeleton className="h-4 w-5 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex h-full justify-center gap-6 overflow-hidden px-3 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(112px+env(safe-area-inset-top))] md:gap-3 md:px-4 md:pb-[calc(32px+env(safe-area-inset-bottom))] md:pt-[140px]">
        <PlannerColumnSkeleton rows={4} isPast className="hidden md:flex" />
        <PlannerColumnSkeleton rows={5} isPast />
        <PlannerColumnSkeleton rows={5} today />
        <PlannerColumnSkeleton rows={5} />
        <PlannerColumnSkeleton rows={4} className="hidden md:flex" />
      </div>
    </SkeletonShell>
  );
}

const QUEST_CARD_SKELETON = `overflow-hidden ${HOME_CARD_SURFACE}`;

function QuestSectionHeaderSkeleton({
  titleWidth,
  right,
}: {
  titleWidth: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 pb-1.5 pl-3.5 pr-1">
      <div className="flex items-center gap-2">
        <Skeleton className={cn('h-[18px] rounded-full', titleWidth)} />
        <Skeleton className="h-3 w-10 rounded-full" />
      </div>
      <div className="flex items-center gap-1.5">{right}</div>
    </div>
  );
}

function QuestObjectiveRowSkeleton({
  width,
  divider = false,
}: {
  width: string;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-3 pl-3.5 pr-3',
        divider && 'border-t border-border/50',
      )}
    >
      <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <Skeleton className={cn('h-3.5 rounded-full', width)} />
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>
      <Skeleton className="h-11 w-12 shrink-0 rounded-[14px]" />
    </div>
  );
}

function QuestPathRowSkeleton({
  width,
  prize = false,
}: {
  width: string;
  prize?: boolean;
}) {
  return (
    <div className="flex items-stretch gap-1.5">
      <div className="flex w-8 shrink-0 items-center justify-center">
        <Skeleton className={cn('rounded-full', prize ? 'h-8 w-8' : 'h-[26px] w-[26px]')} />
      </div>
      <div className={cn('flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-3', HOME_CARD_SURFACE)}>
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl min-[400px]:h-12 min-[400px]:w-12" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className={cn('h-4 rounded-full', width)} />
          {prize ? (
            <Skeleton className="h-3 w-3/5 rounded-full" />
          ) : (
            <Skeleton className="h-[22px] w-full rounded-full" />
          )}
        </div>
        {!prize && <Skeleton className="h-11 w-12 shrink-0 rounded-[14px]" />}
      </div>
    </div>
  );
}

function LeapRailSkeleton() {
  return (
    <div className="flex items-end justify-between px-3 pb-1 pt-6">
      {Array.from({ length: 5 }, (_, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <div className="flex flex-1 justify-center gap-1.5 self-center">
              {Array.from({ length: 3 }, (_, dot) => (
                <Skeleton key={dot} className="h-1.5 w-1.5 rounded-full" />
              ))}
            </div>
          )}
          <div className="flex aspect-[500/430] w-[70px] shrink-0 items-end">
            <Skeleton className="h-[62%] w-full rounded-[50%]" />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function QuestsPageSkeleton() {
  return (
    <SkeletonShell
      label="Loading quests"
      className="h-full overflow-hidden bg-[hsl(var(--board-list))] dark:bg-background md:h-auto md:overflow-x-clip md:overflow-y-visible"
    >
      <div className="relative h-[calc(300px+env(safe-area-inset-top))] w-full overflow-hidden md:h-[460px]">
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
        <div aria-hidden="true" className="absolute inset-0 bg-muted-foreground/10" />
        <div className="absolute inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] flex flex-col items-center gap-1.5 px-6 md:top-24 md:gap-2">
          <div className="h-[22px] w-20 rounded-full bg-background/50" />
          <div className="h-7 w-56 rounded-2xl bg-background/50 md:h-12 md:w-80" />
        </div>
        <div className="absolute inset-x-0 bottom-12 flex justify-center md:bottom-14">
          <div className="h-11 w-36 rounded-full bg-background/50" />
        </div>
      </div>

      <div className="relative z-10 mx-auto -mt-7 flex w-full max-w-3xl flex-col gap-7 rounded-t-[28px] bg-[hsl(var(--board-list))] dark:bg-background px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)] md:-mt-8 md:gap-9 md:rounded-none md:bg-transparent md:px-6 md:pb-12 md:pt-8 md:shadow-none md:dark:bg-transparent md:dark:shadow-none">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 hidden w-screen -translate-x-1/2 rounded-t-[32px] bg-[hsl(var(--board-list))] dark:bg-background shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)] md:block" />
        <div>
          <QuestSectionHeaderSkeleton
            titleWidth="w-36"
            right={
              <>
                <Skeleton className="h-3.5 w-12 rounded-full" />
                <Skeleton className="mr-1 h-3.5 w-14 rounded-full" />
              </>
            }
          />
          <div className="flex flex-col gap-2">
            <QuestPathRowSkeleton width="w-2/5" />
            <QuestPathRowSkeleton width="w-1/2" />
            <QuestPathRowSkeleton width="w-1/3" />
            <QuestPathRowSkeleton width="w-1/2" prize />
          </div>
        </div>

        <div>
          <QuestSectionHeaderSkeleton
            titleWidth="w-32"
            right={<Skeleton className="mr-1 h-3.5 w-14 rounded-full" />}
          />
          <div className={QUEST_CARD_SKELETON}>
            <LeapRailSkeleton />
            <div className="flex flex-col items-center gap-2.5 px-4 pb-4 pt-3">
              <Skeleton className="h-5 w-40 rounded-full" />
              <Skeleton className="h-3 w-56 max-w-full rounded-full" />
            </div>
            <QuestObjectiveRowSkeleton width="w-1/2" divider />
            <div className="px-3 pb-3">
              <Skeleton className="h-[58px] w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

export function WardrobeGridSkeleton({
  showAction = false,
}: {
  showAction?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 pb-20 md:grid-cols-6 md:gap-2.5 md:pb-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index}
          className="skeleton flex aspect-square w-full flex-col items-center justify-end overflow-hidden rounded-2xl p-2"
        >
          {showAction && <div className="h-4 w-1/2 rounded-full bg-background/60" />}
        </div>
      ))}
    </div>
  );
}

export function TradePanelSkeleton() {
  return (
    <div className="pb-24 md:pb-10 md:pt-4" aria-hidden>
      <div className="md:grid md:grid-cols-[300px_minmax(0,1fr)] md:items-start md:gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">
        <div>
          <div className="-mx-4 -mt-2 flex flex-col items-center rounded-b-[32px] bg-muted/60 px-4 pb-5 pt-[calc(env(safe-area-inset-top)+16px)] md:mx-0 md:mt-0 md:rounded-[28px] md:pt-7">
            <Skeleton className="h-[84px] w-[84px] rounded-[24px]" />
            <Skeleton className="mt-3.5 h-5 w-24 rounded-full" />
            <div className="mt-[44px] flex gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-[60px] w-[60px] rounded-2xl" />
              ))}
            </div>
          </div>
          <div className="mt-5 flex justify-between px-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                <Skeleton className="h-[60px] w-[60px] rounded-[18px]" />
                <Skeleton className="h-3 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 md:mt-0 md:grid-cols-3 md:gap-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function WardrobePageSkeleton({ tabs = 2 }: { tabs?: number }) {
  if (tabs === 0) return <ShopPageSkeleton />;
  return (
    <SkeletonShell
      label="Loading wardrobe"
      className="relative flex min-h-[100dvh] flex-col overflow-x-clip md:min-h-[calc(100vh-4rem)]"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 md:px-6">
        <div className="h-[calc(252px+env(safe-area-inset-top))] shrink-0 md:h-[calc(302px+env(safe-area-inset-top))]" />
        <div className="pt-[60px] md:pt-2">
          <div className="mx-auto hidden h-12 w-full gap-1 rounded-[18px] border border-border/50 bg-muted p-1 shadow-lg md:flex md:translate-y-16">
            {Array.from({ length: tabs }).map((_, i) => (
              <div key={i} className="flex flex-1 items-center justify-center gap-2 rounded-[14px]">
                <Skeleton className="h-5 w-5 rounded-md" />
                <Skeleton className="h-3.5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="relative -mx-4 flex flex-1 flex-col rounded-t-[24px] bg-background md:-mx-6 md:mt-20">
          <div aria-hidden className="pointer-events-none absolute -bottom-px left-1/2 top-0 -z-10 hidden w-screen -translate-x-1/2 rounded-t-[32px] bg-background shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)] md:block" />
          <div className="flex gap-2 overflow-hidden border-b border-border/60 px-4 pb-1.5 pt-5 md:px-6 md:pt-3">
            <Skeleton className="h-10 w-[4.5rem] shrink-0 rounded-full" />
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-10 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="px-4 pt-2 md:px-6 md:pt-3">
            <WardrobeGridSkeleton />
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[51] border-t border-border/50 bg-background md:hidden">
        <div className="mx-auto h-[60px] max-w-md px-4 py-2">
          <div className="grid h-full grid-cols-2 gap-1 rounded-[16px] bg-muted p-1">
            {[0, 1].map((i) => (
              <div key={i} className={cn('flex items-center justify-center gap-2 rounded-[12px]', i === 0 && 'bg-card')}>
                <Skeleton className="h-6 w-6 rounded-lg" />
                <Skeleton className="h-3.5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

function ShopPageSkeleton() {
  return (
    <SkeletonShell
      label="Loading shop"
      className="relative flex min-h-[100dvh] flex-col overflow-x-clip md:min-h-[calc(100vh-4rem)]"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col md:px-6">
        <div className="pond-panel sticky top-0 z-30 flex shrink-0 items-center gap-2 bg-[color:var(--pond-surface-top)] px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:hidden">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="ml-auto h-12 w-12 rounded-2xl" />
        </div>
        <div className="pond-panel relative bg-[linear-gradient(to_bottom,var(--pond-surface-top),var(--pond-surface-bottom))] pb-10 pt-1 md:bg-none md:pt-[140px]">
          <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/2 top-0 -z-10 hidden w-screen -translate-x-1/2 bg-[linear-gradient(to_bottom,var(--pond-surface-top),var(--pond-surface-bottom))] md:block" />
          <div className="relative px-4 md:px-6">
            <div className="mx-auto mt-3 h-[118px] w-full max-w-[340px] animate-pulse rounded-[26px] bg-[color:var(--pond-well)]" />
          </div>
          <div className="h-[128px]" />
        </div>
        <div className="relative z-20 -mt-6 flex-1 rounded-t-[28px] bg-background px-4 pb-8 pt-6 md:flex-none md:rounded-none md:bg-transparent md:px-6 md:pb-12 md:pt-8">
          <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 top-0 -z-10 hidden w-screen -translate-x-1/2 rounded-t-[32px] bg-background shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)] md:block" />
          <div className="-mx-1.5 rounded-[28px] bg-[#fff8e3] p-2.5 pb-3 ring-1 ring-[#f6e3ae] dark:bg-amber-400/[0.06] dark:ring-amber-300/15">
            <div className="mb-2.5 flex items-center gap-2.5 px-1 pt-0.5">
              <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-36 rounded-full" />
                <Skeleton className="h-3 w-24 rounded-full" />
              </div>
              <Skeleton className="h-10 w-24 shrink-0 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-[22px] bg-muted" />
              ))}
            </div>
          </div>
          <div className="mt-8">
            <Skeleton className="mb-3 ml-1 h-5 w-40 rounded-full" />
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-[22px] bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

function FriendsHeaderSkeleton({ width = 'w-28' }: { width?: string }) {
  return (
    <div className="mb-2 flex min-h-9 items-center pl-3.5">
      <Skeleton className={cn('h-5 rounded-md', width)} />
    </div>
  );
}

function FriendsRowSkeleton({ avatar = false }: { avatar?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 py-3 pl-3.5 pr-2.5', avatar && 'py-2 pl-2', HOME_CARD_SURFACE)}>
      {avatar && <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-[14px]" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2 rounded-md" />
        <Skeleton className="h-3 w-2/3 rounded-md" />
      </div>
      <Skeleton className="h-11 w-11 shrink-0 rounded-full md:h-12 md:w-12" />
    </div>
  );
}

export function FriendsPageSkeleton() {
  return (
    <SkeletonShell label="Loading your friends and shared habits" className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[calc(440px+env(safe-area-inset-top))] -z-10 bg-[hsl(var(--board-list))] dark:hidden md:top-[640px]"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-3 pb-4 pt-[calc(3rem+env(safe-area-inset-top))] md:px-6 md:pt-32">
        <div className="relative h-[232px] w-full max-w-[480px] md:h-[286px] md:max-w-[760px]">
          <div className="absolute bottom-4 left-[16%] -ml-11 flex w-[88px] flex-col items-center gap-2 md:left-[22%] lg:left-[28%]"><Skeleton className="h-20 w-20 rounded-[35px]" /><Skeleton className="h-6 w-16 rounded-full" /></div>
          <div className="absolute bottom-4 left-[84%] -ml-11 flex w-[88px] flex-col items-center gap-2 md:left-[78%] lg:left-[72%]"><Skeleton className="h-20 w-20 rounded-[35px]" /><Skeleton className="h-6 w-16 rounded-full" /></div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2"><Skeleton className="h-[170px] w-[170px] rounded-b-none rounded-t-[72px]" /></div>
        </div>
        <div className="relative z-[25] w-full pt-4 md:mx-auto md:w-[calc(min(100%,48rem)-6rem)] xl:w-[calc(min(100%,48rem)-7rem)]">
          <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 top-0 -z-10 w-screen -translate-x-1/2 rounded-t-[28px] bg-[hsl(var(--board-list))] shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:bg-background dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)] md:rounded-t-[32px]" />
          <div className="flex w-full items-center gap-3 rounded-[20px] bg-[hsl(var(--card-raised))] py-2.5 pl-3 pr-3 shadow-[0_0_0_1px_rgba(15,23,42,0.035),0_2px_0_0_rgba(15,23,42,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_0_0_rgba(0,0,0,0.35)]">
            <div className="hidden w-[238px] shrink-0 items-center gap-2 border-r border-border/50 pr-3 md:flex"><Skeleton className="h-4 w-20 rounded-full" /><Skeleton className="h-3 flex-1 rounded-full" /></div>
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2"><Skeleton className="h-4 w-1/2 rounded-md" /><Skeleton className="h-2.5 w-full rounded-full" /></div>
          </div>
        </div>
        <div className="relative z-20 -mx-3 -mt-9 flex w-[calc(100%+1.5rem)] flex-col gap-7 bg-[hsl(var(--board-list))] dark:bg-background px-3 pt-[52px] md:mx-auto md:w-full md:max-w-3xl md:gap-9 md:bg-transparent md:px-8 md:pt-14">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 hidden w-screen -translate-x-1/2 bg-[hsl(var(--board-list))] dark:bg-background md:block" />
          <section>
            <FriendsHeaderSkeleton />
            <div className="flex flex-col gap-2">
              <FriendsRowSkeleton />
              <FriendsRowSkeleton />
              <Skeleton className={cn('h-[60px] w-full', HOME_CARD_SURFACE)} />
            </div>
          </section>
          <section>
            <FriendsHeaderSkeleton width="w-24" />
            <div className="flex flex-col gap-2 md:grid md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => <FriendsRowSkeleton key={index} avatar />)}
            </div>
          </section>
        </div>
      </div>
    </SkeletonShell>
  );
}
