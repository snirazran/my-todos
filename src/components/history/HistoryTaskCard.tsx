'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, RotateCcw, CalendarClock, EllipsisVertical } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';

export type HistoryTaskCardProps = {
  id: string;
  text: string;
  completed: boolean;
  type?: 'regular' | 'weekly' | 'backlog' | 'habit';
  tags?: string[];
  date: string;
  completedDates?: string[];
  daysOfWeek?: number[];
  userTags?: { id: string; name: string; color: string }[];
  frogodoroSession?: {
    date: string;
    completedCycles: number;
    timeSpent: number;
  };
  onToggle?: (id: string, date: string, currentStatus: boolean) => void;
  setFlyRef?: (el: HTMLDivElement | null) => void;
  isEaten?: boolean;
};

export default function HistoryTaskCard({
  id,
  text,
  completed,
  type,
  tags,
  date,
  completedDates,
  daysOfWeek,
  userTags,
  frogodoroSession,
  onToggle,
  setFlyRef,
  isEaten = false,
}: HistoryTaskCardProps) {
  const isWeekly = type === 'weekly';
  const displayedCompleted = completed || isEaten;

  const getTagDetails = (tagIdentifier: string) => {
    const byId = userTags?.find((t) => t.id === tagIdentifier);
    if (byId) return byId;
    return userTags?.find((t) => t.name === tagIdentifier);
  };

  const handleToggle = () => {
    if (onToggle) {
      onToggle(id, date, completed);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative flex items-stretch gap-3 p-3.5 transition-all duration-200 rounded-xl border select-none cursor-pointer',
        'bg-card border-border/80 shadow-sm hover:border-primary/50 hover:bg-primary/[0.03]',
      )}
      onClick={handleToggle}
    >
      <div
        className={cn(
          'flex items-stretch flex-1 min-w-0 gap-3 transition-opacity duration-200',
          displayedCompleted ? 'opacity-60' : 'opacity-100',
        )}
      >
        {/* Check/Fly Icon */}
        <div className="relative flex-shrink-0 w-7 h-7 self-center">
          <AnimatePresence initial={false}>
            {!displayedCompleted ? (
              <motion.div
                key="fly"
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {/* Fly or Empty Circle */}
                <div
                  ref={setFlyRef}
                  className="w-full h-full flex items-center justify-center"
                >
                  <Fly
                    size={28}
                    paused={displayedCompleted}
                    y={-4}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="check"
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <CheckCircle2 className="text-green-500 w-7 h-7 drop-shadow-sm" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Text & Meta */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {tags && tags.length > 0 && (
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {tags.map((tagId) => {
                const tagDetails = getTagDetails(tagId);
                if (!tagDetails) return null;

                const color = tagDetails.color;
                const name = tagDetails.name;

                return (
                  <span
                    key={tagId}
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors border shadow-sm',
                      !color &&
                        'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800/50',
                    )}
                    style={
                      color
                        ? {
                            backgroundColor: `${color}20`,
                            color: color,
                            borderColor: `${color}40`,
                          }
                        : undefined
                    }
                  >
                    {name}
                  </span>
                );
              })}
            </div>
          )}

          <div
            className={cn(
              'whitespace-pre-wrap break-words text-base font-medium md:text-lg transition-colors flex items-center gap-1.5',
              displayedCompleted
                ? 'text-muted-foreground line-through decoration-2 opacity-80'
                : 'text-foreground',
            )}
          >
            <span>{text}</span>
            {isWeekly && (
              <RotateCcw className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
            )}
          </div>

          {frogodoroSession && frogodoroSession.timeSpent > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold text-green-700 bg-green-50 dark:bg-green-900/40 dark:text-green-200 border border-green-200 dark:border-green-800/50 uppercase tracking-wider">
                🐸 {frogodoroSession.completedCycles} •{' '}
                {Math.round(frogodoroSession.timeSpent / 60)}m
              </span>
            </div>
          )}

          {/* Habit History Tracker (Mirroring HabitItem) */}
          {type === 'habit' && (
            <div className="flex items-center gap-1.5 mt-2">
              {(() => {
                const weekDays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                // Use 'date' (historical date) as the reference for 'today' in the 7-day view
                const baseDate = new Date(`${date}T12:00:00Z`);
                const pastWeekDates = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(baseDate);
                  d.setUTCDate(d.getUTCDate() - (6 - i));
                  const dStr = [
                    d.getUTCFullYear(),
                    String(d.getUTCMonth() + 1).padStart(2, '0'),
                    String(d.getUTCDate()).padStart(2, '0'),
                  ].join('-');
                  return {
                    dateStr: dStr,
                    dayIdx: d.getUTCDay(),
                    isTargetDate: i === 6,
                  };
                });

                return pastWeekDates.map((info, i) => {
                  const isScheduled = (daysOfWeek || []).includes(info.dayIdx);
                  if (!isScheduled) return null;

                  const allCompleted = completedDates || [];
                  const isDayCompleted =
                    allCompleted.includes(info.dateStr) ||
                    (info.isTargetDate && completed);

                  let dotColor = 'bg-muted text-muted-foreground/30';
                  if (isDayCompleted) {
                    dotColor =
                      'bg-green-500 text-white shadow-sm shadow-green-500/25';
                  } else if (!info.isTargetDate) {
                    // Check if it should be red (missed) for PAST days only
                    const wasTracked = allCompleted.some(
                      (d) => d <= info.dateStr,
                    );
                    if (wasTracked)
                      dotColor =
                        'bg-red-500 text-white shadow-sm shadow-red-500/25';
                  }

                  return (
                    <div
                      key={i}
                      className={cn(
                        'w-6 h-6 flex items-center justify-center rounded-full text-[9px] font-bold tracking-tighter',
                        dotColor,
                      )}
                    >
                      {weekDays[info.dayIdx]}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
