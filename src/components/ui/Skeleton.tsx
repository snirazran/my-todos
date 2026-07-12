import React from 'react';
import { cn } from '@/lib/utils';

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
      className="min-h-screen overflow-x-hidden pb-20 md:pb-8"
    >
      <div className="mx-auto max-w-4xl px-3 pt-[calc(3rem+env(safe-area-inset-top))] pb-4 md:px-6 md:pt-12">
        <div className="flex flex-col items-center">
          <div className="h-[226px] md:h-[254px]" />
          <Skeleton className="h-[50px] w-[340px] max-w-[94vw] rounded-[18px]" />
        </div>

        <div className="-mx-3 mt-[30px] rounded-t-[24px] bg-background px-3 pt-5 md:mx-auto md:mt-24 md:w-full md:max-w-2xl md:px-8">
          <div className="flex items-center justify-between px-2 md:px-0">
            <div className="flex items-center gap-2.5 pl-3">
              <Skeleton className="h-7 w-7 rounded-xl md:h-8 md:w-8" />
              <Skeleton className="h-4 w-40 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>

          <div className="mt-4 flex flex-col gap-2 pb-16">
            {['w-2/5', 'w-1/4', 'w-1/3', 'w-2/5', 'w-1/4'].map((w, i) => (
              <TaskRowSkeleton
                key={i}
                width={w}
                circleClassName="h-11 w-11 md:h-12 md:w-12"
              />
            ))}
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

function PlannerColumnSkeleton({
  rows,
  isPast = false,
  className,
}: {
  rows: number;
  isPast?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-[88vw] shrink-0 self-start sm:w-[360px] md:w-[330px] lg:w-[310px] xl:w-[292px]',
        className,
      )}
    >
      {/* Matches DayColumn: a recessed grey surface with white task cards on top. */}
      <div
        className={cn(
          'rounded-[20px] border border-border/50 p-2 shadow-sm',
          isPast
            ? 'bg-muted/40 dark:bg-background/60'
            : 'bg-muted/70 dark:bg-background',
        )}
      >
        <div className="mb-2 flex flex-col gap-2 px-1 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-6 w-14 rounded-md" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              {!isPast && <Skeleton className="h-5 w-5 rounded-full" />}
              <Skeleton className="h-7 w-7 rounded-lg" />
            </div>
          </div>
          <div className="-mt-1 flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded-md" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col gap-2 px-0.5 pt-1">
          {Array.from({ length: rows }).map((_, i) => (
            <TaskRowSkeleton
              key={i}
              width={['w-1/4', 'w-1/3', 'w-1/4', 'w-2/5', 'w-1/3'][i % 5]}
              className={cn(isPast && 'bg-card/60')}
            />
          ))}
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
      <div className="absolute left-0 right-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-10 flex flex-col items-center gap-2 px-3">
        <Skeleton className="h-10 w-44 rounded-2xl" />
        <div className="w-full rounded-2xl bg-card/40 px-2 py-1.5 backdrop-blur-xl md:hidden">
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      </div>

      <div className="flex justify-center gap-3 overflow-hidden px-4 pt-[calc(9rem+env(safe-area-inset-top))] md:pt-16">
        <PlannerColumnSkeleton rows={4} isPast className="hidden md:block" />
        <PlannerColumnSkeleton rows={5} isPast />
        <PlannerColumnSkeleton rows={5} />
        <PlannerColumnSkeleton rows={5} />
        <PlannerColumnSkeleton rows={4} className="hidden md:block" />
      </div>
    </SkeletonShell>
  );
}

function QuestObjectiveCardSkeleton({ width }: { width: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[20px] border border-border/50 bg-card px-4 py-3.5 shadow-sm">
      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className={cn('h-3.5 rounded-full', width)} />
        <Skeleton className="h-5 w-full rounded-full" />
      </div>
      <Skeleton className="h-8 w-16 shrink-0 rounded-xl" />
    </div>
  );
}

function QuestSectionHeaderSkeleton({
  rightWidth = 'w-16',
}: {
  rightWidth?: string;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-3.5 w-3.5 rounded-md" />
        <Skeleton className="h-3.5 w-24 rounded-full" />
      </div>
      <Skeleton className={cn('h-3.5 rounded-full', rightWidth)} />
    </div>
  );
}

function QuestAreaRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-border/50 bg-card p-3 shadow-sm">
      <Skeleton className="h-14 w-[88px] shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/5 rounded-full" />
        <Skeleton className="h-3 w-3/5 rounded-full" />
      </div>
      <Skeleton className="h-9 w-20 shrink-0 rounded-xl" />
    </div>
  );
}

export function QuestsPageSkeleton() {
  return (
    <SkeletonShell label="Loading quests" className="h-full overflow-hidden">
      <div className="mx-auto flex w-full flex-col">
        <div className="relative h-[430px] w-full md:h-[360px]">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div aria-hidden="true" className="absolute inset-0 bg-muted-foreground/10" />
          <div className="absolute inset-x-3 bottom-10 z-10 mx-auto flex max-w-xl items-center gap-3 rounded-[24px] bg-background p-3 shadow-lg">
            <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <Skeleton className="h-4 w-2/5 rounded-full" />
              <Skeleton className="h-6 w-full rounded-full" />
            </div>
            <Skeleton className="h-14 w-32 shrink-0 rounded-2xl" />
          </div>
        </div>

        {/* Tinted content area with floating section headers + row cards. */}
        <div className="relative z-10 -mt-8 rounded-t-[24px] bg-muted px-4 pb-10 pt-8 md:mx-auto md:mt-6 md:w-full md:max-w-6xl md:rounded-none md:bg-transparent md:px-8 md:pt-0">
          <div className="flex flex-col gap-8 md:grid md:grid-cols-2 md:items-start md:gap-6">
            <div className="flex flex-col gap-8">
              {/* Starter quest: floating header + objective row cards */}
              <div className="flex flex-col gap-2.5">
                <QuestSectionHeaderSkeleton rightWidth="w-20" />
                <QuestObjectiveCardSkeleton width="w-3/5" />
                <QuestObjectiveCardSkeleton width="w-2/5" />
              </div>

              {/* Daily quests: header + rows + streak card */}
              <div className="flex flex-col gap-2.5">
                <QuestSectionHeaderSkeleton rightWidth="w-24" />
                <QuestObjectiveCardSkeleton width="w-2/5" />
                <QuestObjectiveCardSkeleton width="w-1/2" />
                <QuestObjectiveCardSkeleton width="w-1/3" />
                <div className="flex items-center gap-2.5 rounded-[20px] border border-border/50 bg-card px-4 py-3 shadow-sm">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-2/5 rounded-full" />
                    <Skeleton className="h-3 w-3/5 rounded-full" />
                  </div>
                  <Skeleton className="h-2 w-14 shrink-0 rounded-full" />
                </div>
              </div>
            </div>

            {/* Areas: header + banner card + objective + area rows */}
            <div className="flex flex-col gap-2.5">
              <QuestSectionHeaderSkeleton rightWidth="w-0" />
              <div className="overflow-hidden rounded-[24px] border border-border/50 bg-card shadow-sm">
                <Skeleton className="h-[150px] w-full rounded-none" />
                <div className="flex flex-col gap-2.5 px-4 pb-3 pt-2.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-32 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-xl" />
                  </div>
                  <Skeleton className="h-2 w-28 rounded-full" />
                </div>
              </div>
              <QuestObjectiveCardSkeleton width="w-4/5" />
              <Skeleton className="h-11 w-full rounded-[20px]" />
              <QuestAreaRowSkeleton />
              <QuestAreaRowSkeleton />
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
    <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-4 pb-20 md:pb-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'mx-auto flex w-full max-w-[240px] flex-col rounded-xl border-2 border-border bg-card p-1.5 md:p-2',
            showAction ? 'pb-0 md:pb-0.5' : 'pb-1.5 md:pb-2',
          )}
        >
          <Skeleton className="aspect-[1/1.1] rounded-lg" />
          {showAction && (
            <Skeleton className="mx-auto my-1 h-5 w-1/2 rounded-lg" />
          )}
        </div>
      ))}
    </div>
  );
}

export function WardrobePageSkeleton() {
  return (
    <SkeletonShell
      label="Loading wardrobe"
      className="relative flex min-h-[100dvh] flex-col overflow-x-clip md:min-h-[calc(100vh-4rem)]"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 md:px-6">
        <div className="h-[calc(204px+env(safe-area-inset-top))] shrink-0 md:h-[calc(222px+env(safe-area-inset-top))]" />

        <div className="mt-20 flex flex-col gap-4 md:mt-24">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-2xl" />
            <Skeleton className="h-10 flex-1 rounded-2xl" />
            <Skeleton className="h-10 flex-1 rounded-2xl" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-16 shrink-0 rounded-full" />
            ))}
          </div>
          <WardrobeGridSkeleton />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function FriendsLeaderboardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-2 rounded-xl border border-border/50 bg-card py-1.5 pl-1.5 pr-3 sm:gap-2.5 sm:py-2"
        >
          <div className="h-[78px] w-[96px] shrink-0 min-[360px]:h-[102px] min-[360px]:w-[132px] min-[400px]:h-[124px] min-[400px]:w-[164px] sm:h-[124px] sm:w-48 md:h-[172px] md:w-56" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton
              className={cn(
                'h-4 rounded-full',
                ['w-3/5', 'w-2/5', 'w-1/2', 'w-2/3'][i % 4],
              )}
            />
            <Skeleton className="h-3 w-1/3 rounded-full" />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FriendsPageSkeleton() {
  return (
    <SkeletonShell
      label="Loading friends"
      className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12"
    >
      <div className="relative mx-auto flex w-full flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:max-w-2xl md:pt-11">
        <div className="h-[270px]" />
        <Skeleton className="relative z-20 -mt-3 h-[58px] w-[min(20rem,80vw)] rounded-2xl" />

        <div className="relative z-10 -mx-4 mt-8 flex w-[calc(100%+2rem)] flex-col self-stretch rounded-t-[24px] bg-background px-4 pb-12 pt-5 md:mt-24 md:px-8">
          <div className="mb-5 flex items-center gap-3 rounded-[20px] border border-border/50 bg-card/40 px-4 py-3.5">
            <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-2/5 rounded-full" />
              <Skeleton className="h-3 w-3/5 rounded-full" />
            </div>
          </div>

          <div className="mb-5 flex items-center gap-3 rounded-[18px] border border-border/50 bg-card/40 px-3.5 py-3">
            <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-4 w-3/5 rounded-full" />
            </div>
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          </div>

          <div className="mb-2.5 flex flex-col gap-2 px-1.5">
            <Skeleton className="h-5 w-48 rounded-full" />
            <Skeleton className="h-3 w-36 rounded-full" />
          </div>

          <div className="w-full overflow-hidden rounded-[18px] border border-border/50 bg-card/40 p-1.5 shadow-sm">
            <FriendsLeaderboardSkeleton />
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}
