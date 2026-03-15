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
  timesPerWeek?: number;
  userTags?: { id: string; name: string; color: string }[];
  frogodoroSession?: {
    date: string;
    completedCycles: number;
    timeSpent: number;
  };
  onToggle?: (id: string, date: string, currentStatus: boolean) => void;
  onMenuOpen?: (e: React.MouseEvent, id: string) => void;
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
  timesPerWeek,
  userTags,
  frogodoroSession,
  onToggle,
  onMenuOpen,
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
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/8 dark:bg-primary/15">
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                <span className="text-xs font-black text-primary tabular-nums">
                  {frogodoroSession.completedCycles}
                </span>
                <span className="text-[11px] font-bold text-primary/60 tabular-nums">
                  {(() => {
                    const s = frogodoroSession.timeSpent;
                    const m = Math.floor(s / 60);
                    const sec = s % 60;
                    if (s < 60) return `${s}s`;
                    return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
                  })()}
                </span>
              </div>
            </div>
          )}

          {/* Weekly Goal Progress Dots */}
          {type === 'habit' && (
            <div className="flex items-center gap-1.5 mt-2">
              {(() => {
                const goal = timesPerWeek || 7;

                let allCompleted = [...(completedDates || [])];
                if (completed) {
                  if (!allCompleted.includes(date)) allCompleted.push(date);
                } else {
                  allCompleted = allCompleted.filter(d => d !== date);
                }

                const getWeekDates = (refDate: string) => {
                  const d = new Date(refDate);
                  const dow = d.getDay();
                  const sun = new Date(d);
                  sun.setDate(d.getDate() - dow);
                  sun.setHours(0,0,0,0);
                  const dates: string[] = [];
                  for (let i = 0; i < 7; i++) {
                    const wd = new Date(sun);
                    wd.setDate(sun.getDate() + i);
                    dates.push(wd.toISOString().split('T')[0]);
                  }
                  return dates;
                };

                const weekDates = getWeekDates(date);
                const completedThisWeek = weekDates.filter(d => allCompleted.includes(d)).length;

                // Weekly streak
                let weekStreak = 0;
                let checkDate = date;
                while (true) {
                  const wk = getWeekDates(checkDate);
                  const count = wk.filter(d => allCompleted.includes(d)).length;
                  if (count >= goal) {
                    weekStreak++;
                    const prev = new Date(wk[0]);
                    prev.setDate(prev.getDate() - 1);
                    checkDate = prev.toISOString().split('T')[0];
                  } else {
                    break;
                  }
                }

                return (
                  <>
                    {Array.from({ length: goal }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          'w-3 h-3 rounded-full border transition-all duration-300 flex-shrink-0',
                          i < completedThisWeek
                            ? 'bg-green-500 border-green-600 shadow-sm shadow-green-500/20'
                            : 'bg-muted border-border/50'
                        )}
                      />
                    ))}
                    {weekStreak > 0 && (
                      <span className="text-[10px] font-black text-orange-500 ml-1 uppercase tracking-tight flex items-center gap-0.5">
                        <span className="text-[12px]">🔥</span> {weekStreak} Week Streak
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
