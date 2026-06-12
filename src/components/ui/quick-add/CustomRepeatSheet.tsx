'use client';

import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, ChevronUp, X } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { TimeSliderColumn } from './TimeSliderColumn';
import { EndDateCalendarSheet } from './EndDateCalendarSheet';
import {
  dayOfMonthFromYmd,
  formatEndDateLabel,
  parseYmdLocal,
  type RepeatFreq,
  type RepeatRule,
} from './utils';

const EVERY_MAX: Record<RepeatFreq, number> = {
  daily: 100,
  weekly: 52,
  monthly: 12,
};

const UNIT: Record<RepeatFreq, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

// Pills are shown Mon→Sun; map each to its JS weekday (0=Sun..6=Sat).
const WEEKDAY_PILLS: Array<{ label: string; api: number }> = [
  { label: 'Mon', api: 1 },
  { label: 'Tue', api: 2 },
  { label: 'Wed', api: 3 },
  { label: 'Thu', api: 4 },
  { label: 'Fri', api: 5 },
  { label: 'Sat', api: 6 },
  { label: 'Sun', api: 0 },
];

const TABS: RepeatFreq[] = ['daily', 'weekly', 'monthly'];

/**
 * The "Custom…" recurrence builder: 3 tabs (Daily / Weekly / Monthly), each with
 * an "Every N" wheel, a day picker (weekly/monthly) and its own Ends control.
 * Commits the assembled rule via `onSave` when closed.
 */
export function CustomRepeatSheet({
  open,
  onClose,
  initialRule,
  initialEndDate,
  anchorYmd,
  onSave,
  zIndex = 1600,
}: {
  open: boolean;
  onClose: () => void;
  initialRule: RepeatRule | null;
  initialEndDate: string | null;
  /** Date the task sits on — seeds the default weekday / day-of-month. */
  anchorYmd: string;
  onSave: (rule: RepeatRule, endDate: string | null) => void;
  zIndex?: number;
}) {
  const anchorDow = parseYmdLocal(anchorYmd).getDay();
  const anchorDom = dayOfMonthFromYmd(anchorYmd);

  const [freq, setFreq] = useState<RepeatFreq>('daily');
  const [interval, setInterval] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([anchorDow]);
  const [monthdays, setMonthdays] = useState<number[]>([anchorDom]);
  const [endDate, setEndDate] = useState<string | null>(initialEndDate ?? null);

  const [everyExpanded, setEveryExpanded] = useState(false);
  const [endsExpanded, setEndsExpanded] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Seed from the incoming rule each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setEveryExpanded(false);
    setEndsExpanded(false);
    setShowCalendar(false);
    setEndDate(initialEndDate ?? null);
    if (initialRule) {
      setFreq(initialRule.freq);
      setInterval(initialRule.interval || 1);
      setWeekdays(
        initialRule.byWeekday?.length ? initialRule.byWeekday : [anchorDow],
      );
      setMonthdays(
        initialRule.byMonthday?.length ? initialRule.byMonthday : [anchorDom],
      );
    } else {
      setFreq('daily');
      setInterval(1);
      setWeekdays([anchorDow]);
      setMonthdays([anchorDom]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const buildRule = (): RepeatRule => {
    if (freq === 'weekly') {
      return {
        freq,
        interval,
        byWeekday: (weekdays.length ? weekdays : [anchorDow])
          .slice()
          .sort((a, b) => a - b),
      };
    }
    if (freq === 'monthly') {
      return {
        freq,
        interval,
        byMonthday: (monthdays.length ? monthdays : [anchorDom])
          .slice()
          .sort((a, b) => a - b),
      };
    }
    return { freq, interval };
  };

  const commitAndClose = () => {
    onSave(buildRule(), endDate);
    onClose();
  };

  const switchFreq = (next: RepeatFreq) => {
    if (next === freq) return;
    setFreq(next);
    setInterval(1);
    setEveryExpanded(false);
    // Ends is per-frequency — reset it when changing tabs.
    setEndDate(null);
    setEndsExpanded(false);
    if (next === 'weekly' && weekdays.length === 0) setWeekdays([anchorDow]);
    if (next === 'monthly' && monthdays.length === 0) setMonthdays([anchorDom]);
  };

  const toggleWeekday = (api: number) =>
    setWeekdays((cur) =>
      cur.includes(api) ? cur.filter((d) => d !== api) : [...cur, api],
    );

  const toggleMonthday = (d: number) =>
    setMonthdays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d],
    );

  const everyValue = `${interval} ${UNIT[freq]}${interval > 1 ? 's' : ''}`;
  const items = Array.from({ length: EVERY_MAX[freq] }, (_, i) => i + 1);

  const rowBase =
    'flex h-[60px] w-full items-center justify-between px-4 text-left text-[15px] font-extrabold transition-colors';

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        zIndex={zIndex}
        className="bg-background ring-1 ring-border/70 sm:mx-4 sm:max-w-[440px]"
      >
        {() => (
          <div className="mx-auto w-full px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-6">
            <div className="relative mb-5 flex h-9 items-center justify-center">
              <button
                type="button"
                onClick={onClose}
                className="absolute left-0 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5 stroke-[3]" />
              </button>
              <h2 className="text-[18px] font-extrabold text-foreground">
                Repeat
              </h2>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex rounded-2xl bg-muted p-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchFreq(t)}
                  className={`flex-1 rounded-xl py-2.5 text-[14px] font-extrabold capitalize transition-all ${
                    freq === t
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Every + day picker */}
            <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-background">
              <button
                type="button"
                onClick={() => setEveryExpanded((v) => !v)}
                className={`${rowBase} text-foreground`}
              >
                Every
                <span className="flex items-center gap-1.5 text-[15px] font-extrabold text-primary">
                  {everyValue}
                  <ChevronUp
                    className={`h-4 w-4 stroke-[3] transition-transform ${
                      everyExpanded ? '' : 'rotate-180'
                    }`}
                  />
                </span>
              </button>

              {everyExpanded && (
                <>
                  <div className="mx-4 border-t border-border" />
                  <div className="relative px-4 py-2">
                    <div className="pointer-events-none absolute inset-x-4 top-1/2 z-0 h-11 -translate-y-1/2 rounded-2xl bg-primary/10 ring-1 ring-primary/25" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-background to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-background to-transparent" />
                    <div className="mx-auto max-w-[160px]">
                      <TimeSliderColumn
                        items={items}
                        value={interval}
                        onChange={(v) => setInterval(v)}
                      />
                    </div>
                  </div>
                </>
              )}

              {freq === 'weekly' && (
                <>
                  <div className="mx-4 border-t border-border" />
                  <div className="flex flex-wrap gap-1.5 px-3 py-3">
                    {WEEKDAY_PILLS.map((d) => {
                      const active = weekdays.includes(d.api);
                      return (
                        <button
                          key={d.api}
                          type="button"
                          onClick={() => toggleWeekday(d.api)}
                          className={`flex-1 rounded-xl py-2 text-[12px] font-extrabold transition-colors ${
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {freq === 'monthly' && (
                <>
                  <div className="mx-4 border-t border-border" />
                  <div className="grid grid-cols-7 gap-1.5 px-3 py-3">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                      const active = monthdays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleMonthday(d)}
                          className={`grid h-9 place-items-center rounded-xl text-[13px] font-extrabold transition-colors ${
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70'
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Ends */}
            <div className="overflow-hidden rounded-2xl border border-border bg-background">
              <button
                type="button"
                onClick={() => setEndsExpanded((v) => !v)}
                className={`${rowBase} text-foreground`}
              >
                Ends
                <span className="flex items-center gap-1.5 text-[15px] font-extrabold text-primary">
                  {endDate ? formatEndDateLabel(endDate) : 'Never'}
                  <ChevronUp
                    className={`h-4 w-4 stroke-[3] transition-transform ${
                      endsExpanded ? '' : 'rotate-180'
                    }`}
                  />
                </span>
              </button>
              {endsExpanded && (
                <>
                  <div className="mx-4 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => setEndDate(null)}
                    className={`${rowBase} text-foreground hover:bg-primary/5`}
                  >
                    Never
                    {!endDate && (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-4 w-4 stroke-[3]" />
                      </span>
                    )}
                  </button>
                  <div className="mx-4 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => setShowCalendar(true)}
                    className={`${rowBase} text-foreground hover:bg-primary/5`}
                  >
                    On a date
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {endDate && (
                        <span className="text-[15px] font-extrabold text-primary">
                          {formatEndDateLabel(endDate)}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 stroke-[3]" />
                    </span>
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={commitAndClose}
              className="mt-5 h-11 w-full rounded-xl bg-primary text-[14px] font-extrabold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.985]"
            >
              Done
            </button>
          </div>
        )}
      </BaseSheet>

      <EndDateCalendarSheet
        open={open && showCalendar}
        value={endDate}
        minDateKey={anchorYmd}
        onSelect={(d) => {
          setEndDate(d);
          setShowCalendar(false);
        }}
        onClose={() => setShowCalendar(false)}
        zIndex={zIndex + 100}
      />
    </>
  );
}
