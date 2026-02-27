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

          {/* Weekly Goal Progress Dots */}
          {type === 'habit' && (
            <div className="flex items-center gap-1.5 mt-2">
              {(() => {
                const goal = timesPerWeek || 7;
                
                // Effective completed dates for this view
                let allCompleted = [...(completedDates || [])];
                if (completed) {
                  if (!allCompleted.includes(date)) allCompleted.push(date);
                } else {
                  allCompleted = allCompleted.filter(d => d !== date);
                }

                // Calculate completions in the week containing 'date' (Sun-Sat)
                const dDate = new Date(date);
                const dayOfWeek = dDate.getDay();
                const sun = new Date(dDate);
                sun.setDate(dDate.getDate() - dayOfWeek);
                sun.setHours(0,0,0,0);
                
                const weekDates: string[] = [];
                for (let i = 0; i < 7; i++) {
                  const d = new Date(sun);
                  d.setDate(sun.getDate() + i);
                  weekDates.push(d.toISOString().split('T')[0]);
                }
                
                const completedThisWeek = weekDates.filter(d => allCompleted.includes(d)).length;

                return Array.from({ length: 7 }).map((_, i) => {
                  if (i >= goal) return null;
                  const isFilled = i < completedThisWeek;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'w-3 h-3 rounded-full border transition-all duration-300 flex-shrink-0',
                        isFilled 
                          ? 'bg-green-500 border-green-600 shadow-sm shadow-green-500/20 scale-105' 
                          : 'bg-muted border-border/50'
                      )}
                    />
                  );
                });
              })()}
              {(() => {
                // Effective completed dates for streak calculation
                let allCompleted = [...(completedDates || [])];
                if (completed) {
                  if (!allCompleted.includes(date)) allCompleted.push(date);
                } else {
                  allCompleted = allCompleted.filter(d => d !== date);
                }

                if (allCompleted.length === 0) return null;
                
                let streak = 0;
                let curr = new Date(date);
                const checkDate = (d: Date) => d.toISOString().split('T')[0];
                
                while (true) {
                  const s = checkDate(curr);
                  if (allCompleted.includes(s)) {
                    streak++;
                    curr.setDate(curr.getDate() - 1);
                  } else {
                    break;
                  }
                }

                if (streak === 0) return null;

                return (
                  <span className="text-[10px] font-black text-orange-500 ml-1 uppercase tracking-tight flex items-center gap-0.5">
                    <span className="text-[12px]">🔥</span> {streak} Day Streak
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
