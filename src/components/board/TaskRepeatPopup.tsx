'use client';

import React, { useEffect, useState } from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { RepeatView } from '@/components/ui/quick-add/RepeatView';
import { EndDateCalendarSheet } from '@/components/ui/quick-add/EndDateCalendarSheet';
import { CustomRepeatSheet } from '@/components/ui/quick-add/CustomRepeatSheet';
import type { RepeatMode, RepeatRule } from '@/components/ui/quick-add/utils';
import { todayYmd } from '@/components/board/helpers';

interface TaskRepeatPopupProps {
  open: boolean;
  onClose: () => void;
  currentMode: RepeatMode;
  repeatDayLabel: string;
  /** Label for the monthly option, e.g. "Every month on the 11th". */
  monthlyLabel: string;
  /** Current repeat end date (YYYY-MM-DD) or null/undefined for "never". */
  currentEndDate?: string | null;
  /** Current custom rule (when currentMode === 'custom'). */
  currentRule?: RepeatRule | null;
  /** Date the task sits on — seeds custom defaults & monthly anchor. */
  anchorYmd: string;
  onChange: (
    mode: RepeatMode,
    endDate: string | null,
    rule: RepeatRule | null,
  ) => void;
}

export function TaskRepeatPopup({
  open,
  onClose,
  currentMode,
  repeatDayLabel,
  monthlyLabel,
  currentEndDate,
  currentRule,
  anchorYmd,
  onChange,
}: TaskRepeatPopupProps) {
  // Stage the mode + end date + rule locally; commit on "Done".
  const [mode, setMode] = useState<RepeatMode>(currentMode);
  const [endDate, setEndDate] = useState<string | null>(currentEndDate ?? null);
  const [rule, setRule] = useState<RepeatRule | null>(currentRule ?? null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(currentMode);
      setEndDate(currentEndDate ?? null);
      setRule(currentRule ?? null);
      setShowCalendar(false);
      setShowCustom(false);
    }
  }, [open, currentMode, currentEndDate, currentRule]);

  const setRepeatMode = (next: RepeatMode) => {
    setRule(null);
    setMode(next);
    if (next === 'none') setEndDate(null);
  };

  const commit = () => {
    if (mode === 'none') onChange('none', null, null);
    else if (mode === 'custom') onChange('custom', endDate, rule);
    else onChange(mode, endDate, null);
    onClose();
  };

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        zIndex={1500}
        className="sm:max-w-[400px] max-h-[90vh]"
      >
        {({ bindScroll }) => (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              ref={bindScroll}
              className="min-h-0 flex-1 overflow-y-auto overscroll-none px-5 pt-2 sm:pt-5"
            >
              <h3 className="mb-1 text-center text-[17px] font-black text-foreground">
                Repeat
              </h3>
              <p className="mb-4 text-center text-[12px] font-medium text-muted-foreground">
                Choose when this task comes back.
              </p>

              <RepeatView
                currentMode={mode}
                setRepeatMode={setRepeatMode}
                repeatDayLabel={repeatDayLabel}
                monthlyLabel={monthlyLabel}
                endDate={endDate}
                onPickEndDate={() => setShowCalendar(true)}
                onClearEndDate={() => setEndDate(null)}
                customRule={rule}
                onOpenCustom={() => setShowCustom(true)}
              />
            </div>

            <div className="shrink-0 border-t border-border/50 bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3">
              <button
                onClick={commit}
                className="h-11 w-full rounded-xl bg-primary text-[14px] font-extrabold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.985]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </BaseSheet>

      <EndDateCalendarSheet
        open={open && showCalendar}
        value={endDate}
        minDateKey={todayYmd()}
        onSelect={(dateKey) => {
          setEndDate(dateKey);
          setShowCalendar(false);
        }}
        onClose={() => setShowCalendar(false)}
        zIndex={1700}
      />

      <CustomRepeatSheet
        open={open && showCustom}
        onClose={() => setShowCustom(false)}
        initialRule={rule}
        initialEndDate={endDate}
        anchorYmd={anchorYmd}
        onSave={(r, end) => {
          setRule(r);
          setEndDate(end);
          setMode('custom');
        }}
        zIndex={1600}
      />
    </>
  );
}
