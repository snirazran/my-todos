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
        <div className="h-[226px] md:h-[254px]" />
        <div className="relative z-10 w-full overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-sm md:mx-auto md:w-[calc(min(100%,48rem)-6rem)] xl:w-[calc(min(100%,48rem)-7rem)]">
          <div className="flex flex-col md:flex-row">
            <div className="flex h-12 items-center gap-3 px-3.5 md:w-[300px] md:shrink-0">
              <Skeleton className="h-3.5 w-[104px] shrink-0 rounded-full" />
              <div className="flex flex-1 gap-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-3.5 flex-1 rounded-full" />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-border/50 px-3 py-2.5 md:flex-1 md:border-l md:border-t-0">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3 rounded-md" />
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative -mx-3 -mt-10 bg-[linear-gradient(to_bottom,transparent,hsl(var(--background))_40px)] px-3 pt-14 md:mx-auto md:mt-4 md:w-full md:max-w-2xl md:bg-none md:px-8 md:pt-5">
          <div className="flex min-h-9 items-center justify-between pl-3.5 pr-1.5 md:pl-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3.5 w-12 rounded-full" />
            </div>
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>

          <div className="mb-16 mt-2 overflow-hidden rounded-[20px] border border-border/60 bg-card">
            {['w-2/5', 'w-1/4', 'w-1/3', 'w-2/5', 'w-1/4'].map((w, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 py-[15px] pl-3.5 pr-2.5 md:py-4 md:pl-4 md:pr-3',
                  i > 0 && 'border-t border-border/50',
                )}
              >
                <div className="min-w-0 flex-1">
                  <Skeleton className={cn('h-3.5 rounded-full', w)} />
                </div>
                <Skeleton className="h-11 w-11 shrink-0 rounded-full md:h-12 md:w-12" />
              </div>
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
  const heading = (
    <div className="flex items-baseline gap-2">
      <Skeleton className="h-5 w-20 rounded-md" />
      <Skeleton className="h-3 w-12 rounded-full" />
    </div>
  );
  const actions = (
    <div className="flex items-center gap-2">
      <Skeleton className="h-7 w-7 rounded-lg" />
      <Skeleton className="h-7 w-7 rounded-lg" />
    </div>
  );
  return (
    <div
      className={cn(
        'flex h-full w-[calc(100vw-24px)] max-w-[480px] shrink-0 flex-col md:w-[330px] md:max-w-none lg:w-[310px] xl:w-[292px]',
        className,
      )}
    >
      <div className="flex min-h-9 items-center justify-between pb-1.5 pl-3.5 pr-2 md:hidden">
        {heading}
        {actions}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="hidden min-h-[52px] items-center justify-between border-b border-border/60 pl-3 pr-2.5 md:flex">
          {heading}
          {actions}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {['w-3/5', 'w-2/5', 'w-1/2', 'w-1/3', 'w-2/5'].slice(0, rows).map((w, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2.5 py-3 pl-3.5 pr-2.5 md:pl-3',
                i > 0 && 'border-t border-border/60',
                isPast && 'opacity-60',
              )}
            >
              <Skeleton className={cn('h-4 rounded-full', w)} />
              <span className="flex-1" />
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
        {!isPast && (
          <div className="flex items-center border-t border-border/60 py-2 pl-3.5 pr-2.5 md:pl-3">
            <Skeleton className="h-4 w-24 rounded-full" />
            <span className="flex-1" />
            <span className="h-10 w-10 shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/25" />
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-border/60 py-3 pl-3.5 pr-3 md:hidden">
          <Skeleton className="h-[18px] w-[18px] rounded-md" />
          <Skeleton className="h-3.5 w-14 rounded-full" />
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
        <PlannerColumnSkeleton rows={5} />
        <PlannerColumnSkeleton rows={5} />
        <PlannerColumnSkeleton rows={4} className="hidden md:flex" />
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
          <Skeleton className="aspect-square rounded-lg" />
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
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
              {['w-16', 'w-20', 'w-[4.5rem]', 'w-[4.5rem]', 'w-20'].map(
                (w, i) => (
                  <Skeleton
                    key={i}
                    className={cn('h-10 shrink-0 rounded-full', w)}
                  />
                ),
              )}
            </div>
            <Skeleton className="h-10 w-10 shrink-0 rounded-full md:w-24" />
            <Skeleton className="h-10 w-10 shrink-0 rounded-full md:w-24" />
          </div>
          <WardrobeGridSkeleton />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function FriendsLeaderboardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="overflow-hidden rounded-[20px] border border-border/60 bg-card">
          <Skeleton className="h-[144px] rounded-none sm:h-[170px]" />
          <div className="space-y-2 px-3 py-3">
            <Skeleton className="h-4 w-2/3 rounded-full" />
            <Skeleton className="h-3 w-4/5 rounded-full" />
          </div>
          <div className="flex gap-2 border-t border-border/40 p-2">
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="h-11 flex-1 rounded-xl" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function FriendsSectionSkeleton() {
  return <div className="mb-3 space-y-2 px-1"><Skeleton className="h-5 w-40 rounded-full" /><Skeleton className="h-3 w-3/4 max-w-[280px] rounded-full" /></div>;
}

export function FriendsPageSkeleton() {
  return (
    <SkeletonShell label="Loading your friends and shared habits" className="relative min-h-[100dvh] overflow-x-hidden pb-24 md:pb-12">
      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-3 pb-4 pt-[calc(3rem+env(safe-area-inset-top))] md:px-6 md:pt-12">
        <div className="relative h-[232px] w-full max-w-[480px] md:h-[286px] md:max-w-[760px]">
          <div className="absolute bottom-4 left-[16%] -ml-11 flex w-[88px] flex-col items-center gap-2 md:left-[22%] lg:left-[28%]"><Skeleton className="h-20 w-20 rounded-[35px]" /><Skeleton className="h-7 w-16 rounded-full" /></div>
          <div className="absolute bottom-4 left-[84%] -ml-11 flex w-[88px] flex-col items-center gap-2 md:left-[78%] lg:left-[72%]"><Skeleton className="h-20 w-20 rounded-[35px]" /><Skeleton className="h-7 w-16 rounded-full" /></div>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3"><Skeleton className="h-[150px] w-[160px] rounded-[60px] md:h-[175px] md:w-[180px]" /><Skeleton className="h-9 w-20 rounded-full" /></div>
        </div>
        <div className="relative z-10 flex min-h-[68px] w-full max-w-[688px] items-center gap-3 rounded-[20px] border border-border/60 bg-card px-3.5 py-3 shadow-sm">
          <div className="hidden w-[220px] shrink-0 items-center gap-2 border-r border-border/50 pr-3 md:flex"><Skeleton className="h-4 w-20 rounded-full" /><Skeleton className="h-3 flex-1 rounded-full" /></div>
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3 rounded-full" /><Skeleton className="h-3 w-4/5 rounded-full" /></div>
        </div>
        <div className="relative z-20 -mx-3 -mt-12 flex w-[calc(100%+1.5rem)] flex-col gap-6 px-3 pt-16 md:mx-auto md:-mt-6 md:w-full md:max-w-3xl md:px-8 md:pt-14">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-[linear-gradient(to_bottom,transparent,hsl(var(--background))_40px)]" />
          <section>
            <FriendsSectionSkeleton />
            <div className="rounded-[20px] border border-border/60 bg-card p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-3"><div className="flex-1 space-y-2"><Skeleton className="h-3 w-20 rounded-full" /><Skeleton className="h-5 w-2/3 rounded-full" /><Skeleton className="h-3 w-24 rounded-full" /></div><Skeleton className="h-[66px] w-[128px] rounded-2xl" /></div>
              <div className="mt-3 grid grid-cols-2 gap-2"><Skeleton className="h-9 rounded-xl" /><Skeleton className="h-9 rounded-xl" /></div>
              <div className="mt-3 flex items-center gap-3"><Skeleton className="h-3 flex-1 rounded-full" /><Skeleton className="h-10 w-24 rounded-xl" /></div>
            </div>
            <div className="mt-2.5 flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-3.5"><Skeleton className="h-10 w-10 shrink-0 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/5 rounded-full" /><Skeleton className="h-3 w-full rounded-full" /></div></div>
          </section>
          <section>
            <FriendsSectionSkeleton />
            <div className="rounded-[20px] border border-border/60 bg-card p-3.5"><div className="flex items-center gap-3"><Skeleton className="h-11 w-11 shrink-0 rounded-2xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2 rounded-full" /><Skeleton className="h-3 w-full rounded-full" /></div></div><Skeleton className="mt-4 h-11 w-full rounded-xl" /></div>
          </section>
          <section><FriendsSectionSkeleton /><FriendsLeaderboardSkeleton /></section>
          <section><FriendsSectionSkeleton /><div className="grid grid-cols-4 gap-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}</div></section>
          <section><FriendsSectionSkeleton /><Skeleton className="h-[180px] w-full rounded-[20px]" /></section>
        </div>
      </div>
    </SkeletonShell>
  );
}
