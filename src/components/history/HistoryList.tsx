'use client';

import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import HistoryTaskCard, { HistoryTaskCardProps } from './HistoryTaskCard';
import { motion } from 'framer-motion';
import useSWR from 'swr';

type DailyGroup = {
  date: string;
  tasks: HistoryTaskCardProps[];
};

type HistoryListProps = {
  history: DailyGroup[];
  onToggleTask: (id: string, date: string, currentStatus: boolean) => void;
  setFlyRef?: (key: string, el: HTMLDivElement | null) => void;
  visuallyCompleted?: Set<string>;
};

export default function HistoryList({ history, onToggleTask, setFlyRef, visuallyCompleted }: HistoryListProps) {
  const { data: tagsData } = useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json())
  );
  const userTags: { id: string; name: string; color: string }[] =
    tagsData?.tags || [];

  if (!history || history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="bg-muted/30 p-4 rounded-full mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-muted-foreground/50"
          >
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
            <path d="m9 16 2 2 4-4" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest mb-1">No Activity Found</h3>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          We couldn't find any tasks for this period. Try adjusting your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {history.map((day, groupIndex) => {
        const dateObj = new Date(day.date);
        let dateLabel = format(dateObj, 'EEEE, MMMM do');
        if (isToday(dateObj)) dateLabel = 'Today';
        if (isYesterday(dateObj)) dateLabel = 'Yesterday';

        // Count completed tasks for summary
        const completedCount = day.tasks.filter(t => t.completed).length;
        const totalCount = day.tasks.length;

        return (
          <motion.div
            key={day.date}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIndex * 0.1 }}
            className="space-y-3"
          >
            <div className="flex items-end justify-between px-1 py-2">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {dateLabel}
                </h3>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  {format(dateObj, 'yyyy')}
                </p>
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                {completedCount}/{totalCount} Completed
              </div>
            </div>

            <div className="grid gap-2">
              {day.tasks.map((task, i) => {
                const uniqueKey = `${day.date}::${task.id}`;
                return (
                  <HistoryTaskCard
                    key={uniqueKey}
                    id={task.id}
                    text={task.text}
                    completed={task.completed}
                    type={task.type}
                    tags={task.tags}
                    date={day.date}
                    onToggle={onToggleTask}
                    setFlyRef={(el) => setFlyRef?.(uniqueKey, el)}
                    isEaten={visuallyCompleted?.has(uniqueKey)}
                    userTags={userTags}
                  />
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}