'use client';

import { X, Clock, Bell, ChevronDown, Check } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── constants ─── */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,10…55
const ITEM_H = 32; // px height of each row

const REMINDER_OPTIONS = [
  { value: 'at_time', label: 'At time of event' },
  { value: '5m', label: '5 minutes before' },
  { value: '10m', label: '10 minutes before' },
  { value: '15m', label: '15 minutes before' },
  { value: '30m', label: '30 minutes before' },
  { value: '1h', label: '1 hour before' },
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/* ─── ScrollColumn ─── */

function ScrollColumn({
  items,
  value,
  onChange,
  formatLabel,
}: {
  items: number[];
  value: number;
  onChange: (v: number) => void;
  formatLabel?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const lastValueRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const scrollTopRef = useRef(0);
  const label = formatLabel || pad;

  // Sync scroll position when value changes externally
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    
    // Only sync if the value changed from OUTSIDE the scroll component
    if (value === lastValueRef.current) return;
    
    const idx = items.indexOf(value);
    if (idx < 0) return;

    isUpdatingRef.current = true;
    el.scrollTo({ top: idx * ITEM_H, behavior: 'auto' });
    lastValueRef.current = value;
    
    const timeout = setTimeout(() => {
      isUpdatingRef.current = false;
    }, 50);
    
    return () => clearTimeout(timeout);
  }, [value, items]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const el = ref.current;
      if (!el) return;
      const y = e.pageY;
      const walk = (y - startYRef.current) * 1.0; // 1:1 ratio
      el.scrollTop = scrollTopRef.current - walk;
    };

    const handleGlobalMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const el = ref.current;
      if (el) {
        el.style.cursor = '';
        el.style.scrollSnapType = 'y mandatory';
        const idx = Math.round(el.scrollTop / ITEM_H);
        el.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  const handleScroll = () => {
    const el = ref.current;
    if (!el || isDraggingRef.current || isUpdatingRef.current) return;
    
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    const newValue = items[clamped];
    
    // Only update if it's a real change and we're close to a snap point
    const isCloseToSnap = Math.abs(el.scrollTop - idx * ITEM_H) < 5;
    if (newValue !== value && isCloseToSnap) {
      lastValueRef.current = newValue;
      onChange(newValue);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    isDraggingRef.current = true;
    startYRef.current = e.pageY;
    scrollTopRef.current = el.scrollTop;
    el.style.cursor = 'grabbing';
    el.style.scrollSnapType = 'none';
  };

  return (
    <div className="relative h-[100px] w-[50px] overflow-hidden select-none">
      <div className="pointer-events-none absolute inset-x-0 top-[34px] h-[32px] rounded-lg bg-primary/10 z-10" />
      <div
        ref={ref}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        className="h-full overflow-y-auto no-scrollbar snap-y snap-mandatory"
        style={{ paddingTop: 34, paddingBottom: 34 }}
      >
        {items.map((item) => (
          <div key={item} style={{ height: ITEM_H }} className="w-full flex items-center justify-center snap-center">
            <button
              type="button"
              onClick={() => {
                onChange(item);
                ref.current?.scrollTo({ top: items.indexOf(item) * ITEM_H, behavior: 'smooth' });
              }}
              className={`text-sm font-bold transition-all ${item === value ? 'text-primary scale-110' : 'text-slate-400'}`}
            >
              {label(item)}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── TimePicker ─── */

function TimePicker({
  value,
  onChange,
  minTime,
}: {
  value: string; // "HH:mm" or ""
  onChange: (v: string) => void;
  minTime?: string;
}) {
  const minH = minTime ? parseInt(minTime.split(':')[0], 10) : -1;
  const minM = minTime ? parseInt(minTime.split(':')[1], 10) : -1;

  const availableHours = minTime ? HOURS.filter(h => h >= minH) : HOURS;
  const h = value ? parseInt(value.split(':')[0], 10) : (availableHours[0] ?? 0);
  const m = value ? parseInt(value.split(':')[1], 10) : 0;
  const snappedM = Math.round(m / 5) * 5 === 60 ? 55 : Math.round(m / 5) * 5;

  const availableMinutes = (minTime && h === minH) ? MINUTES.filter(mn => mn > minM) : MINUTES;

  return (
    <div className="flex items-center justify-center gap-1">
      <ScrollColumn items={availableHours} value={h} onChange={(newH) => {
        let validM = snappedM;
        if (minTime && newH === minH) {
           const first = MINUTES.find(mn => mn > minM);
           if (first !== undefined && validM <= minM) validM = first;
        }
        onChange(`${pad(newH)}:${pad(validM)}`);
      }} />
      <span className="text-lg font-black text-slate-300 dark:text-slate-600">:</span>
      <ScrollColumn items={availableMinutes} value={snappedM} onChange={(v) => onChange(`${pad(h)}:${pad(v)}`)} />
    </div>
  );
}

/* ─── Dialog ─── */

interface Props {
  open: boolean;
  taskName: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialReminder?: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (data: { startTime: string; endTime: string; reminder: string }) => void;
}

export function ScheduleTaskDialog({
  open,
  taskName,
  initialStartTime = '',
  initialEndTime = '',
  initialReminder = '',
  busy,
  onClose,
  onSave,
}: Props) {
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [notifyEnabled, setNotifyEnabled] = useState(!!initialReminder);
  const [reminder, setReminder] = useState(initialReminder || 'at_time');
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [activeField, setActiveField] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (open) {
      setStartTime(initialStartTime);
      setEndTime(initialEndTime);
      setNotifyEnabled(!!initialReminder);
      setReminder(initialReminder || 'at_time');
      setShowReminderPicker(false);
      setActiveField(null);
    }
  }, [open, initialStartTime, initialEndTime, initialReminder]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const handleSave = () => {
    onSave({
      startTime,
      endTime,
      reminder: notifyEnabled ? reminder : '',
    });
  };

  const selectedReminderLabel =
    REMINDER_OPTIONS.find((o) => o.value === reminder)?.label || 'At time of event';

  const formatDisplay = (t: string) => {
    if (!t) return '--:--';
    const [hh, mm] = t.split(':').map(Number);
    const suffix = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 || 12;
    return `${h12}:${pad(mm)} ${suffix}`;
  };

  const dialogContent = (
    <div
      className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Schedule
            </p>
            <h4 className="text-base font-bold text-slate-900 dark:text-white leading-snug truncate">
              {taskName}
            </h4>
          </div>
          <button
            className="flex-shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-2 space-y-3">
          {/* Time chips */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!startTime) {
                  setStartTime('00:00');
                }
                setActiveField(activeField === 'start' ? null : 'start');
              }}
              className={`flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl transition-all ${
                activeField === 'start'
                  ? 'bg-primary/10 dark:bg-primary/20 ring-2 ring-primary/40'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${activeField === 'start' ? 'text-primary' : 'text-slate-400'}`} />
              <div className="text-left">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Start</p>
                <p className={`text-sm font-bold ${startTime ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                  {formatDisplay(startTime)}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!startTime) return;
                setActiveField(activeField === 'end' ? null : 'end');
              }}
              className={`flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl transition-all relative ${
                !startTime
                  ? 'bg-slate-50 dark:bg-slate-800/50 opacity-40 cursor-not-allowed'
                  : activeField === 'end'
                    ? 'bg-primary/10 dark:bg-primary/20 ring-2 ring-primary/40'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${activeField === 'end' ? 'text-primary' : 'text-slate-400'}`} />
              <div className="text-left">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">End</p>
                <p className={`text-sm font-bold ${endTime ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                  {formatDisplay(endTime)}
                </p>
              </div>
              {endTime && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEndTime('');
                    if (activeField === 'end') setActiveField(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </button>
          </div>

          {/* Scroll picker — shown when a field is active */}
          {activeField && (
            <div className="py-2 flex justify-center">
              <TimePicker
                key={activeField}
                value={activeField === 'start' ? startTime : endTime}
                minTime={activeField === 'end' ? startTime : undefined}
                onChange={(v) => {
                  if (activeField === 'start') {
                    setStartTime(v);
                  } else {
                    setEndTime(v);
                  }
                }}
              />
            </div>
          )}

          {/* Notify Me Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setNotifyEnabled(!notifyEnabled)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all ${
                notifyEnabled
                  ? 'bg-primary/10 dark:bg-primary/20 ring-1 ring-primary/30'
                  : 'bg-slate-100 dark:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bell className={`w-4 h-4 transition-colors ${
                  notifyEnabled ? 'text-primary' : 'text-slate-400'
                }`} />
                <span className={`text-sm font-bold transition-colors ${
                  notifyEnabled ? 'text-primary' : 'text-slate-600 dark:text-slate-300'
                }`}>
                  Notify me
                </span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${
                notifyEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  notifyEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
            </button>

            {/* Reminder Picker */}
            {notifyEnabled && (
              <div className="pt-2.5">
                <button
                  type="button"
                  onClick={() => setShowReminderPicker(!showReminderPicker)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors"
                >
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {selectedReminderLabel}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${
                    showReminderPicker ? 'rotate-180' : ''
                  }`} />
                </button>

                {showReminderPicker && (
                  <div className="mt-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
                    {REMINDER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setReminder(option.value);
                          setShowReminderPicker(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors ${
                          reminder === option.value
                            ? 'bg-primary/10 text-primary font-bold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 font-medium'
                        }`}
                      >
                        {option.label}
                        {reminder === option.value && (
                          <Check className="w-3.5 h-3.5 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 pt-3 flex flex-col gap-2">
          <button
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 shadow-sm"
            onClick={handleSave}
            disabled={busy || !startTime}
          >
            {busy ? 'Saving...' : 'Save'}
          </button>
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
