'use client';

import React from 'react';
import { addDays, parseYmd, todayYmd } from './helpers';
import { BOARD_LIST_SURFACE } from '@/components/ui/taskSurfaces';

type DayLabel = { name: string; date: string | null };

function labelFor(
  title: string,
  dateKey?: string,
  longNames = true,
  relativeDates = true,
): DayLabel {
  if (dateKey) {
    const today = todayYmd();
    const d = parseYmd(dateKey);
    const date = d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    const weekday = d.toLocaleString('en-US', {
      weekday: longNames ? 'long' : 'short',
    });
    const relativeDate = !relativeDates
      ? null
      : longNames
        ? `${weekday.slice(0, 3)}, ${date}`
        : date;
    if (dateKey === today) return { name: 'Today', date: relativeDate };
    if (dateKey === addDays(today, 1)) return { name: 'Tomorrow', date: relativeDate };
    if (dateKey === addDays(today, -1)) return { name: 'Yesterday', date: relativeDate };
    return { name: weekday, date };
  }
  const match = title.match(/^(.*) (\d+\/\d+)$/);
  return match ? { name: match[1], date: match[2] } : { name: title, date: null };
}

function DayHeading({
  label,
  isToday,
  isPast,
  status,
  large = false,
}: {
  label: DayLabel;
  isToday: boolean;
  isPast: boolean;
  status?: React.ReactNode;
  large?: boolean;
}) {
  return (
    <h2 className="flex min-w-0 items-baseline gap-2">
      <span
        className={`shrink-0 font-black leading-none tracking-tight ${
          large ? 'text-[19px]' : 'text-[18px]'
        } ${
          isToday
            ? 'text-primary'
            : isPast
              ? 'text-muted-foreground/70'
              : 'text-foreground'
        }`}
      >
        {label.name}
      </span>
      {(label.date || status) && (
        <span
          className={`min-w-0 truncate text-[13px] font-bold tabular-nums leading-none ${
            isPast ? 'text-muted-foreground/50' : 'text-muted-foreground'
          }`}
        >
          {label.date}
          {label.date && status ? ' · ' : null}
          {status}
        </span>
      )}
    </h2>
  );
}

export default function DayColumn({
  title,
  dateKey,
  count,
  totalCount,
  listRef,
  children,
  footer,
  maxHeightClass = 'max-h-[65svh] md:max-h-[74svh]',
  compact = false,
  fill = false,
  headingOutside = false,
  isToday = false,
  isPast = false,
  headerAction,
  note,
  disableVerticalScroll = false,
  longNames = true,
}: {
  title: string;
  dateKey?: string;
  count?: number;
  totalCount?: number;
  listRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeightClass?: string;
  compact?: boolean;
  /** Size to the list but never past the slide's height. */
  fill?: boolean;
  /** Mobile: the day heading sits above the card, like Home's list header. */
  headingOutside?: boolean;
  isToday?: boolean;
  isPast?: boolean;
  headerAction?: React.ReactNode;
  note?: React.ReactNode;
  disableVerticalScroll?: boolean;
  longNames?: boolean;
}) {
  const appliedMax = compact
    ? 'max-h-[60svh] md:max-h-[70svh]'
    : maxHeightClass;
  const label = labelFor(title, dateKey, longNames, !headingOutside);

  const open = count ?? 0;
  const total = totalCount ?? count ?? 0;
  const status =
    total === 0 ? null : isPast ? (
      open === 0 ? (
        'All done'
      ) : (
        `${total - open}/${total} done`
      )
    ) : open === 0 ? (
      <span className="text-primary">All done</span>
    ) : (
      `${open} left`
    );

  const heading = (
    <DayHeading
      label={label}
      isToday={isToday}
      isPast={isPast}
      status={status}
      large={headingOutside}
    />
  );
  const actions = headerAction ? (
    <div className="relative flex shrink-0 items-center gap-0.5">
      {headerAction}
    </div>
  ) : null;

  const card = (
    <section
      className={[
        `relative flex flex-col overflow-hidden ${BOARD_LIST_SURFACE}`,
        fill ? (headingOutside ? 'min-h-0' : 'max-h-full') : appliedMax,
      ].join(' ')}
    >
      {!headingOutside && (
        <div className="flex min-h-[48px] shrink-0 items-center justify-between gap-2 pb-0.5 pl-3.5 pr-1.5 pt-1.5 md:pl-3">
          {heading}
          {actions}
        </div>
      )}

      {note ? (
        <div className="shrink-0 px-3.5 pb-0.5 pt-1.5 md:px-3">{note}</div>
      ) : null}

      <div
        ref={listRef}
        className={[
          'relative flex-auto overflow-x-hidden',
          disableVerticalScroll
            ? 'overflow-y-visible touch-pan-y'
            : 'min-h-0 overflow-y-auto no-scrollbar touch-pan-y overscroll-y-contain',
        ].join(' ')}
      >
        {children}
      </div>

      {footer ? (
        <div data-column-footer className="shrink-0 px-2 pb-2">
          {footer}
        </div>
      ) : null}
    </section>
  );

  if (!headingOutside) return card;

  return (
    <div className={fill ? 'flex h-full flex-col' : 'flex flex-col'}>
      <div className="flex min-h-9 shrink-0 items-center justify-between gap-2 pb-1.5 pl-3.5 pr-0.5">
        {heading}
        {actions}
      </div>
      {card}
    </div>
  );
}
