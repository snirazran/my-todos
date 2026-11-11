'use client';

import React, { useMemo, useState } from 'react';
import { Bell, Check, ChevronDown, Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { hapticTick } from '@/lib/haptics';
import { Wheel } from './Wheel';
import { HOURS_24, REMINDER_OFFSET_OPTIONS } from './constants';
import { nextHalfHourHm, pad } from './utils';
import { PRIMARY_BUTTON, Squircle, type Tint } from './kit';

type DayPart = {
  id: 'morning' | 'afternoon' | 'evening' | 'night';
  label: string;
  hour: number;
  minute: number;
  tint: Tint;
  Icon: typeof Sun;
};

const DAY_PARTS: DayPart[] = [
  { id: 'morning', label: 'Morning', hour: 8, minute: 0, tint: 'amber', Icon: Sunrise },
  { id: 'afternoon', label: 'Afternoon', hour: 13, minute: 0, tint: 'sky', Icon: Sun },
  { id: 'evening', label: 'Evening', hour: 18, minute: 0, tint: 'rose', Icon: Sunset },
  { id: 'night', label: 'Night', hour: 21, minute: 0, tint: 'violet', Icon: Moon },
];

function partForHour(hour: number): DayPart['id'] {
  if (hour >= 21 || hour < 5) return 'night';
  if (hour >= 17) return 'evening';
  if (hour >= 12) return 'afternoon';
  return 'morning';
}

const MINUTE_STEP = 5;

const offsetLabel = (opt: (typeof REMINDER_OFFSET_OPTIONS)[number]) =>
  opt.minutes === 0 ? opt.label : `${opt.label} early`;

export function NotifyView({
  time,
  reminder,
  onSave,
  saveLabel,
  saveDisabled = false,
  canRemove = false,
  onRemove,
}: {
  time: string;
  reminder: string;
  onSave: (time: string, reminder: string) => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  canRemove?: boolean;
  onRemove?: () => void;
}) {
  const [draft, setDraft] = useState(() => {
    const [h, m] = (time || nextHalfHourHm()).split(':').map(Number);
    return {
      hour: Number.isFinite(h) ? h : 9,
      minute: Number.isFinite(m) ? m : 0,
    };
  });
  const [offset, setOffset] = useState(reminder || 'at_time');
  const [offsetOpen, setOffsetOpen] = useState(false);

  const minuteItems = useMemo(() => {
    const items: number[] = [];
    for (let m = 0; m < 60; m += MINUTE_STEP) items.push(m);
    if (draft.minute % MINUTE_STEP !== 0) {
      items.push(draft.minute);
      items.sort((a, b) => a - b);
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedOffset =
    REMINDER_OFFSET_OPTIONS.find((opt) => opt.value === offset) ??
    REMINDER_OFFSET_OPTIONS[0];
  const alertTotal =
    (((draft.hour * 60 + draft.minute - selectedOffset.minutes) % 1440) + 1440) %
    1440;
  const alertTime = `${pad(Math.floor(alertTotal / 60))}:${pad(alertTotal % 60)}`;
  const activePart = partForHour(draft.hour);

  return (
    <>
      <div className="relative mb-4 flex h-8 items-center justify-center">
        <h3 className="text-[17px] font-black tracking-tight text-foreground">
          Reminder
        </h3>
      </div>

      <div
        role="radiogroup"
        aria-label="Part of the day"
        className="mb-3 grid grid-cols-4 gap-2"
      >
        {DAY_PARTS.map((part) => {
          const selected = part.id === activePart;
          return (
            <button
              key={part.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                hapticTick();
                setDraft({ hour: part.hour, minute: part.minute });
              }}
              className={`flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl text-[12.5px] font-extrabold transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] ${
                selected
                  ? 'bg-primary/10 text-primary ring-2 ring-inset ring-primary/40'
                  : 'bg-muted/50 text-foreground/70 [@media(hover:hover)]:hover:bg-muted'
              }`}
            >
              <Squircle tint={part.tint} size="md">
                <part.Icon className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </Squircle>
              {part.label}
            </button>
          );
        })}
      </div>

      <div className="relative mb-3 rounded-[24px] bg-muted/50 px-4">
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-[56%] text-[30px] font-black leading-none text-foreground/35"
        >
          :
        </span>
        <Wheel
          className="mx-auto max-w-[248px]"
          itemHeight={52}
          visibleItems={3}
          shrink={0.34}
          bandClassName="rounded-[18px] bg-[hsl(var(--card-raised))] shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_3px_0_0_rgba(15,23,42,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_3px_0_0_rgba(0,0,0,0.35)]"
          selectedClassName="text-[38px] font-black tracking-tight text-foreground"
          itemClassName="text-[38px] font-black tracking-tight text-muted-foreground/55"
          columns={[
            {
              items: HOURS_24,
              value: draft.hour,
              onChange: (hour) => setDraft((d) => ({ ...d, hour })),
              formatLabel: pad,
              label: 'Hour',
            },
            {
              items: minuteItems,
              value: draft.minute,
              onChange: (minute) => setDraft((d) => ({ ...d, minute })),
              formatLabel: pad,
              label: 'Minute',
            },
          ]}
        />
      </div>

      <div className="mb-4 rounded-2xl bg-muted/50">
        <button
          type="button"
          aria-expanded={offsetOpen}
          onClick={() => setOffsetOpen((v) => !v)}
          className="flex h-14 w-full items-center gap-3 rounded-2xl pl-2.5 pr-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Squircle tint="amber" size="lg">
            <Bell className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </Squircle>
          <span className="min-w-0 flex-1 text-[15px] font-extrabold text-foreground">
            Remind me
          </span>
          <span className="text-[14.5px] font-extrabold text-primary">
            {offsetLabel(selectedOffset)}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out ${
              offsetOpen ? 'rotate-180' : ''
            }`}
            strokeWidth={3}
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            offsetOpen
              ? 'visible grid-rows-[1fr] opacity-100'
              : 'invisible grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="grid grid-cols-2 gap-1.5 px-1.5 pb-1.5">
              {REMINDER_OFFSET_OPTIONS.map((opt) => {
                const selected = offset === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      hapticTick();
                      setOffset(opt.value);
                      setOffsetOpen(false);
                    }}
                    className={`flex h-11 items-center justify-between rounded-xl px-3.5 text-[14px] font-extrabold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] ${
                      selected
                        ? 'bg-primary/10 text-primary'
                        : 'bg-card text-foreground/80 [@media(hover:hover)]:hover:bg-background'
                    }`}
                  >
                    {offsetLabel(opt)}
                    {selected && <Check className="h-4 w-4" strokeWidth={3.5} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onSave(`${pad(draft.hour)}:${pad(draft.minute)}`, offset)
        }
        disabled={saveDisabled}
        className={PRIMARY_BUTTON}
      >
        {saveLabel ?? (
          <>
            <Bell className="h-[18px] w-[18px]" strokeWidth={3} />
            <span>
              Remind me at <span className="tabular-nums">{alertTime}</span>
            </span>
          </>
        )}
      </button>

      {canRemove && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-2 h-10 w-full rounded-xl text-[13.5px] font-bold text-rose-500 transition-colors disabled:opacity-50 [@media(hover:hover)]:hover:bg-rose-500/10"
        >
          Remove reminder
        </button>
      )}
    </>
  );
}
